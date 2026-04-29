import type { TrendItem, TrendProvider } from "./types";
import { naverDatalabProvider } from "./naver-datalab";
import { naverSearchProvider } from "./naver-search";
import { youtubeProvider } from "./youtube";
import { googleTrendsProvider } from "./google";
import { spotifyProvider } from "./spotify";
import { redditProvider } from "./reddit";
import { hackerNewsProvider } from "./hackernews";
import { logger } from "@/lib/logger";
import { cacheGetJSON, cacheSetJSON } from "@/lib/redis";
import { DEFAULT_NICHE_CONTEXT, type NicheContext } from "@/lib/niche/context";

export type { TrendItem } from "./types";
export type { EnrichedTrendItem } from "./enrich";

// ---------------------------------------------------------------------------
// Cache — Redis (shared across instances) with in-memory L1 for same-process
// ---------------------------------------------------------------------------

const CACHE_TTL_SEC = 15 * 60; // 15 minutes

interface CacheEntry {
  items: TrendItem[];
  nicheItems: TrendItem[];
  fetchedAt: number;
  keyHash: string;
}

let memCache: CacheEntry | null = null;

function keyHash(kws: string[]): string {
  return kws.sort().join("|");
}

function trendCacheKey(kh: string, niche: string): string {
  return `trends:${niche}:${kh}`;
}

// ---------------------------------------------------------------------------
// Provider selection — driven by NicheContext.trendSources flags
// ---------------------------------------------------------------------------

function selectGlobalProviders(ctx: NicheContext): TrendProvider[] {
  const out: TrendProvider[] = [];
  const s = ctx.trendSources;
  if (s.google) out.push(googleTrendsProvider);
  if (s.youtube) out.push(youtubeProvider);
  if (s.reddit) out.push(redditProvider);
  if (s.spotify) out.push(spotifyProvider);
  if (s.hackernews) out.push(hackerNewsProvider);
  return out;
}

function selectNicheProviders(ctx: NicheContext): TrendProvider[] {
  const out: TrendProvider[] = [];
  const s = ctx.trendSources;
  if (s.naverDataLab) out.push(naverDatalabProvider);
  if (s.naverSearch) out.push(naverSearchProvider);
  return out;
}

/**
 * Fetch trends from all providers configured by the workspace's NicheContext.
 * - Global trends: providers flagged in ctx.trendSources (Google/YouTube/Reddit/Spotify/HN)
 * - Niche trends (if keywords provided): Naver DataLab/Search when enabled
 *
 * Results are cached for 15 minutes per (niche, keyword-hash) pair.
 */
export async function fetchTrends(
  topicKeywords?: string[],
  ctx: NicheContext = DEFAULT_NICHE_CONTEXT,
): Promise<{ global: TrendItem[]; niche: TrendItem[] }> {
  const kws = topicKeywords ?? [];
  const kh = keyHash(kws);

  // L1: in-memory same-process hit (per niche)
  if (memCache && memCache.keyHash === `${ctx.niche}:${kh}` && Date.now() - memCache.fetchedAt < CACHE_TTL_SEC * 1000) {
    return { global: memCache.items, niche: memCache.nicheItems };
  }

  // L2: Redis shared cache
  const cacheKey = trendCacheKey(kh, ctx.niche);
  const redisHit = await cacheGetJSON<CacheEntry>(cacheKey);
  if (redisHit && Date.now() - redisHit.fetchedAt < CACHE_TTL_SEC * 1000) {
    memCache = redisHit;
    return { global: redisHit.items, niche: redisHit.nicheItems };
  }

  const globalProviders = selectGlobalProviders(ctx);
  const nicheProviders = selectNicheProviders(ctx);

  // Lazy-load Instagram ref provider (heavy deps — avoid module-level import)
  let igProvider: TrendProvider | null = null;
  if (ctx.trendSources.instagramRef) {
    try {
      const mod = await import("./instagram-ref");
      igProvider = mod.instagramRefProvider;
    } catch {
      logger.warn("instagram-ref provider unavailable (DB migration may be pending)");
    }
  }

  const allGlobalProviders = igProvider ? [igProvider, ...globalProviders] : globalProviders;

  const providerOpts = { keywords: kws, geo: ctx.region, subreddits: ctx.redditSubs };

  // Fetch global + niche in parallel
  const [globalResults, nicheResults] = await Promise.all([
    Promise.allSettled(allGlobalProviders.map((p) => p.fetch(providerOpts))),
    kws.length > 0
      ? Promise.allSettled(nicheProviders.map((p) => p.fetch(providerOpts)))
      : Promise.resolve([]),
  ]);

  const globalItems: TrendItem[] = [];
  globalResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      globalItems.push(...r.value);
    } else {
      logger.warn({ source: allGlobalProviders[i]?.name, error: String(r.reason) }, "trend fetch failed");
    }
  });

  const nicheItems: TrendItem[] = [];
  nicheResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      nicheItems.push(...r.value);
    } else {
      logger.warn({ source: nicheProviders[i]?.name, error: String(r.reason) }, "niche trend fetch failed");
    }
  });

  const entry: CacheEntry = { items: globalItems, nicheItems, fetchedAt: Date.now(), keyHash: `${ctx.niche}:${kh}` };
  memCache = entry;
  void cacheSetJSON(cacheKey, entry, CACHE_TTL_SEC);
  return { global: globalItems, niche: nicheItems };
}

