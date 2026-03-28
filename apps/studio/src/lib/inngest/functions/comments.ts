import { inngest } from "../client";
import { commentFetchHandler } from "@/lib/jobs/handlers/commentFetch";
import { commentMonitorHandler } from "@/lib/jobs/handlers/commentMonitor";

/**
 * Legacy comment fetch — kept for backward compatibility.
 * Community Manager agent (communityManagerScan) now handles enhanced
 * comment management with sentiment analysis and escalation.
 * This function serves as a fallback if the agent system is disabled.
 */
export const commentFetch = inngest.createFunction(
  { id: "comment-fetch", retries: 2 },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const result = await step.run("fetch-comments", () => commentFetchHandler.handle({}));
    // After fetching, classify and auto-reply
    await step.run("monitor-comments", () => commentMonitorHandler.handle({}));
    return result;
  },
);
