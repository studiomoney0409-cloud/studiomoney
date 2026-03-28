/**
 * Trend Scout Agent — Inngest Function
 *
 * Scans trends every 30 minutes, detects urgency, emits alerts.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runTrendScout } from "@/lib/agents/trend-scout";

/** Trend scan — every 30 minutes. */
export const trendScoutScan = inngest.createFunction(
  { id: "trend-scout-scan", retries: 2 },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const result = await step.run("scan-trends", () =>
      runAgent("trend-scout", runTrendScout, {
        triggerType: "cron",
        triggerRef: "*/30 * * * *",
      }),
    );

    // Emit briefing event
    if (result.success && result.data) {
      await step.run("emit-briefing", () =>
        inngest.send({
          name: "agent/trend-scout.briefing",
          data: {
            briefing: result.data!,
            agentRunId: result.runId,
          },
        }),
      );

      // Emit urgent alerts individually
      if (result.data.urgentAlerts.length > 0) {
        for (const alert of result.data.urgentAlerts) {
          await step.run(`emit-urgent-${alert.topic.slice(0, 20)}`, () =>
            inngest.send({
              name: "agent/trend-scout.urgent-alert",
              data: {
                alert,
                agentRunId: result.runId,
              },
            }),
          );
        }
      }
    }

    return result;
  },
);
