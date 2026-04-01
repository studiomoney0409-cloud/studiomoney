/**
 * SEO Strategist Agent — Inngest Functions
 *
 * Pre-publish: copy-editor.passed → SEO optimize → emit to monetization
 * Audit: weekly cron → scan all published content
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runSeoPrePublish, runSeoAudit } from "@/lib/agents/seo-strategist";

/** Pre-publish SEO optimization — triggered after Copy Editor passes. */
export const seoStrategistPrePublish = inngest.createFunction(
  { id: "seo-strategist-pre-publish", retries: 1 },
  { event: "agent/copy-editor.passed" },
  async ({ event, step }) => {
    const {
      articleContent,
      topic,
      platforms,
      pipelineRunId,
      personaId,
      publicationIds,
      blogPostId,
      agentRunId: _parentRunId,
    } = event.data as {
      articleContent: string;
      topic: string;
      platforms: string[];
      pipelineRunId?: string;
      personaId?: string;
      publicationIds: string[];
      blogPostId?: string;
      agentRunId: string;
    };

    const result = await step.run("run-seo-optimization", () =>
      runAgent("seo-strategist", (ctx) =>
        runSeoPrePublish(ctx, {
          articleContent,
          topic,
          platforms,
          pipelineRunId,
          blogPostId,
        }),
      {
        triggerType: "event",
        triggerRef: "agent/copy-editor.passed",
      }),
    );

    // Pass through to Monetization Manager
    await step.run("emit-optimized", () =>
      inngest.send({
        name: "agent/seo-strategist.optimized",
        data: {
          articleContent,
          topic,
          platforms,
          blogPostId,
          pipelineRunId,
          personaId,
          publicationIds,
          seoKeywords: result.data?.optimizedSeo?.seoKeywords ?? [],
          agentRunId: result.runId,
        },
      }),
    );

    return result;
  },
);

/** Weekly SEO audit — every Monday 11:00 KST (02:00 UTC). */
export const seoStrategistAudit = inngest.createFunction(
  { id: "seo-strategist-audit", retries: 1 },
  { cron: "0 2 * * 1" },
  async ({ step }) => {
    const result = await step.run("run-seo-audit", () =>
      runAgent("seo-strategist", runSeoAudit, {
        triggerType: "cron",
        triggerRef: "0 2 * * 1",
      }),
    );

    if (result.success && result.data) {
      await step.run("emit-audit-complete", () =>
        inngest.send({
          name: "agent/seo-strategist.audit-complete",
          data: {
            issuesFound: result.data!.issuesFound ?? 0,
            highPriorityCount: result.data!.auditResults?.filter((r) => r.estimatedImpact === "high").length ?? 0,
            auditResults: result.data!.auditResults,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
