import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentName: string }> },
) {
  const { agentName } = await params;

  // Recent runs for this agent
  const runs = await prisma.agentRun.findMany({
    where: { agentName },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      agentName: true,
      triggerType: true,
      triggerRef: true,
      status: true,
      outputJson: true,
      errorMessage: true,
      costUsd: true,
      durationMs: true,
      startedAt: true,
      completedAt: true,
    },
  });

  // Logs for the most recent run
  const latestRunId = runs[0]?.id;
  const latestLogs = latestRunId
    ? await prisma.agentLog.findMany({
        where: { agentRunId: latestRunId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          level: true,
          message: true,
          metadata: true,
          createdAt: true,
        },
      })
    : [];

  // Stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayCount, weekCount, weekCost, totalRuns] = await Promise.all([
    prisma.agentRun.count({
      where: { agentName, startedAt: { gte: today } },
    }),
    prisma.agentRun.count({
      where: { agentName, startedAt: { gte: weekAgo } },
    }),
    prisma.agentRun.aggregate({
      where: { agentName, startedAt: { gte: weekAgo } },
      _sum: { costUsd: true },
      _avg: { durationMs: true },
    }),
    prisma.agentRun.count({ where: { agentName } }),
  ]);

  const failedThisWeek = await prisma.agentRun.count({
    where: { agentName, status: "failed", startedAt: { gte: weekAgo } },
  });

  return NextResponse.json({
    agentName,
    stats: {
      todayRuns: todayCount,
      weekRuns: weekCount,
      weekCost: weekCost._sum.costUsd ?? 0,
      avgDurationMs: Math.round(weekCost._avg.durationMs ?? 0),
      failedThisWeek,
      totalRuns,
      successRate: weekCount > 0 ? Math.round(((weekCount - failedThisWeek) / weekCount) * 100) : 100,
    },
    runs: runs.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString(),
    })),
    latestLogs: latestLogs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
