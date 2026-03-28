/**
 * Chief Editor Agent — Inngest Functions
 *
 * 1. Weekly strategy (Mon 09:00 KST = 00:00 UTC)
 * 2. Daily briefing (Daily 09:00 KST = 00:00 UTC)
 * 3. Emergency response (event-triggered)
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import {
  runWeeklyStrategy,
  runDailyBriefing,
  runEmergencyResponse,
} from "@/lib/agents/chief-editor";
import type { UrgentAlert } from "@/lib/agents/types";

/** Weekly content strategy — every Monday 09:00 KST (00:00 UTC). */
export const chiefEditorWeekly = inngest.createFunction(
  { id: "chief-editor-weekly", retries: 1 },
  { cron: "0 0 * * 1" },
  async ({ step }) => {
    const result = await step.run("weekly-strategy", () =>
      runAgent("chief-editor", runWeeklyStrategy, {
        triggerType: "cron",
        triggerRef: "0 0 * * 1",
      }),
    );

    if (result.success && result.data) {
      await step.run("emit-weekly-plan", () =>
        inngest.send({
          name: "agent/chief-editor.weekly-plan",
          data: {
            weeklyPlanId: result.data!.weeklyPlanId,
            weekStart: new Date().toISOString(),
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);

/** Daily briefing — every day 09:00 KST (00:00 UTC). */
export const chiefEditorDaily = inngest.createFunction(
  { id: "chief-editor-daily", retries: 1 },
  { cron: "0 0 * * *" },
  async ({ step }) => {
    const result = await step.run("daily-briefing", () =>
      runAgent("chief-editor", runDailyBriefing, {
        triggerType: "cron",
        triggerRef: "0 0 * * *",
      }),
    );

    if (result.success && result.data && result.data.assignments.length > 0) {
      await step.run("emit-daily-assignments", () =>
        inngest.send({
          name: "agent/chief-editor.daily-briefing",
          data: {
            date: new Date().toISOString().split("T")[0],
            assignments: result.data!.assignments,
            briefingId: result.data!.briefingId,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);

/** Emergency response — triggered by Trend Scout urgent alert. */
export const chiefEditorEmergency = inngest.createFunction(
  { id: "chief-editor-emergency", retries: 1 },
  { event: "agent/trend-scout.urgent-alert" },
  async ({ event, step }) => {
    const alert = event.data.alert as UrgentAlert;

    const result = await step.run("evaluate-emergency", () =>
      runAgent(
        "chief-editor",
        (ctx) => runEmergencyResponse(ctx, alert),
        {
          triggerType: "event",
          triggerRef: "agent/trend-scout.urgent-alert",
          input: { alert },
        },
      ),
    );

    if (result.success && result.data?.action === "produce" && result.data.assignment) {
      await step.run("emit-urgent-content", () =>
        inngest.send({
          name: "agent/chief-editor.urgent-content",
          data: {
            assignment: result.data!.assignment!,
            reason: result.data!.reason,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
