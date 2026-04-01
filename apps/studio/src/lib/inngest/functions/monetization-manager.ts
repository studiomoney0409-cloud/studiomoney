/**
 * Monetization Manager Agent — Inngest Functions
 *
 * Affiliate insert: seo-strategist.optimized → insert links → emit to Design Director
 * Weekly report: cron → aggregate revenue → emit to Chief Editor
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runAffiliateInsert, runWeeklyRevenueReport } from "@/lib/agents/monetization-manager";

/** Affiliate link insertion — triggered after SEO optimization. */
export const monetizationAffiliateInsert = inngest.createFunction(
  { id: "monetization-affiliate-insert", retries: 1 },
  { event: "agent/seo-strategist.optimized" },
  async ({ event, step }) => {
    const {
      articleContent,
      topic,
      platforms,
      blogPostId,
      pipelineRunId,
      personaId,
      publicationIds,
      seoKeywords,
      agentRunId: _parentRunId,
    } = event.data as {
      articleContent: string;
      topic: string;
      platforms: string[];
      blogPostId?: string;
      pipelineRunId?: string;
      personaId?: string;
      publicationIds: string[];
      seoKeywords: string[];
      agentRunId: string;
    };

    const result = await step.run("run-affiliate-insert", () =>
      runAgent("monetization-manager", (ctx) =>
        runAffiliateInsert(ctx, {
          articleContent,
          topic,
          blogPostId,
          seoKeywords,
        }),
      {
        triggerType: "event",
        triggerRef: "agent/seo-strategist.optimized",
      }),
    );

    // Pass through to Design Director (regardless of insert result)
    await step.run("emit-content-ready", () =>
      inngest.send({
        name: "agent/monetization-manager.content-ready",
        data: {
          articleContent,
          topic,
          platforms,
          blogPostId,
          pipelineRunId,
          personaId,
          publicationIds,
          affiliateLinksInserted: result.data?.affiliateInsert?.linksInserted ?? 0,
          agentRunId: result.runId,
        },
      }),
    );

    return result;
  },
);

/** Weekly revenue report — every Monday 13:00 KST (04:00 UTC). */
export const monetizationWeeklyReport = inngest.createFunction(
  { id: "monetization-weekly-report", retries: 1 },
  { cron: "0 4 * * 1" },
  async ({ step }) => {
    const result = await step.run("run-weekly-report", () =>
      runAgent("monetization-manager", runWeeklyRevenueReport, {
        triggerType: "cron",
        triggerRef: "0 4 * * 1",
      }),
    );

    if (result.success && result.data?.weeklyReport) {
      await step.run("emit-report", () =>
        inngest.send({
          name: "agent/monetization-manager.report",
          data: {
            report: result.data!.weeklyReport!,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
