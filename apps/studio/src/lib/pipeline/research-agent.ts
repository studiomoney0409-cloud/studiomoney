import { prisma } from "@/lib/db";
import { searchHybrid } from "./embedding";
import { webSearch } from "./web-search";
import type { ResearchPacket, PersonaContext } from "./types";
import { cacheGetJSON, cacheSetJSON } from "@/lib/redis";

const RESEARCH_CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours

function researchCacheKey(topic: string, workspaceId?: string): string {
  const scope = workspaceId ?? "global";
  return `research:${scope}:${topic.toLowerCase().trim()}`;
}

/**
 * Research Agent — gathers context from Knowledge Graph, RAG, and web search.
 * Assembles a research packet for Outline and Writer agents.
 */
export async function gatherResearch(
  topic: string,
  opts?: {
    persona?: PersonaContext | null;
    contentType?: string;
    workspaceId?: string;
  },
): Promise<ResearchPacket> {
  // Check Redis cache first (same topic within 24h, scoped per workspace when provided)
  const cacheKey = researchCacheKey(topic, opts?.workspaceId);
  const cached = await cacheGetJSON<ResearchPacket>(cacheKey);
  if (cached) return cached;

  // Step 1: Extract entities locally (no LLM call)
  const entities = extractEntitiesLocal(topic);

  // Step 2: All lookups in parallel — KG, RAG, and Web Search
  const searchQueries = buildSearchQueries(topic, entities);

  const [artistData, relatedArticles, webResults] = await Promise.all([
    lookupArtists(entities.artists),
    searchRelatedArticles(topic, opts?.persona?.name),
    searchWeb(searchQueries),
  ]);

  // Step 2.5: Enrich entities from KG results
  if (artistData.length > 0) {
    for (const a of artistData) {
      if (!entities.artists.includes(a.name)) entities.artists.push(a.name);
      for (const g of a.genres) {
        if (!entities.genres.includes(g)) entities.genres.push(g);
      }
    }
  }

  // Step 3: Assemble research packet
  const packet: ResearchPacket = {
    topic,
    entities,
    artists: artistData,
    relatedArticles,
    webSources: webResults,
  };

  void cacheSetJSON(cacheKey, packet, RESEARCH_CACHE_TTL_SEC);
  return packet;
}

// -- Web search --

function buildSearchQueries(
  topic: string,
  entities: ExtractedEntities,
): string[] {
  const queries = [topic];

  // Add entity-specific queries for richer results
  if (entities.artists.length > 0) {
    queries.push(`${entities.artists[0]} ${entities.keywords[0] ?? ""} 2026`.trim());
  }
  if (entities.albums.length > 0) {
    queries.push(`${entities.albums[0]} 리뷰`);
  }

  return queries.slice(0, 3); // max 3 queries to limit API usage
}

async function searchWeb(
  queries: string[],
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const seen = new Set<string>();
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  for (const q of queries) {
    try {
      const sources = await webSearch(q, { limit: 3, freshness: "month" });
      for (const s of sources) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        results.push({ title: s.title, url: s.url, snippet: s.snippet });
      }
    } catch {
      // Non-fatal
    }
  }

  return results.slice(0, 8); // cap total web sources
}

// -- Entity extraction (local — no LLM call) --

interface ExtractedEntities {
  artists: string[];
  albums: string[];
  genres: string[];
  keywords: string[];
}

/**
 * Extract entities from topic using Knowledge Graph lookup + text analysis.
 * Replaces LLM call to save ~500 tokens per article.
 */
