/**
 * Community Manager Agent — Inngest Function
 *
 * Replaces the original commentFetch with enhanced community management.
 * Runs every 10 minutes.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runCommunityManagement } from "@/lib/agents/community-manager";

/** Community management scan — every 10 minutes. */
export const communityManagerScan = inngest.createFunction(
  { id: "community-manager-scan", retries: 2 },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const result = await step.run("community-management", () =>
      runAgent("community-manager", runCommunityManagement, {
        triggerType: "cron",
        triggerRef: "*/10 * * * *",
      }),
    );

    // Emit escalation events if any
    if (result.success && result.data?.escalations.length) {
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
    }

    return result;
  },
);
