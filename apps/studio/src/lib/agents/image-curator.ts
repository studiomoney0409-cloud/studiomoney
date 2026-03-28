/**
 * Image Curator — searches for candidate images after Content Producer completes.
 *
 * Uses the existing unified image search API logic (Google CSE, Unsplash, Pexels, Spotify).
 */
import { callGptJson } from "@/lib/llm";
import { fetchWithTimeout } from "@/lib/fetch-utils";
import { z } from "zod";
import type { AgentContext } from "./types";

interface ImageCandidate {
  id: string;
  source: string;
  previewUrl: string;
  fullUrl: string;
  sourceUrl: string;
  author: string;
  attribution: string;
  width: number;
  height: number;
}

interface ImageCurationResult {
  imageGateId: string;
  candidateCount: number;
  searchQueries: string[];
}

export async function searchCandidateImages(
  ctx: AgentContext,
  opts: {
    topic: string;
    articleSummary: string;
    platforms: string[];
    personaId?: string;
    pipelineRunId?: string;
  },
): Promise<ImageCurationResult> {
  await ctx.log("info", `Searching images for: "${opts.topic}"`);

  // 1. Extract search keywords from topic via LLM
  let searchQueries: string[] = [];
  try {
    const extracted = await callGptJson(
      `주제: "${opts.topic}"

이 음악 매거진 기사에 사용할 이미지를 찾기 위한 검색어 3개를 생성하세요.
- 1번: 아티스트/밴드명 + 앨범명 (구체적)
- 2번: 아티스트명 + "live" 또는 "concert" (공연 사진)
- 3번: 분위기 키워드 (영어, Unsplash용)

검색어는 영어로 작성하세요.`,
      {
        caller: "image-curator",
        schema: z.object({
          queries: z.array(z.string()),
        }),
      },
    );
    searchQueries = extracted.queries.slice(0, 3);
  } catch {
    // Fallback: use topic as-is
    searchQueries = [opts.topic, `${opts.topic} music`, `${opts.topic} concert`];
  }

  await ctx.log("info", `Search queries: ${searchQueries.join(" | ")}`);

  // 2. Search images from multiple sources
  const allCandidates: ImageCandidate[] = [];

  for (const query of searchQueries) {
    // Google CSE
    const googleResults = await searchGoogle(query);
    allCandidates.push(...googleResults);

    // Unsplash
    const unsplashResults = await searchUnsplash(query);
    allCandidates.push(...unsplashResults);
  }

  // Spotify album art (search by topic directly)
  const spotifyResults = await searchSpotify(opts.topic);
  allCandidates.push(...spotifyResults);

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allCandidates.filter((c) => {
    if (seen.has(c.fullUrl)) return false;
    seen.add(c.fullUrl);
    return true;
  });

  // Limit to 12 candidates
  const candidates = unique.slice(0, 12);

  await ctx.log("info", `Found ${candidates.length} unique candidates from ${allCandidates.length} total`);

  // 3. Create ImageGate record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gate = await ctx.prisma.imageGate.create({
    data: {
      agentRunId: ctx.runId,
      topic: opts.topic,
      articleSummary: opts.articleSummary.slice(0, 500),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidates: candidates as any,
      status: "pending",
      platforms: opts.platforms,
      personaId: opts.personaId ?? null,
      pipelineRunId: opts.pipelineRunId ?? null,
    },
  });

  await ctx.log("info", `ImageGate created: ${gate.id} (${candidates.length} candidates, status: pending)`);

  return {
    imageGateId: gate.id,
    candidateCount: candidates.length,
    searchQueries,
  };
}

// ── Search Providers ──────────────────────────────────

async function searchGoogle(query: string): Promise<ImageCandidate[]> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      cx,
      key,
      searchType: "image",
      num: "6",
      safe: "active",
    });
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { timeout: 8_000 },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.items as Array<Record<string, unknown>>) ?? []).map((item, i) => ({
      id: `google-${query.slice(0, 10)}-${i}`,
      source: "google",
      previewUrl: (item.image as Record<string, string>)?.thumbnailLink ?? "",
      fullUrl: (item.link as string) ?? "",
      sourceUrl: (item.image as Record<string, string>)?.contextLink ?? "",
      author: ((item.displayLink as string) ?? "").replace("www.", ""),
      attribution: `Image from ${(item.displayLink as string) ?? "web"}`,
      width: Number((item.image as Record<string, number>)?.width ?? 0),
      height: Number((item.image as Record<string, number>)?.height ?? 0),
    }));
  } catch {
    return [];
  }
}

async function searchUnsplash(query: string): Promise<ImageCandidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  try {
    const params = new URLSearchParams({ query, per_page: "4", page: "1" });
    const res = await fetchWithTimeout(
      `https://api.unsplash.com/search/photos?${params}`,
      { timeout: 8_000, headers: { Authorization: `Client-ID ${key}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results as Array<Record<string, unknown>>) ?? []).map((p: Record<string, unknown>) => ({
      id: `unsplash-${p.id}`,
      source: "unsplash",
      previewUrl: (p.urls as Record<string, string>)?.small ?? "",
      fullUrl: (p.urls as Record<string, string>)?.regular ?? "",
      sourceUrl: (p.links as Record<string, string>)?.html ?? "",
      author: (p.user as Record<string, string>)?.name ?? "",
      attribution: `Photo by ${(p.user as Record<string, string>)?.name ?? "unknown"} on Unsplash`,
      width: (p.width as number) ?? 0,
      height: (p.height as number) ?? 0,
    }));
  } catch {
    return [];
  }
}

async function searchSpotify(query: string): Promise<ImageCandidate[]> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    // Get token
    const tokenRes = await fetchWithTimeout("https://accounts.spotify.com/api/token", {
      timeout: 5_000,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) return [];
    const { access_token } = await tokenRes.json();

    // Search albums
    const params = new URLSearchParams({ q: query, type: "album", limit: "4" });
    const res = await fetchWithTimeout(
      `https://api.spotify.com/v1/search?${params}`,
      { timeout: 8_000, headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.albums?.items as Array<Record<string, unknown>>) ?? [])
      .filter((a: Record<string, unknown>) => (a.images as Array<Record<string, unknown>>)?.length)
      .map((a: Record<string, unknown>) => {
        const images = a.images as Array<Record<string, unknown>>;
        return {
          id: `spotify-${a.id}`,
          source: "spotify",
          previewUrl: (images[1]?.url as string) ?? (images[0]?.url as string) ?? "",
          fullUrl: (images[0]?.url as string) ?? "",
          sourceUrl: (a.external_urls as Record<string, string>)?.spotify ?? "",
          author: ((a.artists as Array<Record<string, string>>)?.[0]?.name) ?? "",
          attribution: `Album art: ${a.name}`,
          width: (images[0]?.width as number) ?? 640,
          height: (images[0]?.height as number) ?? 640,
        };
      });
  } catch {
    return [];
  }
}
