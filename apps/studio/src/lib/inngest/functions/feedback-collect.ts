import { inngest } from "../client";
import { collectDueMetrics } from "@/lib/pipeline/feedback-collector";

/** Hourly feedback metrics collection — fills 1h/24h/7d/30d windows on PipelineRun. */
export const feedbackCollect = inngest.createFunction(
  { id: "feedback-collect", retries: 2 },
  { cron: "0 * * * *" },
  async ({ step }) => {
    return step.run("collect-due-metrics", () => collectDueMetrics());
  },
);
