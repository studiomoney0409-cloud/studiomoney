/**
 * Chief Editor Agent — strategic orchestrator for the magazine.
 *
 * Three modes:
 *   1. Weekly Strategy (Mon 09:00 KST) — plan the week's content
 *   2. Daily Briefing (Daily 09:00 KST) — assign today's tasks
 *   3. Emergency Response (event-triggered) — handle breaking trends
 */
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type {
  AgentContext,
  WeeklyStrategy,
  ContentSlot,
  DailyAssignment,
  GrowthReport,
  TrendBriefing,
} from "./types";

// ── Weekly Strategy ───────────────────────────────────────

export async function runWeeklyStrategy(ctx: AgentContext): Promise<{
  weeklyPlanId: string;
  strategy: WeeklyStrategy;
}> {
  await ctx.log("info", "Starting weekly strategy generation");

  // 1. Get latest Growth Analyst report
  const latestGrowthRun = await ctx.prisma.agentRun.findFirst({
    where: { agentName: "growth-analyst", status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { outputJson: true },
  });
  const growthReport = latestGrowthRun?.outputJson as GrowthReport | null;

  // 2. Get topic performance trends
  const topicPerformance = await ctx.prisma.topicPerformance.findMany({
    orderBy: { avgEngagement: "desc" },
    take: 20,
  });

  const risingTopics = topicPerformance.slice(0, 5).map((t) => t.topic); // top engagement
  const decliningTopics = topicPerformance.slice(-5).map((t) => t.topic); // bottom engagement

  // 3. Get recent content to avoid repetition
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentContent = await ctx.prisma.pipelineRun.findMany({
    where: { createdAt: { gte: weekAgo } },
    select: { topic: true, contentType: true, status: true },
    take: 30,
  });

  // 4. Get active personas
  const personas = await ctx.prisma.writingPersona.findMany({
    where: { isActive: true },
    select: { id: true, name: true, styleFingerprint: true, expertiseAreas: true },
  });

  // 5. Get active SNS accounts for platform targeting
  const accounts = await ctx.prisma.snsAccount.findMany({
    select: { platform: true, displayName: true },
  });
  const platforms = [...new Set(accounts.map((a) => a.platform))];

  // 6. Generate strategy via Claude Sonnet
  const prompt = `당신은 한국 인디/밴드 음악 웹매거진의 편집장 AI입니다.
이번 주 콘텐츠 전략을 수립해주세요.

## 성과 데이터
${growthReport ? `
- 지난주 평균 참여율: ${growthReport.performance.avgEngagement}
- 잘된 주제: ${growthReport.performance.topPerformingTopics.join(", ") || "데이터 없음"}
- 부진한 주제: ${growthReport.performance.underperformingTopics.join(", ") || "데이터 없음"}
- 팔로워 변화: ${growthReport.followers.change > 0 ? "+" : ""}${growthReport.followers.change}
- 비용: $${growthReport.cost.totalUsd.toFixed(2)} (예산 ${growthReport.cost.budgetUsedPercent}% 사용)
` : "아직 성과 데이터가 없습니다."}

## 토픽 트렌드
- 상승 중: ${risingTopics.slice(0, 5).join(", ") || "없음"}
- 하락 중: ${decliningTopics.slice(0, 5).join(", ") || "없음"}

## 최근 7일 콘텐츠 (중복 방지)
${recentContent.map((c) => `- [${c.contentType}] ${c.topic}`).join("\n") || "없음"}

## 사용 가능한 페르소나
${personas.map((p) => `- ${p.name}: ${p.expertiseAreas.join(", ")}`).join("\n") || "기본 페르소나"}

## 사용 가능한 플랫폼
${platforms.join(", ") || "instagram, threads"}

## 지시사항
1. 주간 테마를 설정하세요 (일관된 브랜딩)
2. 월~금 각 요일에 1-2개 콘텐츠 슬롯을 배정하세요
3. 콘텐츠 유형을 다양하게 (blog, sns, carousel) 섞으세요
4. 상승 주제에 가중치를 두고, 하락 주제는 피하세요
5. 최근 7일과 중복되지 않는 새로운 주제를 선택하세요

Return JSON only.`;

  const strategy = await callGptJson(prompt, {
    model: "claude-sonnet",
    caller: `chief-editor:weekly`,
    temperature: 0.7,
    schema: z.object({
      theme: z.string(),
      goals: z.array(z.string()),
      contentSlots: z.array(z.object({
        day: z.string(),
        topic: z.string(),
        angle: z.string(),
        contentType: z.string(),
        priority: z.enum(["urgent", "high", "normal"]),
        personaId: z.string().optional(),
        platforms: z.array(z.string()),
      })),
      contentMix: z.object({
        blog: z.number(),
        sns: z.number(),
        carousel: z.number(),
      }),
    }),
  });

  // 7. Save to DB
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weeklyPlan = await ctx.prisma.weeklyPlan.create({
    data: {
      weekStart: monday,
      weekEnd: sunday,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      strategyJson: strategy as any,
      statusJson: { completed: [], inProgress: [], cancelled: [] },
      agentRunId: ctx.runId,
    },
  });

  await ctx.log("info", `Weekly plan created: ${weeklyPlan.id} — theme: "${strategy.theme}", ${strategy.contentSlots.length} slots`);

  return { weeklyPlanId: weeklyPlan.id, strategy };
}

// ── Daily Briefing ────────────────────────────────────────

export async function runDailyBriefing(ctx: AgentContext): Promise<{
  briefingId: string;
  assignments: DailyAssignment[];
}> {
  await ctx.log("info", "Starting daily briefing");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][today.getDay()];

  // 1. Load current weekly plan
  const weeklyPlan = await ctx.prisma.weeklyPlan.findFirst({
    where: { weekStart: { lte: today }, weekEnd: { gte: today } },
    orderBy: { createdAt: "desc" },
  });

  const strategy = weeklyPlan?.strategyJson as WeeklyStrategy | null;
  const todaySlots: ContentSlot[] = strategy?.contentSlots.filter(
    (s) => s.day.toLowerCase() === dayOfWeek,
  ) ?? [];

  // 2. Get latest trend scout briefing
  const latestTrendRun = await ctx.prisma.agentRun.findFirst({
    where: { agentName: "trend-scout", status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { outputJson: true },
  });
  const trendBriefing = latestTrendRun?.outputJson as TrendBriefing | null;
  const trendSummary = trendBriefing?.topics.slice(0, 5).map((t) => `- ${t.topic} (score: ${t.score.toFixed(2)})`).join("\n") ?? "트렌드 데이터 없음";

  // 3. Check yesterday's completion
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayBriefing = await ctx.prisma.dailyBriefing.findUnique({
    where: { date: yesterday },
  });

  const missedFromYesterday: DailyAssignment[] = [];
  if (yesterdayBriefing) {
    const yStatus = yesterdayBriefing.statusJson as Record<string, string> | null;
    const yAssignments = yesterdayBriefing.assignmentsJson as unknown as DailyAssignment[];
    if (yStatus && yAssignments) {
      for (let i = 0; i < yAssignments.length; i++) {
        const yAssignment = yAssignments[i];
        if (yStatus[String(i)] !== "completed" && yAssignment?.topic) {
          missedFromYesterday.push({ ...yAssignment, priority: "high" as const });
        }
      }
    }
  }

  // 4. Build assignments: weekly plan slots + missed from yesterday + urgent trends
  const assignments: DailyAssignment[] = [];

  // Add missed tasks from yesterday
  for (const missed of missedFromYesterday.slice(0, 2)) {
    assignments.push(missed);
  }

  // Add today's planned slots
  for (const slot of todaySlots) {
    assignments.push({
      topic: slot.topic,
      angle: slot.angle,
      contentType: slot.contentType,
      priority: slot.priority,
      personaId: slot.personaId,
      platforms: slot.platforms,
    });
  }

  // Add urgent trends if any
  if (trendBriefing?.urgentAlerts.length) {
    for (const alert of trendBriefing.urgentAlerts.slice(0, 1)) {
      // Avoid duplicating a topic already in plan
      const isDuplicate = assignments.some(
        (a) => a.topic.includes(alert.topic) || alert.topic.includes(a.topic),
      );
      if (!isDuplicate) {
        assignments.push({
          topic: alert.topic,
          angle: "속보/트렌드 분석",
          contentType: "sns",
          priority: "urgent",
          platforms: ["threads", "instagram"],
        });
      }
    }
  }

  // If no assignments at all, create a default one from top trends
  if (assignments.length === 0 && trendBriefing?.topics?.[0]) {
    const top = trendBriefing.topics[0];
    assignments.push({
      topic: top.topic,
      angle: top.angle || "트렌드 분석",
      contentType: top.contentType || "sns",
      priority: "normal",
      platforms: ["instagram"],
    });
  }

  // 5. Save briefing
  const briefing = await ctx.prisma.dailyBriefing.upsert({
    where: { date: today },
    create: {
      date: today,
      weeklyPlanId: weeklyPlan?.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignmentsJson: assignments as any,
      trendSummary,
      statusJson: Object.fromEntries(assignments.map((_, i) => [String(i), "pending"])),
      agentRunId: ctx.runId,
    },
    update: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignmentsJson: assignments as any,
      trendSummary,
      statusJson: Object.fromEntries(assignments.map((_, i) => [String(i), "pending"])),
      agentRunId: ctx.runId,
    },
  });

  await ctx.log("info", `Daily briefing: ${assignments.length} assignments (${missedFromYesterday.length} carried over)`);

  return { briefingId: briefing.id, assignments };
}

