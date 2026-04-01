/**
 * Trend Scout Agent — enhanced trend scanning with velocity detection,
 * diversity checks, and weekly plan alignment.
 *
 * Wraps existing: fetchTrends(), discoverTopics()
 */
import { fetchTrends } from "@/lib/trends";
import { discoverTopics, type TopicBrief } from "@/lib/pipeline/topic-intelligence";
import { cacheGetJSON, cacheSetJSON } from "@/lib/redis";
import type { AgentContext, TrendBriefing, ScoredTopic, UrgentAlert } from "./types";

const VELOCITY_URGENT_THRESHOLD = 80;
const TOPIC_CACHE_TTL = 7200; // 2 hours — topics don't change faster than this

export async function runTrendScout(ctx: AgentContext): Promise<TrendBriefing> {
  await ctx.log("info", "Starting trend scan");

  // 1. Get active autopilot keywords
  const configs = await ctx.prisma.autopilotConfig.findMany({
    where: { isActive: true },
    select: { topicKeywords: true },
  });
  const keywords = [...new Set(configs.flatMap((c: { topicKeywords: string[] }) => c.topicKeywords))];

  // 2. Fetch raw trends (existing)
  const { global, niche } = await fetchTrends(keywords.length > 0 ? keywords as string[] : undefined);
  await ctx.log("info", `Fetched ${global.length} global + ${niche.length} niche trends`);

  // 3. Discover topics — cached for 2 hours to reduce LLM calls (~70% savings)
  const cacheKey = `trend-scout:topics:${keywords.sort().join(",")}`;
  let topicBriefs = await cacheGetJSON<TopicBrief[]>(cacheKey);

  if (topicBriefs) {
    await ctx.log("info", `Using cached topics (${topicBriefs.length} items)`);
  } else {
    topicBriefs = await discoverTopics({
      keywords: keywords as string[],
      count: 15,
      brandContext: "한국 인디/밴드 음악 웹매거진. 타겟: 20-30대 음악 팬.",
      audienceContext: "인디 공연을 다니고, 밴드 음악에 깊은 관심이 있는 사람들.",
    });
    await cacheSetJSON(cacheKey, topicBriefs, TOPIC_CACHE_TTL);
    await ctx.log("info", `Discovered ${topicBriefs.length} topics (cached for ${TOPIC_CACHE_TTL}s)`);
  }

  // 4. Velocity spike detection — compare with TrendSnapshot 24h ago
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSnapshots = await ctx.prisma.trendSnapshot.findMany({
    where: { fetchedAt: { gte: dayAgo } },
    select: { title: true, rank: true, source: true, fetchedAt: true },
    orderBy: { fetchedAt: "desc" },
    take: 200,
  });

  // Build velocity map: topic → velocity score
  const velocityMap = new Map<string, number>();
  for (const brief of topicBriefs) {
    // Base velocity from topic intelligence score
    let velocity = brief.score.velocity * 100;

    // Boost if trend appeared in multiple snapshots recently
    const matchingSnapshots = recentSnapshots.filter(
      (s) => s.title && brief.topic.toLowerCase().includes(s.title.toLowerCase()),
    );
    if (matchingSnapshots.length >= 3) {
      velocity = Math.min(100, velocity + 15);
    }

    velocityMap.set(brief.topic, velocity);
  }

  // 5. Weekly plan alignment — boost topics matching the current theme
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeklyPlan = await ctx.prisma.weeklyPlan.findFirst({
    where: { weekStart: { lte: today }, weekEnd: { gte: today } },
    orderBy: { createdAt: "desc" },
  });
  const weeklyTheme = (weeklyPlan?.strategyJson as { theme?: string })?.theme ?? "";

  // 6. Build scored topics
  const topics: ScoredTopic[] = topicBriefs.map((brief) => {
    let score = brief.score.overall;
    const velocity = velocityMap.get(brief.topic) ?? brief.score.velocity * 100;

    // Weekly theme alignment boost
    if (weeklyTheme && brief.topic.toLowerCase().includes(weeklyTheme.toLowerCase())) {
      score = Math.min(1, score + 0.1);
    }

    return {
      topic: brief.topic,
      angle: brief.angle,
      contentType: brief.contentType,
      score,
      velocity,
      sources: brief.trendSources,
      reasoning: brief.reasoning,
      isExploration: brief.isExploration,
    };
  });

  // Sort by score descending
  topics.sort((a, b) => b.score - a.score);

  // 7. Diversity check — ensure at least 2 content types in top 10
  const top10 = topics.slice(0, 10);
  const types = new Set(top10.map((t) => t.contentType));
  if (types.size < 2) {
    await ctx.log("warn", `Low diversity: only ${types.size} content type(s) in top 10`);
  }

  // 8. Detect urgent alerts
  const urgentAlerts: UrgentAlert[] = topics
    .filter((t) => t.velocity >= VELOCITY_URGENT_THRESHOLD)
    .map((t) => ({
      topic: t.topic,
      velocity: t.velocity,
      sources: t.sources,
      detectedAt: new Date().toISOString(),
    }));

  if (urgentAlerts.length > 0) {
    await ctx.log("warn", `${urgentAlerts.length} urgent alert(s) detected: ${urgentAlerts.map((a) => a.topic).join(", ")}`);
  }

  const briefing: TrendBriefing = {
    topics,
    urgentAlerts,
    scanTimestamp: new Date().toISOString(),
  };

  await ctx.log("info", `Scan complete: ${topics.length} topics, ${urgentAlerts.length} urgent`);

  return briefing;
}
