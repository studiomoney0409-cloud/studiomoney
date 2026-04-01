/**
 * Content Curator Agent — Inngest Functions
 *
 * Audit: weekly cron → scan all content → emit refresh/series/re-promote
 * Link-new: content-producer.complete → find related content (runs in parallel, non-blocking)
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runContentAudit, runLinkNew } from "@/lib/agents/content-curator";

/** Weekly content audit — every Wednesday 12:00 KST (03:00 UTC). */
export const contentCuratorAudit = inngest.createFunction(
  { id: "content-curator-audit", retries: 1 },
  { cron: "0 3 * * 3" },
  async ({ step }) => {
    const result = await step.run("run-content-audit", () =>
      runAgent("content-curator", runContentAudit, {
        triggerType: "cron",
        triggerRef: "0 3 * * 3",
      }),
    );

    if (!result.success || !result.data) return result;

    const data = result.data;

    // Emit refresh-needed if stale content found
    if (data.staleContent.length > 0) {
      await step.run("emit-refresh-needed", () =>
        inngest.send({
          name: "agent/content-curator.refresh-needed",
          data: {
            stalePostIds: data.staleContent.map((s) => s.blogPostId),
            evergreenPostIds: data.evergreenContent.map((e) => e.blogPostId),
            agentRunId: result.runId,
          },
        }),
      );
    }

    // Emit series-found for SEO Strategist
    if (data.seriesConnections.length > 0) {
      await step.run("emit-series-found", () =>
        inngest.send({
          name: "agent/content-curator.series-found",
          data: {
            series: data.seriesConnections.map((s) => ({
              articleIds: s.articles.map((a) => a.blogPostId),
              theme: s.seriesTheme,
            })),
            agentRunId: result.runId,
          },
        }),
      );
    }

    // Emit re-promote for top evergreen content
    for (const eg of data.evergreenContent.slice(0, 3)) {
      await step.run(`emit-re-promote-${eg.blogPostId}`, () =>
        inngest.send({
          name: "agent/content-curator.re-promote",
          data: {
            blogPostId: eg.blogPostId,
            suggestedPlatforms: eg.suggestedPlatforms,
            suggestion: eg.rePromotionSuggestion,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);

/** Link-new — triggered by content-producer.complete (parallel, non-blocking). */
export const contentCuratorLinkNew = inngest.createFunction(
  { id: "content-curator-link-new", retries: 0 },
  { event: "agent/content-producer.complete" },
  async ({ event, step }) => {
    const { topic, articleContent } = event.data as {
      topic: string;
      articleContent: string;
      result: { pipelineRunId?: string };
    };

    const result = await step.run("run-link-new", () =>
      runAgent("content-curator", (ctx) =>
        runLinkNew(ctx, { topic, articleContent }),
      {
        triggerType: "event",
        triggerRef: "agent/content-producer.complete",
      }),
    );

    // Emit series connections if found
    if (result.success && result.data && result.data.seriesConnections.length > 0) {
      await step.run("emit-series", () =>
        inngest.send({
          name: "agent/content-curator.series-found",
          data: {
            series: result.data!.seriesConnections.map((s) => ({
              articleIds: s.articles.map((a) => a.blogPostId),
              theme: s.seriesTheme,
            })),
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
