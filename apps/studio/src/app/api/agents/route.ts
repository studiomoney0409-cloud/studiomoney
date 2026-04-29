import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { AgentName } from "@/lib/agents/types";
import { AGENT_LABELS } from "@/lib/agents/types";
import { workspaceGuard } from "@/lib/auth/route-guard";

const AGENT_NAMES: AgentName[] = [
  "chief-editor",
  "trend-scout",
  "content-producer",
  "copy-editor",
  "seo-strategist",
  "monetization-manager",
  "design-director",
  "growth-analyst",
  "community-manager",
  "content-curator",
  "newsletter-manager",
  "partnership-manager",
];

export async function GET() {
  const guard = await workspaceGuard();
  if (!guard.ok) return guard.response;
  const { workspace } = guard.ctx;
  const wsId = workspace.id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Get each agent's latest run and today's stats
  const agents = await Promise.all(
    AGENT_NAMES.map(async (name) => {
      const [lastRun, todayRuns, todayCost] = await Promise.all([
        prisma.agentRun.findFirst({
          where: { workspaceId: wsId, agentName: name },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
            costUsd: true,
            outputJson: true,
            errorMessage: true,
          },
        }),
        prisma.agentRun.count({
          where: { workspaceId: wsId, agentName: name, startedAt: { gte: today } },
        }),
        prisma.agentRun.aggregate({
          where: { workspaceId: wsId, agentName: name, startedAt: { gte: today } },
          _sum: { costUsd: true },
        }),
      ]);

      const runningNow = await prisma.agentRun.count({
        where: { workspaceId: wsId, agentName: name, status: "running" },
      });

      let status: "running" | "idle" | "error" = "idle";
      if (runningNow > 0) status = "running";
      else if (lastRun?.status === "failed") status = "error";

      return {
        name,
        label: AGENT_LABELS[name],
        status,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              startedAt: lastRun.startedAt.toISOString(),
              completedAt: lastRun.completedAt?.toISOString(),
              durationMs: lastRun.durationMs,
              costUsd: lastRun.costUsd,
              summary: summarizeOutput(name, lastRun.outputJson),
              error: lastRun.errorMessage,
            }
          : null,
        todayRuns,
        todayCost: todayCost._sum.costUsd ?? 0,
      };
    }),
  );

  // 2. Recent activity timeline (today)
  const recentRuns = await prisma.agentRun.findMany({
    where: { workspaceId: wsId, startedAt: { gte: today } },
    orderBy: { startedAt: "desc" },
    take: 30,
    select: {
      id: true,
      agentName: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
      costUsd: true,
      outputJson: true,
      errorMessage: true,
    },
  });

  // 3. Weekly plan progress
  const weeklyPlan = await prisma.weeklyPlan.findFirst({
    where: { workspaceId: wsId, weekStart: { lte: today }, weekEnd: { gte: today } },
    orderBy: { createdAt: "desc" },
    include: { briefings: true },
  });

  let planProgress = null;
  if (weeklyPlan) {
    const strategy = weeklyPlan.strategyJson as { contentSlots?: unknown[] };
    const totalSlots = strategy?.contentSlots?.length ?? 0;
    const statusJson = weeklyPlan.statusJson as { completed?: string[] } | null;
    const completedSlots = statusJson?.completed?.length ?? 0;

    planProgress = {
      id: weeklyPlan.id,
      theme: (weeklyPlan.strategyJson as { theme?: string })?.theme ?? "",
      totalSlots,
      completedSlots,
      progressPercent: totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0,
      briefingsCount: weeklyPlan.briefings.length,
    };
  }

  // 4. Alerts — recent errors and warnings (filtered to this workspace's runs)
  const alerts = await prisma.agentLog.findMany({
    where: {
      level: { in: ["error", "warn"] },
      createdAt: { gte: today },
      run: { workspaceId: wsId },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      run: { select: { agentName: true } },
    },
  });

  // 5. Cost summary
  const [dailyCost, weeklyCost, monthlyCost] = await Promise.all([
    prisma.agentRun.aggregate({
      where: { workspaceId: wsId, startedAt: { gte: today } },
      _sum: { costUsd: true },
    }),
    prisma.agentRun.aggregate({
      where: { workspaceId: wsId, startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      _sum: { costUsd: true },
    }),
    prisma.agentRun.aggregate({
      where: { workspaceId: wsId, startedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _sum: { costUsd: true },
    }),
  ]);

  return NextResponse.json({
    agents,
    recentRuns: recentRuns.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString(),
      summary: summarizeOutput(r.agentName as AgentName, r.outputJson),
    })),
    weeklyPlan: planProgress,
    alerts: alerts.map((a) => ({
      id: a.id,
      agentName: a.run.agentName,
      level: a.level,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
    costSummary: {
      daily: dailyCost._sum.costUsd ?? 0,
      weekly: weeklyCost._sum.costUsd ?? 0,
      monthly: monthlyCost._sum.costUsd ?? 0,
    },
  });
}

function summarizeOutput(agentName: AgentName, output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const o = output as Record<string, unknown>;

  switch (agentName) {
    case "chief-editor":
      return o.strategy
        ? `테마: "${(o.strategy as { theme?: string })?.theme}", ${((o.strategy as { contentSlots?: unknown[] })?.contentSlots ?? []).length}개 슬롯`
        : `${(o.assignments as unknown[] ?? []).length}개 배정`;
    case "trend-scout":
      return `${(o.topics as unknown[] ?? []).length}개 토픽, ${(o.urgentAlerts as unknown[] ?? []).length}개 긴급`;
    case "content-producer":
      return `"${o.topic}" — 품질 ${o.qualityScore}/100 ${o.autoApproved ? "(자동승인)" : "(검토필요)"}`;
    case "design-director":
      return `${(o.designAssets as unknown[] ?? []).length}개 디자인 생성`;
    case "growth-analyst":
      return `${(o.performance as { totalPosts?: number })?.totalPosts ?? 0}개 포스트, 비용 $${((o.cost as { totalUsd?: number })?.totalUsd ?? 0).toFixed(2)}`;
    case "community-manager":
      return `${o.repliesSent ?? 0}건 응답, ${(o.escalations as unknown[] ?? []).length}건 에스컬레이션`;
    case "copy-editor":
      return `판정: ${o.verdict ?? "?"} — ${o.issueCount ?? 0}건 이슈`;
    case "seo-strategist":
      return o.mode === "audit"
        ? `감사: ${o.totalAudited ?? 0}개 포스트, ${o.issuesFound ?? 0}건 이슈`
        : `최적화: "${(o.optimizedSeo as { seoTitle?: string })?.seoTitle ?? ""}"`;
    case "monetization-manager":
      return o.mode === "weekly-report"
        ? `수익 ₩${((o.weeklyReport as { totalRevenue?: number })?.totalRevenue ?? 0).toLocaleString()}, ${((o.weeklyReport as { activeDealCount?: number })?.activeDealCount ?? 0)}건 딜`
        : `제휴링크 ${(o.affiliateInsert as { linksInserted?: number })?.linksInserted ?? 0}개 삽입`;
    case "content-curator":
      return `스테일 ${(o.staleContent as unknown[] ?? []).length}건, 에버그린 ${(o.evergreenContent as unknown[] ?? []).length}건, 시리즈 ${(o.seriesConnections as unknown[] ?? []).length}건`;
    case "newsletter-manager":
      return o.status === "sent"
        ? `"${o.subject}" → ${o.recipientCount ?? 0}명 발송`
        : `상태: ${o.status ?? "unknown"}`;
    case "partnership-manager":
      return o.mode === "weekly-review"
        ? `파트너 ${(o.weeklyReview as { activePartners?: number })?.activePartners ?? 0}개, 지연 ${((o.weeklyReview as { overdueTasks?: unknown[] })?.overdueTasks ?? []).length}건`
        : `기회 ${(o.opportunities as unknown[] ?? []).length}건 발견`;
    default:
      return "";
  }
}
