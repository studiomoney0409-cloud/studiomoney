/**
 * SEO Strategist Agent — meta optimization, keyword analysis, internal linking.
 *
 * Two modes:
 * - pre-publish: optimize SEO fields before content goes to Design Director
 * - audit: weekly scan of all published content for SEO improvement opportunities
 */
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type { AgentContext, SeoOptimizationResult } from "./types";

// ── Pre-publish Mode ─────────────────────────────────────

interface SeoPrePublishInput {
  articleContent: string;
  topic: string;
  platforms: string[];
  pipelineRunId?: string;
  blogPostId?: string;
}

export async function runSeoPrePublish(
  ctx: AgentContext,
  input: SeoPrePublishInput,
): Promise<SeoOptimizationResult> {
  await ctx.log("info", `SEO pre-publish optimization for: ${input.topic}`);

  // 1. Analyze keyword density (rule-based)
  // Strip common Korean particles/postpositions for cleaner word extraction
  const KO_PARTICLES = /[은는이가을를의에서도로와과로서까지부터만도조차마저라는으로에게한테]/g;
  const words = input.articleContent
    .replace(/[^\w가-힣\s]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(KO_PARTICLES, ""))
    .filter((w) => w.length > 1);
  const totalWords = words.length;
  const wordFreq = new Map<string, number>();
  for (const w of words) {
    const lower = w.toLowerCase();
    wordFreq.set(lower, (wordFreq.get(lower) ?? 0) + 1);
  }

  const keywordDensity: Record<string, number> = {};
  const topKeywords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [word, count] of topKeywords) {
    keywordDensity[word] = totalWords > 0
      ? Math.round((count / totalWords) * 10000) / 100
      : 0;
  }

  // 2. Find internal linking candidates from existing BlogPosts
  const existingPosts = await ctx.prisma.blogPost.findMany({
    where: { status: "published" },
    select: { id: true, slug: true, title: true, seoKeywords: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  const topKeywordSet = new Set(topKeywords.slice(0, 10).map(([w]) => w));
  const internalLinkCandidates: Array<{ slug: string; anchorText: string; relevanceScore: number }> = [];

  for (const post of existingPosts) {
    const overlap = post.seoKeywords.filter((k) => topKeywordSet.has(k.toLowerCase()));
    if (overlap.length > 0) {
      internalLinkCandidates.push({
        slug: post.slug,
        anchorText: post.title,
        relevanceScore: Math.min(overlap.length / topKeywordSet.size, 1),
      });
    }
  }
  internalLinkCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topLinks = internalLinkCandidates.slice(0, 5);

  // 3. LLM: generate optimized SEO metadata + schema.org
  const seoResult = await callGptJson(
    `당신은 웹매거진 SEO 전문가입니다. 아래 기사에 대해 최적화된 SEO 메타데이터를 생성하세요.

## 기사 주제
${input.topic}

## 기사 내용 (처음 1500자)
${input.articleContent.slice(0, 1500)}

## 주요 키워드 밀도
${topKeywords.slice(0, 10).map(([w, c]) => `${w}: ${c}회`).join(", ")}

## 요구사항
- seoTitle: 60자 이내, 핵심 키워드를 앞에 배치
- seoDescription: 155자 이내, 클릭을 유도하는 메타 설명
- seoKeywords: 5-10개, 검색 볼륨 높은 키워드 우선
- schemaOrg: Article 타입의 JSON-LD 구조화 데이터 (headline, description, author, datePublished 포함)`,
    {
      caller: "seo-strategist:pre-publish",
      schema: z.object({
        seoTitle: z.string(),
        seoDescription: z.string(),
        seoKeywords: z.array(z.string()),
        schemaOrg: z.record(z.unknown()),
      }),
    },
  );

  // 4. Update BlogPost if exists
  if (input.blogPostId) {
    await ctx.prisma.blogPost.update({
      where: { id: input.blogPostId },
      data: {
        seoTitle: seoResult.seoTitle,
        seoDescription: seoResult.seoDescription,
        seoKeywords: seoResult.seoKeywords,
      },
    }).catch((err) => ctx.log("warn", `BlogPost update failed: ${err}`));
  }

  // Also update PipelineRun outlineJson if exists
  if (input.pipelineRunId) {
    const run = await ctx.prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      select: { outlineJson: true },
    });
    if (run?.outlineJson) {
      const outline = run.outlineJson as Record<string, unknown>;
      await ctx.prisma.pipelineRun.update({
        where: { id: input.pipelineRunId },
        data: {
          outlineJson: {
            ...outline,
            seoTitle: seoResult.seoTitle,
            seoDescription: seoResult.seoDescription,
            seoKeywords: seoResult.seoKeywords,
          },
        },
      }).catch((err) => ctx.log("warn", `PipelineRun update failed: ${err}`));
    }
  }

  await ctx.log("info", `SEO optimized: title="${seoResult.seoTitle}", ${seoResult.seoKeywords.length} keywords, ${topLinks.length} internal links`);

  return {
    mode: "pre-publish",
    optimizedSeo: {
      seoTitle: seoResult.seoTitle,
      seoDescription: seoResult.seoDescription,
      seoKeywords: seoResult.seoKeywords,
      internalLinks: topLinks,
      schemaOrg: seoResult.schemaOrg,
      keywordDensity,
    },
  };
}

