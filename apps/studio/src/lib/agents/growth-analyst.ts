/**
 * Growth Analyst Agent — performance analysis, feedback loops, cost monitoring.
 *
 * Wraps existing: analyzeTopicPerformance(), collectDueMetrics()
 */
import { callGptJson } from "@/lib/llm";
import { analyzeTopicPerformance } from "@/lib/pipeline/feedback-analyzer";
import { collectDueMetrics } from "@/lib/pipeline/feedback-collector";
import { z } from "zod";
import type { AgentContext, GrowthReport } from "./types";

export async function runDailyAnalysis(ctx: AgentContext): Promise<GrowthReport> {
  await ctx.log("info", "Starting daily growth analysis");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  // 1. Collect due metrics (existing feedback collector)
  const metricsResult = await collectDueMetrics().catch((err) => {
    ctx.log("warn", `collectDueMetrics failed: ${err}`);
    return { collected: 0, completed: 0 };
  });
  await ctx.log("info", `Collected ${metricsResult.collected} metrics, completed ${metricsResult.completed} runs`);

  // 2. Run topic performance analysis (existing feedback analyzer)
  const topicInsights = await analyzeTopicPerformance().catch((err) => {
    ctx.log("warn", `analyzeTopicPerformance failed: ${err}`);
    return { insights: [], totalArticles: 0 };
  });

  // 3. Query today's published post performance
  const todayPerformance = await ctx.prisma.postPerformance.findMany({
    where: { snapshotAt: { gte: yesterday } },
    select: {
      views: true,
      likes: true,
      comments: true,
      shares: true,
      saves: true,
      engagementRate: true,
      platform: true,
    },
  });

  const avgEngagement = todayPerformance.length > 0
    ? todayPerformance.reduce((sum: number, p) => sum + (p.engagementRate ?? 0), 0) / todayPerformance.length
    : 0;

  // 4. Query LLM costs for today
  const costByAgent = await ctx.prisma.llmUsageLog.groupBy({
    by: ["caller"],
    where: { createdAt: { gte: yesterday } },
    _sum: { costUsd: true },
  });

  const totalCost = costByAgent.reduce((sum: number, c) => sum + (c._sum.costUsd ?? 0), 0);
  const agentCosts: Record<string, number> = {};
  for (const c of costByAgent) {
    agentCosts[c.caller ?? "unknown"] = c._sum.costUsd ?? 0;
  }

  // 5. Query budget setting
  const budgetSetting = await ctx.prisma.setting.findUnique({
    where: { key: "agent-budget-daily" },
  });
  const dailyBudget = budgetSetting ? parseFloat(String(budgetSetting.value)) : 30;
  const budgetUsedPercent = Math.round((totalCost / dailyBudget) * 100);

  if (budgetUsedPercent >= 80) {
    await ctx.log("warn", `Budget alert: ${budgetUsedPercent}% used ($${totalCost.toFixed(2)} / $${dailyBudget})`);
  }

  // 6. Query follower changes
  const latestSnapshot = await ctx.prisma.analyticsSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { followers: true },
  });
  const previousSnapshot = await ctx.prisma.analyticsSnapshot.findFirst({
    orderBy: { date: "desc" },
    skip: 1,
    select: { followers: true },
  });
  const currentFollowers = latestSnapshot?.followers ?? 0;
  const previousFollowers = previousSnapshot?.followers ?? currentFollowers;
  const followerChange = currentFollowers - previousFollowers;

  // 7. Generate recommendations via LLM
  const topPerformingTopics = topicInsights.insights
    .filter((i) => i.trend === "rising")
    .map((i) => i.topic)
    .slice(0, 5);
  const underperformingTopics = topicInsights.insights
    .filter((i) => i.trend === "declining")
    .map((i) => i.topic)
    .slice(0, 5);

  let recommendations: string[] = [];
  try {
    const llmResult = await callGptJson(
      `당신은 웹매거진 성장 분석 AI입니다. 아래 데이터를 분석하고 3-5개 실행 가능한 추천사항을 제시하세요.

## 오늘 성과
- 발행 게시물: ${todayPerformance.length}개
- 평균 참여율: ${(avgEngagement * 100).toFixed(2)}%
- 잘된 주제: ${topPerformingTopics.join(", ") || "데이터 부족"}
- 부진한 주제: ${underperformingTopics.join(", ") || "데이터 부족"}

## 비용
- 오늘 LLM 비용: $${totalCost.toFixed(2)} (일 예산 $${dailyBudget}의 ${budgetUsedPercent}%)
- 에이전트별: ${JSON.stringify(agentCosts)}

## 팔로워
- 현재: ${currentFollowers}
- 변화: ${followerChange > 0 ? "+" : ""}${followerChange}

구체적이고 실행 가능한 추천사항만 한국어로 작성하세요.`,
      {
        caller: `growth-analyst:daily`,
        schema: z.object({
          recommendations: z.array(z.string()),
        }),
      },
    );
    recommendations = llmResult.recommendations;
  } catch (err) {
    await ctx.log("warn", `Recommendation generation failed: ${err}`);
    recommendations = ["데이터 분석 완료 — LLM 추천 생성 실패"];
  }

  const report: GrowthReport = {
    period: "daily",
    date: today.toISOString().split("T")[0] ?? "",
    performance: {
      totalPosts: todayPerformance.length,
      avgEngagement,
      topPerformingTopics,
      underperformingTopics,
      engagementTrend: avgEngagement > 0.05 ? "good" : avgEngagement > 0.02 ? "average" : "low",
    },
    cost: {
      totalUsd: totalCost,
      byAgent: agentCosts,
      budgetUsedPercent,
    },
    followers: {
      total: currentFollowers,
      change: followerChange,
      changePercent: previousFollowers > 0 ? Math.round((followerChange / previousFollowers) * 10000) / 100 : 0,
    },
    recommendations,
  };

  await ctx.log("info", `Daily report: ${todayPerformance.length} posts, avg engagement ${(avgEngagement * 100).toFixed(2)}%, cost $${totalCost.toFixed(2)}`);

  return report;
}

