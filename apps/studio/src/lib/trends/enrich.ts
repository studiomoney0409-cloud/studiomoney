/**
 * Trend Enrichment Layer.
 *
 * Takes raw TrendItem[] from all providers and augments each with real-time
 * context via entity resolution (KG), web search, URL extraction, and a
 * single batched LLM summarization call.
 *
 * Instagram-ref items already contain rich captions and need only KG enrichment.
 * Other sources (Spotify, YouTube, Naver, etc.) get the full treatment.
 */

import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { cacheGetJSON, cacheSetJSON } from "@/lib/redis";
import { webSearch, type WebSource } from "@/lib/pipeline/web-search";
import { extractFromUrl } from "@/lib/sns/linkExtractor";
import { syncArtistByName } from "@/lib/pipeline/kg-sync";
import { z } from "zod";
import type { TrendItem } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityContext {
  name: string;
  type: "artist" | "album" | "event" | "unknown";
  genres?: string[];
  activeFrom?: string;
  summary?: string;
}

export interface EnrichedTrendItem extends TrendItem {
  context?: string;
  entities?: EntityContext[];
  webSources?: Array<{ title: string; url: string; snippet: string }>;
}

interface ExtractedEntities {
  artists: string[];
  albums: string[];
  genres: string[];
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_ITEMS = 15;
const CACHE_TTL_ITEM = 2 * 60 * 60; // 2 hours
const CACHE_TTL_LLM = 15 * 60; // 15 minutes
const WEB_SEARCH_BUDGET = 5;
const URL_EXTRACT_BUDGET = 3;
const KG_SYNC_BUDGET = 3;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Enrich a list of trend items with real-time context.
 *
 * `niche` controls whether music-specific KG enrichment runs:
 * - "music" (or undefined for legacy callers): full KG lookup + Spotify sync
 * - other niches: skips KG/Spotify entirely; only web enrichment + LLM summary
 */
export async function enrichTrends(
  items: TrendItem[],
  opts?: { maxItems?: number; skipLlm?: boolean; niche?: string },
): Promise<EnrichedTrendItem[]> {
  const max = opts?.maxItems ?? MAX_ITEMS;
  const toEnrich = items.slice(0, max);
  const passthrough = items.slice(max);
  const isMusic = opts?.niche === "music" || opts?.niche === undefined;

  // Stage A: entity extraction (local, no API calls)
  const withEntities = toEnrich.map((item) => ({
    item,
    entities: extractEntities(item, { isMusic }),
  }));

  // Stage B: parallel KG + web enrichment (with per-item caching)
  const enriched = await enrichBatch(withEntities, { isMusic });

  // Stage C: batch LLM summarization
  if (!opts?.skipLlm) {
    await summarizeBatch(enriched);
  }

  // Pass-through items that didn't get enriched
  const passthroughEnriched: EnrichedTrendItem[] = passthrough.map((item) => ({
    ...item,
  }));

  return [...enriched, ...passthroughEnriched];
}

// ---------------------------------------------------------------------------
// Stage A: Entity extraction (local)
// ---------------------------------------------------------------------------

const GENRE_PATTERNS = [
  "k-pop", "kpop", "케이팝", "힙합", "hip-hop", "r&b", "알앤비",
  "인디", "indie", "록", "rock", "팝", "pop", "재즈", "jazz",
  "일렉트로닉", "electronic", "edm", "발라드", "ballad",
  "트로트", "trot", "클래식", "classical", "메탈", "metal",
  "소울", "soul", "펑크", "funk", "punk", "시티팝", "city pop",
];

const STOP_WORDS = new Set([
  "대해서", "에서의", "이라는", "에서는", "으로의", "라는", "에서",
  "대한", "통한", "위한", "관한", "따른", "에게", "부터",
  "까지", "처럼", "만큼", "대로", "트렌드", "분석", "리뷰",
]);

function extractEntities(item: TrendItem, opts: { isMusic: boolean }): ExtractedEntities {
  const text = `${item.title} ${item.description ?? ""}`;
  const entities: ExtractedEntities = {
    artists: [],
    albums: [],
    genres: [],
    keywords: [],
  };

  const lower = text.toLowerCase();

  if (opts.isMusic) {
    // Genres
    for (const g of GENRE_PATTERNS) {
      if (lower.includes(g)) entities.genres.push(g);
    }

    // Quoted strings → album/song names
    const quoted = text.match(/[""'']([^""'']+)[""'']/g);
    if (quoted) {
      for (const q of quoted) {
        entities.albums.push(q.replace(/[""'']/g, ""));
      }
    }
  }

  // Capitalized English names (multi-word)
  const englishNames = text.match(/[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+/g);
  if (englishNames) entities.artists.push(...englishNames);

  // Spotify/Instagram patterns: "Artist — Track"
  const dashPattern = text.match(/^(?:@\w+:\s*)?(.+?)\s*[—–-]\s*(.+)/);
  if (dashPattern) {
    const possibleArtist = dashPattern[1]?.trim();
    if (possibleArtist && !possibleArtist.startsWith("[")) {
      entities.artists.push(possibleArtist);
    }
  }

  // Korean keywords (3+ chars)
  const koreanWords = text.match(/[가-힣]{3,}/g) ?? [];
  for (const w of koreanWords) {
    if (!STOP_WORDS.has(w) && entities.keywords.length < 5) {
      entities.keywords.push(w);
    }
  }

  // Deduplicate
  entities.artists = [...new Set(entities.artists)];
  entities.albums = [...new Set(entities.albums)];
  entities.genres = [...new Set(entities.genres)];
  entities.keywords = [...new Set(entities.keywords)];

  return entities;
}

// ---------------------------------------------------------------------------
// Stage B: KG + Web enrichment (parallel, cached)
// ---------------------------------------------------------------------------

interface EnrichmentInput {
  item: TrendItem;
  entities: ExtractedEntities;
}

async function enrichBatch(
  inputs: EnrichmentInput[],
  opts: { isMusic: boolean },
): Promise<EnrichedTrendItem[]> {
  let webSearchCount = 0;
  let urlExtractCount = 0;
  let kgSyncCount = 0;

  async function enrichOne(input: EnrichmentInput): Promise<EnrichedTrendItem> {
    const { item, entities } = input;
    const cacheKey = `enrich:${item.source}:${hashStr(item.title)}`;

    // Check cache
    const cached = await cacheGetJSON<EnrichedTrendItem>(cacheKey);
    if (cached) return cached;

    const result: EnrichedTrendItem = { ...item, entities: [] };
    const webSources: WebSource[] = [];

    // Music-only: KG (MusicArtist) lookup + Spotify sync fallback
    if (opts.isMusic) for (const artistName of entities.artists.slice(0, 3)) {
      const artist = await prisma.musicArtist.findFirst({
        where: {
          OR: [
            { name: { equals: artistName, mode: "insensitive" } },
            { nameKo: { equals: artistName, mode: "insensitive" } },
            { aliases: { has: artistName } },
          ],
        },
        select: {
          name: true,
          nameKo: true,
          genres: true,
          activeFrom: true,
          popularity: true,
          albums: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { title: true, titleKo: true, releaseDate: true },
          },
        },
      });

      if (artist) {
        const recentAlbum = artist.albums[0];
        result.entities!.push({
          name: artist.nameKo || artist.name,
          type: "artist",
          genres: artist.genres.slice(0, 3),
          activeFrom: artist.activeFrom ?? undefined,
          summary: recentAlbum
            ? `최근 앨범: '${recentAlbum.titleKo || recentAlbum.title}' (${recentAlbum.releaseDate ?? ""})`
            : undefined,
        });
      } else if (kgSyncCount < KG_SYNC_BUDGET) {
        // Try to sync from Spotify
        kgSyncCount++;
        try {
          const syncResult = await syncArtistByName(artistName);
          if (syncResult) {
            const synced = await prisma.musicArtist.findUnique({
              where: { id: syncResult.artist.id },
              select: { name: true, nameKo: true, genres: true, activeFrom: true },
            });
            if (synced) {
              result.entities!.push({
                name: synced.nameKo || synced.name,
                type: "artist",
                genres: synced.genres.slice(0, 3),
                activeFrom: synced.activeFrom ?? undefined,
              });
            }
          }
        } catch {
          // Spotify sync failed, skip
        }
      }
    }

    // Album entities (music-specific buckets are empty for non-music niches)
    if (opts.isMusic) {
      for (const albumName of entities.albums.slice(0, 2)) {
        result.entities!.push({ name: albumName, type: "album" });
      }
    }

    // Web search (only for non-Instagram sources, within budget)
    const isInstagram = item.source === "instagram-ref";
    if (!isInstagram && webSearchCount < WEB_SEARCH_BUDGET) {
      webSearchCount++;
      try {
        const results = await webSearch(item.title, {
          limit: 2,
          freshness: "week",
        });
        webSources.push(...results);
      } catch {
        // web search failed, continue
      }
    }

    // URL content extraction (non-Instagram, within budget)
    if (!isInstagram && item.url && urlExtractCount < URL_EXTRACT_BUDGET) {
      urlExtractCount++;
      try {
        const extracted = await extractFromUrl(item.url);
        if (extracted.success && extracted.text) {
          // Use excerpt as additional context for LLM summarization
          webSources.push({
            title: extracted.title,
            url: item.url,
            snippet: extracted.excerpt,
            provider: "url-extract",
          });
        }
      } catch {
        // extraction failed, continue
      }
    }

    if (webSources.length > 0) {
      result.webSources = webSources.map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
      }));
    }

    // Cache (without context — that's added in Stage C)
    void cacheSetJSON(cacheKey, result, CACHE_TTL_ITEM);

    return result;
  }

  // Process in batches of 5 to control concurrency
  const results: EnrichedTrendItem[] = [];
  for (let i = 0; i < inputs.length; i += 5) {
    const batch = inputs.slice(i, i + 5);
    const batchResults = await Promise.allSettled(batch.map(enrichOne));
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j]!;
      results.push(
        r.status === "fulfilled" ? r.value : { ...batch[j]!.item },
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Stage C: Batch LLM summarization
// ---------------------------------------------------------------------------

const SummarySchema = z.object({
  contexts: z.array(
    z.object({
      index: z.number(),
      context: z.string(),
    }),
  ),
});

async function summarizeBatch(items: EnrichedTrendItem[]): Promise<void> {
  // Skip if all items already have context (from earlier enrichment)
  if (items.every((i) => i.context)) return;

  // Check LLM cache
  const itemsHash = hashStr(items.map((i) => `${i.source}:${i.title}`).join("|"));
  const cacheKey = `enrich-llm:${itemsHash}`;
  const cached = await cacheGetJSON<Array<{ index: number; context: string }>>(cacheKey);
  if (cached) {
    for (const c of cached) {
      if (items[c.index]) items[c.index]!.context = c.context;
    }
    return;
  }

  // Build prompt
  const itemDescriptions = items.map((item, i) => {
    const parts = [`${i}. [${item.source}] ${item.title}`];
    if (item.description) parts.push(`   설명: ${item.description.slice(0, 200)}`);
    if (item.entities && item.entities.length > 0) {
      for (const e of item.entities) {
        const info = [e.name, e.type];
        if (e.genres?.length) info.push(`장르: ${e.genres.join(", ")}`);
        if (e.activeFrom) info.push(`활동시작: ${e.activeFrom}`);
        if (e.summary) info.push(e.summary);
        parts.push(`   엔티티: ${info.join(" | ")}`);
      }
    }
    if (item.webSources && item.webSources.length > 0) {
      for (const ws of item.webSources) {
        parts.push(`   웹소스: ${ws.title} — ${ws.snippet.slice(0, 150)}`);
      }
    }
    return parts.join("\n");
  });

  const prompt = `아래 트렌드 항목들에 대해 각각 2-3문장의 팩트 기반 컨텍스트를 작성하세요.

규칙:
- 제공된 엔티티/웹소스 데이터만 사용, 추측하지 말 것
- 아티스트의 활동시작 연도가 있으면 반드시 포함 (신인/기존 판단용)
- 최근 활동, 장르, 규모 등 핵심 사실만 간결하게
- 데이터가 부족한 항목은 "정보 부족"이라고 명시

${itemDescriptions.join("\n\n")}

Return JSON:
{
  "contexts": [
    {"index": 0, "context": "팩트 기반 2-3문장 요약"},
    ...
  ]
}`;

  try {
    const result = await callGptJson(prompt, {
      caller: "trend-enrich",
      schema: SummarySchema,
      maxTokens: 2000,
      timeoutMs: 20_000,
    });

    for (const c of result.contexts) {
      if (items[c.index]) items[c.index]!.context = c.context;
    }

    // Cache
    void cacheSetJSON(cacheKey, result.contexts, CACHE_TTL_LLM);
  } catch (err) {
    console.error("[trend-enrich] LLM summarization failed:", err);
    // Non-fatal: items will just lack context summaries
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return Math.abs(hash).toString(36);
}
