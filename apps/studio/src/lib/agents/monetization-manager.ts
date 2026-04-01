/**
 * Monetization Manager Agent — revenue tracking, affiliate link insertion, ROI.
 *
 * Three modes:
 * - affiliate-insert: auto-insert affiliate links into article before publish
 * - weekly-report: aggregate revenue, track sponsor deals, calculate ROI
 * - roi-update: correlate engagement data with revenue per content piece
 */
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type { AgentContext, MonetizationResult } from "./types";

// ── Affiliate Insert Mode ────────────────────────────────

interface AffiliateInsertInput {
  articleContent: string;
  topic: string;
  blogPostId?: string;
  seoKeywords: string[];
}

export async function runAffiliateInsert(
  ctx: AgentContext,
  input: AffiliateInsertInput,
): Promise<MonetizationResult> {
  await ctx.log("info", `Affiliate insert for: ${input.topic}`);

  // 1. Find active affiliate links matching article keywords
  const activeLinks = await ctx.prisma.affiliateLink.findMany({
    where: { isActive: true },
    select: {
      id: true,
      platform: true,
      keywords: true,
      affiliateUrl: true,
      label: true,
    },
  });

  if (activeLinks.length === 0) {
    await ctx.log("info", "No active affiliate links found, skipping");
    return { mode: "affiliate-insert", affiliateInsert: { linksInserted: 0, affiliateIds: [] } };
  }

  // 2. Match links by keyword overlap
  const articleKeywords = new Set([
    ...input.seoKeywords.map((k) => k.toLowerCase()),
    ...input.topic.toLowerCase().split(/\s+/),
  ]);

  const matchedLinks = activeLinks
    .map((link) => {
      const overlap = link.keywords.filter((k) => articleKeywords.has(k.toLowerCase()));
      return { ...link, matchScore: overlap.length };
    })
    .filter((link) => link.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5); // candidates

  if (matchedLinks.length === 0) {
    await ctx.log("info", "No keyword-matching affiliate links found");
    return { mode: "affiliate-insert", affiliateInsert: { linksInserted: 0, affiliateIds: [] } };
  }

  // 3. LLM: determine WHERE to insert affiliate links (position-based, not full rewrite)
  const linkDescriptions = matchedLinks.map((l) =>
    `- [${l.id}] ${l.label || l.platform} (${l.affiliateUrl}) — 키워드: ${l.keywords.join(", ")}`,
  ).join("\n");

  const insertPlan = await callGptJson(
    `당신은 웹매거진 콘텐츠 편집자입니다. 기사에 제휴 링크를 자연스럽게 삽입할 위치를 찾으세요.

## 규칙
- 최대 3개 링크만 삽입
- 기사 흐름을 방해하지 않도록 자연스럽게 배치
- 삽입할 위치의 기존 텍스트(searchText)와 대체할 텍스트(replaceText)를 반환
- replaceText에 마크다운 링크 포함: [표시텍스트](URL)

## 사용 가능한 제휴 링크
${linkDescriptions}

## 기사 내용 (처음 3000자)
${input.articleContent.slice(0, 3000)}

각 삽입에 대해 linkId, searchText(기존 텍스트 10-50자), replaceText(링크 포함 대체 텍스트)를 반환하세요.`,
    {
      caller: "monetization-manager:affiliate-insert",
      schema: z.object({
        insertions: z.array(z.object({
          linkId: z.string(),
          searchText: z.string(),
          replaceText: z.string(),
        })),
      }),
    },
  );

  // 4. Apply insertions to full article content (safe text replacement)
  let modifiedContent = input.articleContent;
  const insertedIds: string[] = [];

  for (const ins of insertPlan.insertions.slice(0, 3)) {
    if (modifiedContent.includes(ins.searchText)) {
      modifiedContent = modifiedContent.replace(ins.searchText, ins.replaceText);
      insertedIds.push(ins.linkId);
    }
  }

  // 5. Update BlogPost with affiliate-linked content
  if (input.blogPostId && insertedIds.length > 0) {
    await ctx.prisma.blogPost.update({
      where: { id: input.blogPostId },
      data: { content: modifiedContent },
    }).catch((err: unknown) => ctx.log("warn", `BlogPost update failed: ${err}`));
  }

  await ctx.log("info", `Inserted ${insertedIds.length} affiliate links`);

  return {
    mode: "affiliate-insert",
    affiliateInsert: {
      linksInserted: insertedIds.length,
      affiliateIds: insertedIds,
    },
  };
}

// ── Weekly Report Mode ───────────────────────────────────