// ── Audit Mode ───────────────────────────────────────────

export async function runSeoAudit(ctx: AgentContext): Promise<SeoOptimizationResult> {
  await ctx.log("info", "Starting weekly SEO audit");

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // 1. Fetch published blog posts (cap at 200 to stay within timeout)
  const posts = await ctx.prisma.blogPost.findMany({
    where: { status: "published" },
    select: {
      id: true,
      slug: true,
      title: true,
      seoTitle: true,
      seoDescription: true,
      seoKeywords: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });

  // 2. Fetch performance data for published posts
  const pipelineRuns = await ctx.prisma.pipelineRun.findMany({
    where: {
      status: "approved",
      publishedAt: { not: null },
    },
    select: {
      id: true,
      topic: true,
      engagementRate: true,
      blogPost: { select: { id: true } },
    },
  });

  const engagementMap = new Map<string, number>();
  for (const run of pipelineRuns) {
    if (run.blogPost?.id && run.engagementRate != null) {
      engagementMap.set(run.blogPost.id, run.engagementRate);
    }
  }

  // 3. Analyze each post for SEO issues
  const auditResults: NonNullable<SeoOptimizationResult["auditResults"]> = [];

  for (const post of posts) {
    const issues: Array<{ type: string; severity: "high" | "medium" | "low"; suggestion: string }> = [];

    // Title length check
    if (!post.seoTitle || post.seoTitle.length === 0) {
      issues.push({ type: "missing-title", severity: "high", suggestion: "SEO 타이틀이 없습니다" });
    } else if (post.seoTitle.length > 60) {
      issues.push({ type: "title-too-long", severity: "medium", suggestion: `SEO 타이틀이 ${post.seoTitle.length}자로 60자 초과` });
    }

    // Description check
    if (!post.seoDescription || post.seoDescription.length === 0) {
      issues.push({ type: "missing-description", severity: "high", suggestion: "메타 설명이 없습니다" });
    } else if (post.seoDescription.length > 160) {
      issues.push({ type: "desc-too-long", severity: "low", suggestion: `메타 설명이 ${post.seoDescription.length}자로 160자 초과` });
    }

    // Keywords check
    if (!post.seoKeywords || post.seoKeywords.length === 0) {
      issues.push({ type: "missing-keywords", severity: "medium", suggestion: "SEO 키워드가 없습니다" });
    }

    // Stale content check
    const daysSinceUpdate = Math.floor((Date.now() - post.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (post.updatedAt < ninetyDaysAgo) {
      const engagement = engagementMap.get(post.id);
      if (engagement && engagement > 0.02) {
        issues.push({
          type: "stale-with-traffic",
          severity: "medium",
          suggestion: `${daysSinceUpdate}일 전 업데이트, 아직 참여율 ${(engagement * 100).toFixed(1)}% — 리프레시 권장`,
        });
      }
    }

    if (issues.length > 0) {
      const highCount = issues.filter((i) => i.severity === "high").length;
      auditResults.push({
        blogPostId: post.id,
        slug: post.slug,
        issues,
        estimatedImpact: highCount >= 2 ? "high" : highCount >= 1 ? "medium" : "low",
      });
    }
  }

  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  auditResults.sort((a, b) => impactOrder[a.estimatedImpact] - impactOrder[b.estimatedImpact]);

  const totalIssues = auditResults.reduce((sum, r) => sum + r.issues.length, 0);
  await ctx.log("info", `SEO audit: ${posts.length} posts scanned, ${auditResults.length} with issues (${totalIssues} total)`);

  return {
    mode: "audit",
    auditResults,
    totalAudited: posts.length,
    issuesFound: totalIssues,
  };
}
