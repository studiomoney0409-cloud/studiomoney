/**
 * Community Manager Agent — Inngest Function
 *
 * Replaces the original commentFetch with enhanced community management.
 * Runs every 10 minutes.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runCommunityManagement } from "@/lib/agents/community-manager";

/** Community management scan — every 10 minutes (skips if no recent activity). */
export const communityManagerScan = inngest.createFunction(
  { id: "community-manager-scan", retries: 2 },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    // Early return if no recent comments — saves LLM cost on idle periods
    const hasActivity = await step.run("check-activity", async () => {
      const { prisma } = await import("@/lib/db");
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentCount = await prisma.incomingMessage.count({
        where: { receivedAt: { gte: tenMinAgo } },
      });
      return recentCount > 0;
    });

    if (!hasActivity) {
      return { skipped: true, reason: "No recent comments" };
    }

    const result = await step.run("community-management", () =>
      runAgent("community-manager", runCommunityManagement, {
        triggerType: "cron",
        triggerRef: "*/10 * * * *",
      }),
    );

    if (result.success && result.data) {
      // Emit escalation events if any
      for (const escalation of result.data.escalations) {
        await step.run(`escalate-${escalation.slice(0, 20)}`, () =>
          inngest.send({
            name: "agent/community-manager.escalation",
            data: {
              type: "negative-surge" as const,
              details: escalation,
              agentRunId: result.runId,
            },
          }),
        );
      }

      // Emit content idea events to Chief Editor for auto-assignment
      for (let i = 0; i < result.data.contentIdeas.length; i++) {
        const idea = result.data.contentIdeas[i]!;
        await step.run(`content-idea-${i}`, () =>
          inngest.send({
            name: "agent/community-manager.escalation",
            data: {
              type: "content-idea" as const,
              details: idea,
              agentRunId: result.runId,
            },
          }),
        );
      }
    }

    return result;
  },
);