function extractEntitiesLocal(topic: string): ExtractedEntities {
  const entities: ExtractedEntities = {
    artists: [],
    albums: [],
    genres: [],
    keywords: [],
  };

  // Known genre patterns (Korean + English)
  const genrePatterns = [
    "k-pop", "kpop", "케이팝", "힙합", "hip-hop", "r&b", "알앤비",
    "인디", "indie", "록", "rock", "팝", "pop", "재즈", "jazz",
    "일렉트로닉", "electronic", "edm", "발라드", "ballad",
    "트로트", "trot", "클래식", "classical", "메탈", "metal",
    "소울", "soul", "펑크", "funk", "punk", "레게", "reggae",
    "컨트리", "country", "블루스", "blues", "앰비언트", "ambient",
    "시티팝", "city pop",
  ];

  const lowerTopic = topic.toLowerCase();

  for (const g of genrePatterns) {
    if (lowerTopic.includes(g)) {
      entities.genres.push(g);
    }
  }

  // Extract quoted strings as potential album/song names
  const quoted = topic.match(/[""'']([^""'']+)[""'']/g);
  if (quoted) {
    for (const q of quoted) {
      entities.albums.push(q.replace(/[""'']/g, ""));
    }
  }

  // Extract capitalized English words (2+ words) as potential artist names
  const englishNames = topic.match(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+/g);
  if (englishNames) {
    entities.artists.push(...englishNames);
  }

  // Extract meaningful Korean keywords (3+ chars, exclude common particles)
  const koreanWords = topic.match(/[가-힣]{3,}/g) ?? [];
  const stopWords = new Set([
    "대해서", "에서의", "이라는", "에서는", "으로의", "라는", "에서",
    "대한", "통한", "위한", "관한", "따른", "에게", "부터",
    "까지", "처럼", "만큼", "대로", "트렌드", "분석", "리뷰",
  ]);

  for (const w of koreanWords) {
    if (!stopWords.has(w) && entities.keywords.length < 5) {
      entities.keywords.push(w);
    }
  }

  return entities;
}

// -- Knowledge Graph lookup --

interface ArtistInfo {
  name: string;
  nameKo: string;
  genres: string[];
  bio: string;
  popularity: number;
  albums: Array<{ title: string; releaseDate: string | null; albumType: string }>;
  relatedArtists: Array<{ name: string; relationType: string }>;
}

async function lookupArtists(artistNames: string[]): Promise<ArtistInfo[]> {
  if (artistNames.length === 0) return [];

  const results: ArtistInfo[] = [];

  for (const name of artistNames.slice(0, 5)) {
    const artist = await prisma.musicArtist.findFirst({
      where: {
        OR: [
          { name: { contains: name, mode: "insensitive" } },
          { nameKo: { contains: name, mode: "insensitive" } },
          { aliases: { has: name } },
        ],
      },
      include: {
        albums: {
          orderBy: { releaseDate: "desc" },
          take: 5,
          select: { title: true, releaseDate: true, albumType: true },
        },
        relationsFrom: {
          include: { toArtist: { select: { name: true } } },
          take: 5,
        },
      },
    });

    if (artist) {
      results.push({
        name: artist.name,
        nameKo: artist.nameKo,
        genres: artist.genres,
        bio: artist.bioKo || artist.bio,
        popularity: artist.popularity,
        albums: artist.albums.map((a) => ({
          title: a.title,
          releaseDate: a.releaseDate,
          albumType: a.albumType,
        })),
        relatedArtists: artist.relationsFrom.map((r) => ({
          name: r.toArtist.name,
          relationType: r.relationType,
        })),
      });
    }
  }

  return results;
}

// -- RAG: related past articles --

interface RelatedArticle {
  content: string;
  sourceType: string;
  score: number;
}

async function searchRelatedArticles(
  topic: string,
  personaName?: string,
): Promise<RelatedArticle[]> {
  try {
    const chunks = await searchHybrid(topic, { limit: 5 });
    return chunks
      .filter((c) => c.score > 0.3) // relevance threshold
      .map((c) => ({
        content: c.content,
        sourceType: c.sourceType,
        score: c.score,
      }));
  } catch {
    // pgvector extension may not be enabled yet, or no chunks exist
    return [];
  }
}