export async function runWeeklyRevenueReport(ctx: AgentContext): Promise<MonetizationResult> {
  await ctx.log("info", "Starting weekly revenue report");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Active sponsor deals
  const activeDeals = await ctx.prisma.sponsorDeal.findMany({
    where: { status: "active" },
    select: {
      id: true,
      sponsorName: true,
      dealType: true,
      totalValue: true,
      paidAmount: true,
      endDate: true,
      deliverables: true,
    },
  });

  const upcomingDeadlines: Array<{ dealId: string; sponsor: string; deadline: string }> = [];
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  for (const deal of activeDeals) {
    if (deal.endDate && deal.endDate <= twoWeeksFromNow) {
      upcomingDeadlines.push({
        dealId: deal.id,
        sponsor: deal.sponsorName,
        deadline: deal.endDate.toISOString().split("T")[0]!,
      });
    }
    // Check deliverable deadlines
    const deliverables = (deal.deliverables as Array<{ deadline?: string; completed?: boolean }>) ?? [];
    for (const d of deliverables) {
      if (d.deadline && !d.completed && new Date(d.deadline) <= twoWeeksFromNow) {
        upcomingDeadlines.push({
          dealId: deal.id,
          sponsor: deal.sponsorName,
          deadline: d.deadline,
        });
      }
    }
  }

  // 2. Revenue events this week
  const revenueEvents = await ctx.prisma.revenueEvent.findMany({
    where: { eventDate: { gte: weekAgo } },
    select: { source: true, amount: true, blogPostId: true },
  });

  const totalRevenue = revenueEvents.reduce((sum: number, e) => sum + e.amount, 0);
  const bySource: Record<string, number> = {};
  for (const e of revenueEvents) {
    bySource[e.source] = (bySource[e.source] ?? 0) + e.amount;
  }

  // 3. Calculate per-content ROI
  const revenueByPost = new Map<string, number>();
  for (const e of revenueEvents) {
    if (e.blogPostId) {
      revenueByPost.set(e.blogPostId, (revenueByPost.get(e.blogPostId) ?? 0) + e.amount);
    }
  }

  const costByPost = await ctx.prisma.pipelineRun.findMany({
    where: {
      blogPost: { id: { in: [...revenueByPost.keys()] } },
    },
    select: {
      blogPost: { select: { id: true } },
      id: true,
    },
  });

  const costAgg = await ctx.prisma.llmUsageLog.groupBy({
    by: ["caller"],
    where: { createdAt: { gte: weekAgo } },
    _sum: { costUsd: true },
  });
  const totalCost = costAgg.reduce((sum, c) => sum + (c._sum.costUsd ?? 0), 0);

  const topRoiContent: Array<{ blogPostId: string; roi: number; revenue: number; cost: number }> = [];
  for (const [postId, revenue] of revenueByPost) {
    const cost = totalCost / Math.max(costByPost.length, 1); // rough per-post cost estimate
    const roi = cost > 0 ? revenue / cost : 0;
    topRoiContent.push({ blogPostId: postId, roi, revenue, cost });
  }
  topRoiContent.sort((a, b) => b.roi - a.roi);

  // 4. LLM: generate recommendations
  let recommendations: string[] = [];
  try {
    const llmResult = await callGptJson(
      `당신은 웹매거진 수익화 전문 컨설턴트입니다.

## 주간 수익 데이터
- 총 수익: ₩${totalRevenue.toLocaleString()}
- 소스별: ${JSON.stringify(bySource)}
- 활성 스폰서 딜: ${activeDeals.length}건
- 임박한 마감: ${upcomingDeadlines.length}건
- 콘텐츠별 ROI 상위: ${topRoiContent.slice(0, 3).map((r) => `ROI ${r.roi.toFixed(1)}x`).join(", ") || "데이터 부족"}

3-5개 실행 가능한 수익화 추천사항을 한국어로 작성하세요.`,
      {
        caller: "monetization-manager:weekly-report",
        schema: z.object({ recommendations: z.array(z.string()) }),
      },
    );
    recommendations = llmResult.recommendations;
  } catch (err) {
    await ctx.log("warn", `Recommendation generation failed: ${err}`);
    recommendations = ["수익 분석 완료 — 추천 생성 실패"];
  }

  await ctx.log("info", `Revenue report: ₩${totalRevenue.toLocaleString()}, ${activeDeals.length} active deals`);

  return {
    mode: "weekly-report",
    weeklyReport: {
      totalRevenue,
      bySource,
      activeDealCount: activeDeals.length,
      upcomingDeadlines,
      topRoiContent: topRoiContent.slice(0, 5),
      recommendations,
    },
  };
}