// ── Emergency Response ────────────────────────────────────

export async function runEmergencyResponse(
  ctx: AgentContext,
  alert: { topic: string; velocity: number; sources: string[] },
): Promise<{
  action: "produce" | "defer";
  assignment?: DailyAssignment;
  reason: string;
}> {
  await ctx.log("info", `Emergency evaluation: "${alert.topic}" (velocity: ${alert.velocity})`);

  // Check today's briefing to see current load
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const briefing = await ctx.prisma.dailyBriefing.findUnique({
    where: { date: today },
  });
  const currentAssignments = (briefing?.assignmentsJson as unknown as DailyAssignment[]) ?? [];
  const pendingCount = currentAssignments.filter(
    (_, i) => {
      const status = briefing?.statusJson as Record<string, string> | null;
      return status?.[String(i)] === "pending";
    },
  ).length;

  // High velocity (>= 85) → always produce
  // Medium velocity (70-84) → produce if today's queue is light (< 3 pending)
  // Low velocity (< 70) → defer to next day's plan
  if (alert.velocity >= 85) {
    const assignment: DailyAssignment = {
      topic: alert.topic,
      angle: "속보 분석",
      contentType: "sns",
      priority: "urgent",
      platforms: ["threads", "instagram"],
    };
    await ctx.log("info", `High urgency — producing immediately`);
    return { action: "produce", assignment, reason: `Velocity ${alert.velocity} — immediate production` };
  }

  if (alert.velocity >= 70 && pendingCount < 3) {
    const assignment: DailyAssignment = {
      topic: alert.topic,
      angle: "트렌드 분석",
      contentType: "sns",
      priority: "high",
      platforms: ["threads", "instagram"],
    };
    await ctx.log("info", `Medium urgency, light queue — producing`);
    return { action: "produce", assignment, reason: `Velocity ${alert.velocity}, queue light (${pendingCount} pending)` };
  }

  await ctx.log("info", `Deferred — velocity ${alert.velocity}, queue ${pendingCount} pending`);
  return { action: "defer", reason: `Velocity ${alert.velocity} too low or queue full (${pendingCount} pending)` };
}
