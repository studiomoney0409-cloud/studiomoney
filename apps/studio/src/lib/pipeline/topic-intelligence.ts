/**
 * Topic Intelligence Agent
 *
 * Collects trends → interprets as content topics → scores (5-factor) →
 * dedup via RAG → cooling check → exploration budget → ranked output.
 *
 * Designed as a general-purpose magazine/marketing tool with optional
 * domain-specific enrichment (e.g. Music KG).
 */
import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { fetchTrends, formatTrendsForPrompt } from "@/lib/trends";
import { searchHybrid } from "./embedding";
import type { ContentType } from "./types";

// ── Types ──────────────────────────────────────────────

export interface TopicScore {
  relevance: number;   // 0-1 brand/domain fit
  timeliness: number;  // 0-1 trend strength + recency + velocity
  audienceFit: number; // 0-1 target audience match
  originality: number; // 0-1 vs our past content (RAG dedup)
  coverageGap: number; // 0-1 underserved topic area
  velocity: number;    // 0-1 data-driven trend acceleration (from TrendSnapshot)
  overall: number;     // weighted average
}

export interface TopicBrief {
  topic: string;
  angle: string;
  contentType: ContentType;
  score: TopicScore;
  trendSources: string[];
  relatedEntities: string[];  // KG-matched or LLM-extracted entities
  reasoning: string;
  isExploration: boolean;
}

interface TopicIntelligenceInput {
  /** Seed keywords for niche trend search */
  keywords?: string[];
  /** Preferred content types */
  contentTypes?: ContentType[];
  /** How many topics to return */
  count?: number;
  /** Exploration budget ratio (0-1, default 0.2) */
  explorationRatio?: number;
  /** Brand/domain description for relevance scoring */
  brandContext?: string;
  /** Target audience description */
  audienceContext?: string;
}

const SCORE_WEIGHTS = {
  relevance: 0.25,
  timeliness: 0.25,
  audienceFit: 0.20,
  originality: 0.15,
  coverageGap: 0.15,
};

const DEDUP_THRESHOLD = 0.80;
const DEFAULT_COOLING_DAYS = 14;

// ── Main entry point ───────────────────────────────────

export async function discoverTopics(
  input: TopicIntelligenceInput = {},
): Promise<TopicBrief[]> {
  const count = input.count ?? 10;
  const explorationRatio = input.explorationRatio ?? 0.2;

  // Step 1: Collect trends + persist snapshots
  const { global, niche } = await fetchTrends(input.keywords);
  await persistTrendSnapshots([...global, ...niche]);

  // Step 2: Calculate cross-source frequency (trending across multiple sources = stronger signal)
  const crossSourceMap = buildCrossSourceMap([...global, ...niche]);

  // Step 3: LLM — interpret trends as content topics
  const rawTopics = await interpretTrends({
    global,
    niche,
    brandContext: input.brandContext,
    audienceContext: input.audienceContext,
    contentTypes: input.contentTypes,
    count: Math.ceil(count * 1.5), // generate extra for filtering
  });

  // Step 4: Enrich scores
  const enriched = await Promise.all(
    rawTopics.map((t) => enrichTopic(t, crossSourceMap, input)),
  );

  // Step 5: Filter — dedup + cooling
  const filtered = await filterTopics(enriched);

  // Step 6: Split exploitation vs exploration
  const exploitCount = Math.ceil(count * (1 - explorationRatio));
  const exploreCount = count - exploitCount;

  // Exploitation: top scored topics
  const sorted = filtered.sort((a, b) => b.score.overall - a.score.overall);
  const exploitation = sorted.slice(0, exploitCount);

  // Exploration: random selection from lower-ranked topics with novelty bonus
  const remaining = sorted.slice(exploitCount);
  const exploration = selectExploration(remaining, exploreCount);

  return [...exploitation, ...exploration].slice(0, count);
}

// ── Step 1: Persist trend snapshots ────────────────────

interface TrendLike {
  title: string;
  source: string;
  url?: string;
  description?: string;
  rank?: number;
  fetchedAt: Date;
}

