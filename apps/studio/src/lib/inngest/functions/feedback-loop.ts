/**
 * Feedback Loop — triggered by Growth Analyst weekly report.
 *
 * Runs the full feedback analysis pipeline:
 * 1. Topic performance analysis (writes TopicPerformance + Setting "topic-insights")
 * 2. Auto-select golden examples for personas (top 20% articles)
 * 3. Calibrate rubric weights (correlate scores with engagement)
 * 4. Check anti-clickbait guardrails
 *
 * Closes the learning loop: Growth Analyst → Feedback Analyzer → Persona/Topic Update.
 */
import { inngest } from "../client";
import {
  analyzeTopicPerformance,
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

    // 1. Topic performance analysis (writes to TopicPerformance table)
    const topicResult = await step.run("analyze-topic-performance", () =>
      analyzeTopicPerformance(),
    );

    // 2. Auto-select golden examples
    const goldenResult = await step.run("auto-select-golden-examples", () =>
      autoSelectGoldenExamples(),
    );

    // 3. Calibrate rubric weights
    const rubricResult = await step.run("calibrate-rubric-weights", () =>
      calibrateRubricWeights(),
    );

    // 4. Check guardrails
    const guardrails = await step.run("check-guardrails", () =>
      checkGuardrails(),
    );

    // 5. Persist topic insights snapshot for downstream readers (scanner, plan/generate)
    if (topicResult.insights.length > 0) {
      await step.run("store-topic-insights", async () => {
        const { prisma } = await import("@/lib/db");
        await prisma.setting.upsert({
          where: { key: "topic-insights" },
          create: {
            key: "topic-insights",
            value: JSON.stringify({
              insights: topicResult.insights,
              totalArticles: topicResult.totalArticles,
              updatedAt: new Date().toISOString(),
            }),
          },
          update: {
            value: JSON.stringify({
              insights: topicResult.insights,
              totalArticles: topicResult.totalArticles,
              updatedAt: new Date().toISOString(),
            }),
          },
        });
      });
    }

    // 6. Notify if guardrails triggered
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

    // 7. Store rubric calibration if available
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
      topicInsights: topicResult.insights.length,
      totalArticlesTracked: topicResult.totalArticles,
      goldenExampleUpdates: goldenResult.updates.length,
      goldenSkipped: goldenResult.skipped || undefined,
      rubricCalibrations: rubricResult.calibrations.length,
      rubricSkipped: rubricResult.skipped || undefined,
      guardrailAlerts: guardrails.alerts,
    };
  },
);
