import { prisma } from "@/lib/db";

/**
 * Build a Korean prompt fragment that surfaces topic performance feedback
 * (top performers + declining ones) for content planning prompts.
 *
 * Reads from the `TopicPerformance` table, which is updated weekly by the
 * feedback-loop inngest function via `analyzeTopicPerformance()`.
 *
 * Returns "" when there is no performance data yet (cold start).
 */
export async function buildTopicPerformanceContext(): Promise<string> {
  const perf = await prisma.topicPerformance.findMany({
    orderBy: { avgEngagement: "desc" },
    take: 15,
  });
  if (perf.length === 0) return "";

  const lines: string[] = ["\n## 토픽 성과 피드백 (실제 참여율 기반)"];
  const rising = perf.slice(0, 5);
  const declining = perf.filter((t) => t.avgEngagement < 0.02).slice(0, 5);

  if (rising.length > 0) {
    lines.push("참여율 상승 중 (적극 다루기):");
    for (const t of rising) {
      lines.push(
        `- ${t.topic} (${t.category}, 평균 참여율: ${(t.avgEngagement * 100).toFixed(1)}%)`,
      );
    }
  }
  if (declining.length > 0) {
    lines.push("참여율 하락 중 (피하기):");
    for (const t of declining) {
      lines.push(
        `- ${t.topic} (${t.category}, 평균 참여율: ${(t.avgEngagement * 100).toFixed(1)}%)`,
      );
    }
  }
  return lines.join("\n");
}