async function persistTrendSnapshots(items: TrendLike[]): Promise<void> {
  if (items.length === 0) return;

  // Batch create — skip duplicates from same day
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
  const workspaceId = await fallbackWorkspaceId();
  if (!workspaceId) return;

  for (const item of items) {
    try {
      await prisma.trendSnapshot.create({
        data: {
          workspaceId,
          source: item.source,
          title: item.title,
          url: item.url ?? "",
          description: item.description ?? "",
          rank: item.rank ?? 0,
          fetchedAt: item.fetchedAt,
        },
      });
    } catch {
      // Ignore duplicates or transient errors
    }
  }
}

// ── Step 2: Cross-source frequency map ─────────────────

function buildCrossSourceMap(items: TrendLike[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const key = item.title.toLowerCase().trim();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(item.source);
  }
  return map;
}

// ── Step 3: LLM trend interpretation ───────────────────

interface RawTopic {
  topic: string;
  angle: string;
  contentType: ContentType;
  trendSources: string[];
  relatedEntities: string[];
  reasoning: string;
  relevance: number;
  timeliness: number;
  audienceFit: number;
}

async function interpretTrends(opts: {
  global: TrendLike[];
  niche: TrendLike[];
  brandContext?: string;
  audienceContext?: string;
  contentTypes?: ContentType[];
  count: number;
}): Promise<RawTopic[]> {
  const trendText = formatTrendsForPrompt(
    opts.global as Parameters<typeof formatTrendsForPrompt>[0],
    opts.niche as Parameters<typeof formatTrendsForPrompt>[1],
  );

  const brandDesc = opts.brandContext
    ? `\nBrand/Domain: ${opts.brandContext}`
    : "\nBrand/Domain: General content magazine";

  const audienceDesc = opts.audienceContext
    ? `\nTarget Audience: ${opts.audienceContext}`
    : "";

  const contentTypeList = opts.contentTypes?.length
    ? opts.contentTypes.join(", ")
    : "blog, sns, carousel, review";

  const prompt = `You are a content strategist analyzing trends to generate topic briefs.

${trendText}
${brandDesc}${audienceDesc}

Allowed content types: ${contentTypeList}

Analyze the trends above and generate ${opts.count} content topic briefs. For each:
1. Transform the raw trend into a compelling content topic with a specific angle
2. Choose the best content type for the topic
3. Identify related entities (people, brands, organizations, concepts)
4. Score relevance (0-1): how well does this fit the brand/domain?
5. Score timeliness (0-1): how urgent/timely is this topic right now?
6. Score audienceFit (0-1): how well does this match the target audience?
7. Write reasoning in Korean explaining why this topic is worth covering now

Return JSON:
{
  "topics": [
    {
      "topic": "토픽 제목 (Korean)",
      "angle": "specific angle in 1 sentence (Korean)",
      "contentType": "blog | sns | carousel | review",
      "trendSources": ["which trend items inspired this"],
      "relatedEntities": ["entity1", "entity2"],
      "reasoning": "왜 지금 이 주제인지 (Korean, 1-2 sentences)",
      "relevance": 0.0-1.0,
      "timeliness": 0.0-1.0,
      "audienceFit": 0.0-1.0
    }
  ]
}

Rules:
- Each topic must have a differentiated angle (not just "X에 대해 알아보자")
- Prefer topics where multiple trends converge
- Spread content types across the list
- Include both safe mainstream topics and some niche/contrarian angles

Respond ONLY with the JSON object.`;

  const result = await callGptJson<{ topics: RawTopic[] }>(prompt, {
    caller: "topic-intelligence",
    model: "gpt-4o-mini",
    temperature: 0.6,
    maxTokens: 3000,
  });

  return result.topics;
}

// ── Step 4: Enrich with RAG + KG + cross-source + velocity ─

/**
 * Compute velocity score from TrendSnapshot history.
 * Measures how fast a topic is growing in the last 7 days.
 *
 * velocity = (appearances_recent_3d / appearances_older_4d)
 * Normalized to 0-1 range. A brand-new topic trending today gets ~0.8+.
 */
