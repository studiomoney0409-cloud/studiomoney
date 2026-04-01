/**
 * Partnership Manager Agent — Inngest Functions
 *
 * Weekly review: Monday 10:00 KST (01:00 UTC)
 * Opportunity scan: triggered by trend-scout.briefing
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runWeeklyReview, runOpportunityScan } from "@/lib/agents/partnership-manager";
import type { TrendBriefing } from "@/lib/agents/types";

/** Weekly partnership review — every Monday 10:00 KST (01:00 UTC). */
export const partnershipWeeklyReview = inngest.createFunction(
  { id: "partnership-weekly-review", retries: 1 },
  { cron: "0 1 * * 1" },
  async ({ step }) => {
    const result = await step.run("run-weekly-review", () =>
      runAgent("partnership-manager", runWeeklyReview, {
        triggerType: "cron",
        triggerRef: "0 1 * * 1",
      }),
    );

    if (result.success && result.data?.weeklyReview) {
      await step.run("emit-review", () =>
        inngest.send({
          name: "agent/partnership-manager.review",
          data: {
            review: result.data!.weeklyReview!,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);

/** Opportunity scan — triggered by Trend Scout briefing. */
export const partnershipOpportunityScan = inngest.createFunction(
  { id: "partnership-opportunity-scan", retries: 0 },
  { event: "agent/trend-scout.briefing" },
  async ({ event, step }) => {
    const { briefing } = event.data as { briefing: TrendBriefing };

    const result = await step.run("run-opportunity-scan", () =>
      runAgent("partnership-manager", (ctx) =>
        runOpportunityScan(ctx, briefing),
      {
        triggerType: "event",
        triggerRef: "agent/trend-scout.briefing",
      }),
    );

    // Emit high-priority opportunities for Chief Editor approval
    if (result.success && result.data?.opportunities) {
      const highPriority = result.data.opportunities.filter((o) => o.priority === "high");
      for (const opp of highPriority) {
        await step.run(`emit-opportunity-${opp.entityName}`, () =>
          inngest.send({
            name: "agent/partnership-manager.opportunity",
            data: {
              entityName: opp.entityName,
              entityType: opp.entityType,
              priority: opp.priority,
              suggestedApproach: opp.suggestedApproach,
              agentRunId: result.runId,
            },
          }),
        );
      }
    }

    return result;
  },
);
