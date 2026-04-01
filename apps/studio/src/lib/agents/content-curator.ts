/**
 * Content Curator Agent — stale content refresh, series connections, evergreen re-promotion.
 *
 * Two modes:
 * - audit: weekly scan of all published content
 * - link-new: when new content is published, find related older content for series linking
 */
import { callGptJson } from "@/lib/llm";
import { searchHybrid } from "@/lib/pipeline/embedding";
import { z } from "zod";
import type { AgentContext, ContentCuratorResult } from "./types";

// ── Audit Mode ───────────────────────────────────────────

export async function runContentAudit(ctx: AgentContext): Promise<ContentCuratorResult> {
  await ctx.log("info", "Starting weekly content audit");

  const now = Date.now();
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // 1. Fetch published posts (use wordCount instead of loading full content)
  const posts = await ctx.prisma.blogPost.findMany({
    where: { status: "published" },
    select: {
      id: true,
      slug: true,
      title: true,
      wordCount: true,
      updatedAt: true,
      publishedAt: true,
      pipelineRunId: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });

  // Get performance data
  const pipelineRunIds = posts.map((p) => p.pipelineRunId).filter(Boolean) as string[];
  const pipelineRuns = await ctx.prisma.pipelineRun.findMany({
    where: { id: { in: pipelineRunIds } },
    select: {
      id: true,
      engagementRate: true,
      contentType: true,
      blogPost: { select: { id: true } },
    },
  });

  const engagementMap = new Map<string, { rate: number; contentType: string }>();
  for (const run of pipelineRuns) {
    if (run.blogPost?.id) {
      engagementMap.set(run.blogPost.id, {
        rate: run.engagementRate ?? 0,
        contentType: run.contentType,
      });
    }
  }

  // Get recent performance snapshots for decline detection
  const recentPerf = await ctx.prisma.postPerformance.findMany({
    where: { snapshotAt: { gte: thirtyDaysAgo } },
    select: { views: true, engagementRate: true },
  });
  const avgRecentEngagement = recentPerf.length > 0
    ? recentPerf.reduce((s, p) => s + (p.engagementRate ?? 0), 0) / recentPerf.length
    : 0;

  // 2. Classify content
  const staleContent: ContentCuratorResult["staleContent"] = [];
  const evergreenContent: ContentCuratorResult["evergreenContent"] = [];
  const repurposingOpportunities: ContentCuratorResult["repurposingOpportunities"] = [];

  for (const post of posts) {
    const daysSinceUpdate = Math.floor((now - post.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const perf = engagementMap.get(post.id);

    // Stale content: 90+ days old, still has some traffic
    if (post.updatedAt < ninetyDaysAgo && perf && perf.rate > 0.01) {
      staleContent.push({
        blogPostId: post.id,
        slug: post.slug,
        daysSinceUpdate,
        currentTraffic: Math.round(perf.rate * 10000),
        refreshPriority: perf.rate > 0.03 ? "high" : perf.rate > 0.015 ? "medium" : "low",
        suggestedUpdates: [
          "최신 정보로 데이터 업데이트",
          "새로운 관련 내부 링크 추가",
          "메타 설명 최적화",
        ],
      });
    }

    // Evergreen: consistent traffic, published 30+ days ago, not time-sensitive
    if (post.publishedAt && post.publishedAt < thirtyDaysAgo && perf && perf.rate > avgRecentEngagement) {
      evergreenContent.push({
        blogPostId: post.id,
        slug: post.slug,
        rePromotionSuggestion: `참여율 ${(perf.rate * 100).toFixed(1)}% — SNS 재공유 추천`,
        suggestedPlatforms: ["threads", "instagram", "x"],
      });
    }

    // Repurposing: long blog → carousel, review → SNS thread
    if (perf) {
      const wordCount = post.wordCount ?? 0;
      if (perf.contentType === "blog" && wordCount > 800) {
        repurposingOpportunities.push({
          sourceBlogPostId: post.id,
          sourceFormat: "blog",
          targetFormat: "carousel",
          reasoning: `${wordCount}단어 장문 기사 — 캐러셀로 재구성하면 SNS 참여율 증가 기대`,
        });
      }
      if (perf.contentType === "review" && perf.rate > 0.03) {
        repurposingOpportunities.push({
          sourceBlogPostId: post.id,
          sourceFormat: "review",
          targetFormat: "sns",
          reasoning: `높은 참여율(${(perf.rate * 100).toFixed(1)}%)의 리뷰 — SNS 쓰레드로 재구성 추천`,
        });
      }
    }
  }

  // 3. Find series connections via embedding similarity
  const seriesConnections: ContentCuratorResult["seriesConnections"] = [];

  // Sample up to 15 posts for series detection (parallel, within timeout)
  const samplePosts = posts.slice(0, 15);
  const clusterMap = new Map<string, Set<string>>();

  const searchResults = await Promise.allSettled(
    samplePosts.map((post) =>
      searchHybrid(post.title, { limit: 3 }).then((results) => ({ postId: post.id, results })),
    ),
  );

  for (const settled of searchResults) {
    if (settled.status !== "fulfilled") continue;
    const { postId, results } = settled.value;
    for (const chunk of results) {
      if (chunk.sourceId !== postId && chunk.score > 0.82) {
        const key = [postId, chunk.sourceId].sort().join("|");
        if (!clusterMap.has(key)) {
          clusterMap.set(key, new Set([postId, chunk.sourceId]));
        }
      }
    }
  }

  // Convert clusters to series
  for (const [, articleIds] of clusterMap) {
    const articles = posts
      .filter((p) => articleIds.has(p.id))
      .map((p) => ({ blogPostId: p.id, title: p.title }));
    if (articles.length >= 2) {
      seriesConnections.push({
        articles,
        seriesTheme: articles.map((a) => a.title).join(" + "),
        similarityScore: 0.85, // approximate
      });
    }
  }

  // 4. Use LLM to name series themes if any found
  if (seriesConnections.length > 0) {
    try {
      const themes = await callGptJson(
        `아래 관련 기사 그룹들에 시리즈 이름을 붙여주세요.

${seriesConnections.map((s, i) => `그룹 ${i + 1}: ${s.articles.map((a) => a.title).join(", ")}`).join("\n")}

각 그룹에 대해 한국어로 짧은 시리즈 테마명(10자 이내)을 생성하세요.`,
        {
          caller: "content-curator:series-naming",
          schema: z.object({
            themes: z.array(z.string()),
          }),
        },
      );

      for (let i = 0; i < Math.min(themes.themes.length, seriesConnections.length); i++) {
        seriesConnections[i]!.seriesTheme = themes.themes[i]!;
      }
    } catch {
      // keep default concatenated theme names
    }
  }

  await ctx.log("info", `Audit: ${staleContent.length} stale, ${evergreenContent.length} evergreen, ${seriesConnections.length} series, ${repurposingOpportunities.length} repurpose`);

  return {
    mode: "audit",
    staleContent: staleContent.slice(0, 10),
    evergreenContent: evergreenContent.slice(0, 10),
    seriesConnections: seriesConnections.slice(0, 5),
    repurposingOpportunities: repurposingOpportunities.slice(0, 10),
  };
}

// ── Link-New Mode ────────────────────────────────────────

interface LinkNewInput {
  topic: string;
  articleContent: string;
  blogPostId?: string;
}

export async function runLinkNew(
  ctx: AgentContext,
  input: LinkNewInput,
): Promise<ContentCuratorResult> {
  await ctx.log("info", `Finding related content for: ${input.topic}`);

  const seriesConnections: ContentCuratorResult["seriesConnections"] = [];

  try {
    const similar = await searchHybrid(input.topic, { limit: 5 });
    const relatedIds = similar
      .filter((c) => c.sourceId !== input.blogPostId && c.score > 0.78)
      .map((c) => c.sourceId);

    if (relatedIds.length > 0) {
      const relatedPosts = await ctx.prisma.blogPost.findMany({
        where: { id: { in: relatedIds }, status: "published" },
        select: { id: true, title: true },
      });

      if (relatedPosts.length > 0) {
        seriesConnections.push({
          articles: [
            { blogPostId: input.blogPostId ?? "new", title: input.topic },
            ...relatedPosts.map((p) => ({ blogPostId: p.id, title: p.title })),
          ],
          seriesTheme: input.topic,
          similarityScore: similar[0]?.score ?? 0.8,
        });
      }
    }
  } catch (err) {
    await ctx.log("warn", `Embedding search failed: ${err}`);
  }

  await ctx.log("info", `Found ${seriesConnections.length} series connections`);

  return {
    mode: "link-new",
    staleContent: [],
    evergreenContent: [],
    seriesConnections,
    repurposingOpportunities: [],
  };
}