/**
 * Format trends into a text block suitable for LLM prompt injection.
 * Separates general trends, keyword-matched global trends, and niche trends.
 */
export function formatTrendsForPrompt(
  global: TrendItem[],
  niche: TrendItem[],
  maxPerSection = 10,
): string {
  const parts: string[] = [];

  // Split global items into general trends and keyword-matched trends
  const generalItems = global.filter((t) => !t.keyword);
  const keywordItems = global.filter((t) => t.keyword);

  if (generalItems.length > 0) {
    parts.push("## 오늘의 트렌드 (실시간 데이터)");
    parts.push(
      ...generalItems.slice(0, maxPerSection).map(
        (t, i) =>
          `${i + 1}. [${t.source}] ${t.title}${t.description ? ` — ${t.description}` : ""}${t.url ? ` (${t.url})` : ""}`,
      ),
    );
  }

  if (keywordItems.length > 0) {
    parts.push("\n## 키워드 관련 트렌드 (글로벌 소스)");
    parts.push(
      ...keywordItems.slice(0, maxPerSection).map(
        (t, i) =>
          `${i + 1}. [${t.source}] "${t.keyword}" → ${t.title}${t.description ? ` — ${t.description}` : ""}${t.url ? ` (${t.url})` : ""}`,
      ),
    );
  }

  if (niche.length > 0) {
    parts.push("\n## 내 분야 최신 동향 (뉴스/블로그)");
    parts.push(
      ...niche.slice(0, maxPerSection).map(
        (t, i) =>
          `${i + 1}. [${t.source}] ${t.title}${t.description ? ` — ${t.description}` : ""}${t.url ? ` (${t.url})` : ""}`,
      ),
    );
  }

  return parts.length > 0 ? parts.join("\n") : "(트렌드 데이터 없음)";
}

/**
 * Format enriched trends with inline context summaries.
 * Instagram-ref items get their own top section.
 */
export function formatEnrichedTrendsForPrompt(
  global: import("./enrich").EnrichedTrendItem[],
  niche: import("./enrich").EnrichedTrendItem[],
  maxPerSection = 10,
): string {
  const parts: string[] = [];

  // Separate Instagram-ref items from other global items
  const igItems = global.filter((t) => t.source === "instagram-ref");
  const otherGeneral = global.filter((t) => t.source !== "instagram-ref" && !t.keyword);
  const keywordItems = global.filter((t) => t.keyword);

  function formatItem(t: import("./enrich").EnrichedTrendItem, i: number): string {
    const lines = [
      `${i + 1}. [${t.source}] ${t.title}${t.description ? ` — ${t.description.split("\n")[0]?.slice(0, 100)}` : ""}`,
    ];
    if (t.context) lines.push(`   맥락: ${t.context}`);
    if (t.url) lines.push(`   출처: ${t.url}`);
    return lines.join("\n");
  }

  if (igItems.length > 0) {
    parts.push("## 인스타그램 레퍼런스 피드 (모니터링 계정 직접 게시)");
    parts.push(
      ...igItems.slice(0, maxPerSection).map(formatItem),
    );
  }

  if (otherGeneral.length > 0) {
    parts.push("\n## 오늘의 트렌드 (실시간 데이터)");
    parts.push(
      ...otherGeneral.slice(0, maxPerSection).map(formatItem),
    );
  }

  if (keywordItems.length > 0) {
    parts.push("\n## 키워드 관련 트렌드 (글로벌 소스)");
    parts.push(
      ...keywordItems.slice(0, maxPerSection).map((t, i) => {
        const lines = [
          `${i + 1}. [${t.source}] "${t.keyword}" → ${t.title}${t.description ? ` — ${t.description.split("\n")[0]?.slice(0, 100)}` : ""}`,
        ];
        if (t.context) lines.push(`   맥락: ${t.context}`);
        if (t.url) lines.push(`   출처: ${t.url}`);
        return lines.join("\n");
      }),
    );
  }

  if (niche.length > 0) {
    parts.push("\n## 내 분야 최신 동향 (뉴스/블로그)");
    parts.push(
      ...niche.slice(0, maxPerSection).map(formatItem),
    );
  }

  return parts.length > 0 ? parts.join("\n") : "(트렌드 데이터 없음)";
}
