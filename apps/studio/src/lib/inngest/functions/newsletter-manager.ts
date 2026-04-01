/**
 * Newsletter Manager Agent — Inngest Functions
 *
 * Weekly digest: Friday 07:00 KST (Thursday 22:00 UTC)
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runWeeklyDigest } from "@/lib/agents/newsletter-manager";

/** Weekly newsletter digest — every Friday 07:00 KST (Thursday 22:00 UTC). */
export const newsletterWeeklyDigest = inngest.createFunction(
  { id: "newsletter-weekly-digest", retries: 1 },
  { cron: "0 22 * * 4" },
  async ({ step }) => {
    const result = await step.run("run-weekly-digest", () =>
      runAgent("newsletter-manager", runWeeklyDigest, {
        triggerType: "cron",
        triggerRef: "0 22 * * 4",
      }),
    );

    if (result.success && result.data && result.data.recipientCount > 0) {
      await step.run("emit-sent", () =>
        inngest.send({
          name: "agent/newsletter-manager.sent",
          data: {
            issueId: result.data!.issueId,
            recipientCount: result.data!.recipientCount,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