export async function runWeeklyAnalysis(ctx: AgentContext): Promise<GrowthReport> {
  await ctx.log("info", "Starting weekly growth analysis");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Aggregate weekly data
  const weekPerformance = await ctx.prisma.postPerformance.findMany({
    where: { snapshotAt: { gte: weekAgo } },
    select: { engagementRate: true },
  });

  const avgEngagement = weekPerformance.length > 0
    ? weekPerformance.reduce((sum: number, p) => sum + (p.engagementRate ?? 0), 0) / weekPerformance.length
    : 0;

  const weeklyCost = await ctx.prisma.llmUsageLog.aggregate({
    where: { createdAt: { gte: weekAgo } },
    _sum: { costUsd: true },
  });

  const costByAgent = await ctx.prisma.llmUsageLog.groupBy({
    by: ["caller"],
    where: { createdAt: { gte: weekAgo } },
    _sum: { costUsd: true },
  });

  const weeklyAgentCosts: Record<string, number> = {};
  for (const c of costByAgent) {
    weeklyAgentCosts[c.caller ?? "unknown"] = c._sum.costUsd ?? 0;
  }

  const topicInsights = await analyzeTopicPerformance().catch(() => ({ insights: [], totalArticles: 0 }));

  // Weekly recommendations via Claude Sonnet for strategic depth
  let recommendations: string[] = [];
  try {
    const llmResult = await callGptJson(
      `당신은 웹매거진 전략 컨설턴트 AI입니다. 주간 데이터를 분석하고 다음 주 전략 제안을 해주세요.

## 주간 성과
- 총 게시물: ${weekPerformance.length}개
- 평균 참여율: ${(avgEngagement * 100).toFixed(2)}%
- 상승 주제: ${topicInsights.insights.filter((i) => i.trend === "rising").map((i) => i.topic).join(", ") || "없음"}
- 하락 주제: ${topicInsights.insights.filter((i) => i.trend === "declining").map((i) => i.topic).join(", ") || "없음"}

## 주간 비용
- 총 LLM 비용: $${(weeklyCost._sum.costUsd ?? 0).toFixed(2)}
- 에이전트별: ${JSON.stringify(weeklyAgentCosts)}

전략적 관점에서 3-5개 추천사항을 한국어로 작성하세요. 비용 최적화, 콘텐츠 전략, 성장 방안을 포함해주세요.`,
      {
        model: "claude-sonnet",
        caller: `growth-analyst:weekly`,
        schema: z.object({
          recommendations: z.array(z.string()),
        }),
      },
    );
    recommendations = llmResult.recommendations;
  } catch (err) {
    await ctx.log("warn", `Weekly recommendation failed: ${err}`);
    recommendations = ["주간 분석 완료 — 전략 추천 생성 실패"];
  }

  const report: GrowthReport = {
    period: "weekly",
    date: new Date().toISOString().split("T")[0] ?? "",
    performance: {
      totalPosts: weekPerformance.length,
      avgEngagement,
      topPerformingTopics: topicInsights.insights.filter((i) => i.trend === "rising").map((i) => i.topic).slice(0, 5),
      underperformingTopics: topicInsights.insights.filter((i) => i.trend === "declining").map((i) => i.topic).slice(0, 5),
      engagementTrend: avgEngagement > 0.05 ? "good" : avgEngagement > 0.02 ? "average" : "low",
    },
    cost: {
      totalUsd: weeklyCost._sum.costUsd ?? 0,
      byAgent: weeklyAgentCosts,
      budgetUsedPercent: 0,
    },
    followers: { total: 0, change: 0, changePercent: 0 },
    recommendations,
  };

  await ctx.log("info", `Weekly report: ${weekPerformance.length} posts, cost $${(weeklyCost._sum.costUsd ?? 0).toFixed(2)}`);

  return report;
}
