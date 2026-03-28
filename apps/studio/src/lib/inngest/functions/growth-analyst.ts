/**
 * Growth Analyst Agent — Inngest Functions
 *
 * Daily analysis (22:00 KST = 13:00 UTC) + Weekly analysis (Sunday)
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runDailyAnalysis, runWeeklyAnalysis } from "@/lib/agents/growth-analyst";

/** Daily growth analysis — every day 22:00 KST (13:00 UTC). */
export const growthAnalystDaily = inngest.createFunction(
  { id: "growth-analyst-daily", retries: 1 },
  { cron: "0 13 * * *" },
  async ({ step }) => {
    const result = await step.run("daily-analysis", () =>
      runAgent("growth-analyst", runDailyAnalysis, {
        triggerType: "cron",
        triggerRef: "0 13 * * *",
      }),
    );

    if (result.success && result.data) {
      await step.run("emit-report", () =>
        inngest.send({
          name: "agent/growth-analyst.report",
          data: {
            report: result.data!,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);

/** Weekly strategic analysis — every Sunday 22:00 KST (13:00 UTC). */
export const growthAnalystWeekly = inngest.createFunction(
  { id: "growth-analyst-weekly", retries: 1 },
  { cron: "0 13 * * 0" },
  async ({ step }) => {
    const result = await step.run("weekly-analysis", () =>
      runAgent("growth-analyst", runWeeklyAnalysis, {
        triggerType: "cron",
        triggerRef: "0 13 * * 0",
      }),
    );

    if (result.success && result.data) {
      await step.run("emit-report", () =>
        inngest.send({
          name: "agent/growth-analyst.report",
          data: {
            report: result.data!,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
