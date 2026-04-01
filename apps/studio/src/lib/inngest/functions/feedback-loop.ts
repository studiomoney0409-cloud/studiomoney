/**
 * Feedback Loop — triggered by Growth Analyst weekly report.
 *
 * Runs the full feedback analysis pipeline:
 * 1. Auto-select golden examples for personas (top 20% articles)
 * 2. Calibrate rubric weights (correlate scores with engagement)
 * 3. Check anti-clickbait guardrails
 *
 * This closes the persona learning loop:
 *   Growth Analyst → Feedback Analyzer → Persona Update
 */
import { inngest } from "../client";
import {
  autoSelectGoldenExamples,
  calibrateRubricWeights,
  checkGuardrails,
} from "@/lib/pipeline/feedback-analyzer";
import { notifySlack } from "@/lib/notify";

/** Auto persona learning — triggered weekly after Growth Analyst report. */
export const feedbackLoop = inngest.createFunction(
  { id: "feedback-loop", retries: 1 },
  { event: "agent/growth-analyst.report" },
  async ({ event, step }) => {
    const report = event.data.report as { period: string };

    // Only run on weekly reports (daily is too frequent for persona updates)
    if (report.period !== "weekly") {
      return { skipped: true, reason: "Only runs on weekly reports" };
    }

    // 1. Auto-select golden examples
    const goldenResult = await step.run("auto-select-golden-examples", () =>
      autoSelectGoldenExamples(),
    );

    // 2. Calibrate rubric weights
    const rubricResult = await step.run("calibrate-rubric-weights", () =>
      calibrateRubricWeights(),
    );

    // 3. Check guardrails
    const guardrails = await step.run("check-guardrails", () =>
      checkGuardrails(),
    );

    // 4. Notify if guardrails triggered
    if (guardrails.alerts.length > 0) {
      await step.run("notify-guardrail-alerts", () =>
        notifySlack(
          `:rotating_light: [Feedback Loop] 가드레일 경고`,
          {
            qcrStatus: guardrails.qcrStatus,
            diversityStatus: guardrails.diversityStatus,
            alerts: guardrails.alerts,
          },
        ),
      );
    }

    // 5. Store rubric calibration if available
    if (rubricResult.calibrations.length > 0) {
      await step.run("store-rubric-calibration", async () => {
        const { prisma } = await import("@/lib/db");
        await prisma.setting.upsert({
          where: { key: "rubric-calibration" },
          create: {
            key: "rubric-calibration",
            value: JSON.stringify(rubricResult.calibrations),
          },
          update: {
            value: JSON.stringify(rubricResult.calibrations),
          },
        });
      });
    }

    return {
      goldenExampleUpdates: goldenResult.updates.length,
      goldenSkipped: goldenResult.skipped || undefined,
      rubricCalibrations: rubricResult.calibrations.length,
      rubricSkipped: rubricResult.skipped || undefined,
      guardrailAlerts: guardrails.alerts,
    };
  },
);