async function computeVelocity(topicTitle: string): Promise<number> {
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const searchTerm = topicTitle.slice(0, 30).toLowerCase().trim();

    const [recentCount, olderCount] = await Promise.all([
      prisma.trendSnapshot.count({
        where: {
          title: { contains: searchTerm, mode: "insensitive" },
          fetchedAt: { gte: threeDaysAgo },
        },
      }),
      prisma.trendSnapshot.count({
        where: {
          title: { contains: searchTerm, mode: "insensitive" },
          fetchedAt: { gte: sevenDaysAgo, lt: threeDaysAgo },
        },
      }),
    ]);

    if (recentCount === 0 && olderCount === 0) return 0; // no history
    if (olderCount === 0) return Math.min(1, recentCount * 0.2); // brand-new topic
    const ratio = recentCount / olderCount;
    // ratio > 1 = accelerating, ratio < 1 = decelerating
    return clamp(ratio * 0.4, 0, 0.5); // max +0.5 boost
  } catch {
    return 0;
  }
}

async function enrichTopic(
  raw: RawTopic,
  crossSourceMap: Map<string, Set<string>>,
  input: TopicIntelligenceInput,
): Promise<TopicBrief> {
  // Cross-source boost for timeliness
  let timelinessBoost = 0;
  for (const src of raw.trendSources) {
    const key = src.toLowerCase().trim();
    const sources = crossSourceMap.get(key);
    if (sources && sources.size > 1) {
      timelinessBoost = Math.min(0.2, (sources.size - 1) * 0.1);
      break;
    }
  }

  // Velocity boost from TrendSnapshot history (data-driven, not LLM-subjective)
  const velocity = await computeVelocity(raw.topic);
  timelinessBoost += velocity;

  // RAG originality check
  let originality = 0.8; // default: fairly original
  try {
    const similar = await searchHybrid(raw.topic, { limit: 3 });
    if (similar.length > 0) {
      const maxSimilarity = Math.max(...similar.map((s) => s.score));
      originality = Math.max(0, 1 - maxSimilarity);
    }
  } catch {
    // pgvector may not be ready or no data yet
  }

  // KG entity match — check if related entities exist in our knowledge graph
  let coverageGap = 0.5; // default: neutral
  try {
    const entityCount = raw.relatedEntities.length;
    if (entityCount > 0) {
      const kgMatches = await prisma.musicArtist.count({
        where: {
          OR: raw.relatedEntities.map((e) => ({
            name: { contains: e, mode: "insensitive" as const },
          })),
        },
      });
      // If entities exist in KG but we haven't written about them much → high gap
      // If entities don't exist in KG → medium gap (less data to work with)
      coverageGap = kgMatches > 0 ? 0.7 : 0.4;
    }

    // Check TopicPerformance for articles we've already written
    const existing = await prisma.topicPerformance.findFirst({
      where: { topic: { contains: raw.topic.slice(0, 20), mode: "insensitive" } },
    });
    if (existing && existing.articleCount > 2) {
      coverageGap = Math.max(0.1, coverageGap - 0.3); // we've covered this
    }
  } catch {
    // Tables may not exist yet
  }

  // Calculate final scores
  const scores: TopicScore = {
    relevance: clamp(raw.relevance),
    timeliness: clamp(raw.timeliness + timelinessBoost),
    audienceFit: clamp(raw.audienceFit),
    originality: clamp(originality),
    coverageGap: clamp(coverageGap),
    velocity: clamp(velocity),
    overall: 0,
  };

  scores.overall =
    scores.relevance * SCORE_WEIGHTS.relevance +
    scores.timeliness * SCORE_WEIGHTS.timeliness +
    scores.audienceFit * SCORE_WEIGHTS.audienceFit +
    scores.originality * SCORE_WEIGHTS.originality +
    scores.coverageGap * SCORE_WEIGHTS.coverageGap;

  return {
    topic: raw.topic,
    angle: raw.angle,
    contentType: raw.contentType,
    score: scores,
    trendSources: raw.trendSources,
    relatedEntities: raw.relatedEntities,
    reasoning: raw.reasoning,
    isExploration: false,
  };
}

// ── Step 5: Filter — dedup + cooling ───────────────────

async function filterTopics(topics: TopicBrief[]): Promise<TopicBrief[]> {
  const filtered: TopicBrief[] = [];

  for (const topic of topics) {
    // RAG dedup: skip if too similar to recent content
    if (topic.score.originality < (1 - DEDUP_THRESHOLD)) {
      continue;
    }

    // Cooling period check
    try {
      const perf = await prisma.topicPerformance.findFirst({
        where: {
          topic: { contains: topic.topic.slice(0, 20), mode: "insensitive" },
          coolingUntil: { gt: new Date() },
        },
      });
      if (perf) continue;
    } catch {
      // Table may not exist yet
    }

    // Intra-batch dedup: skip if too similar to already-selected topics
    const isDuplicate = filtered.some(
      (f) => similarity(f.topic, topic.topic) > 0.7,
    );
    if (isDuplicate) continue;

    filtered.push(topic);
  }

  return filtered;
}

// ── Step 6: Exploration selection ──────────────────────

function selectExploration(
  candidates: TopicBrief[],
  count: number,
): TopicBrief[] {
  if (candidates.length === 0 || count === 0) return [];

  // Weight by coverageGap (prefer underserved areas) + some randomness
  const weighted = candidates.map((c) => ({
    topic: c,
    weight: c.score.coverageGap * 0.6 + Math.random() * 0.4,
  }));

  weighted.sort((a, b) => b.weight - a.weight);

  return weighted.slice(0, count).map((w) => ({
    ...w.topic,
    isExploration: true,
  }));
}

// ── Utilities ──────────────────────────────────────────

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/** Simple Jaccard similarity on bigrams for intra-batch dedup */
function similarity(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  const intersection = bigramsA.filter((bg) => bigramsB.includes(bg));
  const union = new Set([...bigramsA, ...bigramsB]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

function bigrams(s: string): string[] {
  const clean = s.toLowerCase().replace(/\s+/g, "");
  const result: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    result.push(clean.slice(i, i + 2));
  }
  return result;
}

// ── Public: Update topic performance after publish ─────

export async function recordTopicPublished(
  topic: string,
  category: string,
  coolingDays = DEFAULT_COOLING_DAYS,
): Promise<void> {
  const coolingUntil = new Date();
  coolingUntil.setDate(coolingUntil.getDate() + coolingDays);

  const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
  const workspaceId = await fallbackWorkspaceId();
  if (!workspaceId) return;

  await prisma.topicPerformance.upsert({
    where: { workspaceId_topic_category: { workspaceId, topic, category } },
    create: {
      workspaceId,
      topic,
      category,
      articleCount: 1,
      lastPublishedAt: new Date(),
      coolingUntil,
    },
    update: {
      articleCount: { increment: 1 },
      lastPublishedAt: new Date(),
      coolingUntil,
    },
  });
}

// ── Public: Get trend growth (7-day snapshot analysis) ─

export async function getTrendGrowth(
  days = 7,
): Promise<Array<{ title: string; sources: string[]; appearances: number; firstSeen: Date }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.trendSnapshot.findMany({
    where: { fetchedAt: { gte: since } },
    orderBy: { fetchedAt: "asc" },
  });

  // Group by title
  const map = new Map<string, { sources: Set<string>; count: number; firstSeen: Date }>();
  for (const s of snapshots) {
    const key = s.title.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, { sources: new Set(), count: 0, firstSeen: s.fetchedAt });
    }
    const entry = map.get(key)!;
    entry.sources.add(s.source);
    entry.count++;
  }

  return [...map.entries()]
    .map(([title, data]) => ({
      title,
      sources: [...data.sources],
      appearances: data.count,
      firstSeen: data.firstSeen,
    }))
    .sort((a, b) => b.appearances - a.appearances);
}
