/**
 * Content Producer Agent — Inngest Functions
 *
 * Triggered by Chief Editor daily briefing or urgent content events.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runContentProduction } from "@/lib/agents/content-producer";
import { searchCandidateImages } from "@/lib/agents/image-curator";
import type { DailyAssignment } from "@/lib/agents/types";

/** Process daily assignments from Chief Editor. */
export const contentProducerRun = inngest.createFunction(
  { id: "content-producer-run", retries: 1 },
  { event: "agent/chief-editor.daily-briefing" },
  async ({ event, step }) => {
    const assignments = event.data.assignments as DailyAssignment[];
    const results = [];

    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i]!;
      const result = await step.run(`produce-${i}-${assignment.topic.slice(0, 20)}`, () =>
        runAgent(
          "content-producer",
          (ctx) => runContentProduction(ctx, assignment),
          {
            triggerType: "event",
            triggerRef: "agent/chief-editor.daily-briefing",
            input: { assignment },
          },
        ),
      );

      results.push(result);

      // Post-production: image search + emit complete (image search is independent)
      if (result.success && result.data) {
        // Image search runs as a separate step (non-blocking for emit)
        await step.run(`image-search-${i}`, () =>
          runAgent(
            "content-producer",
            (ctx) => searchCandidateImages(ctx, {
              topic: assignment.topic,
              articleSummary: result.data!.topic,
              platforms: assignment.platforms || [],
              personaId: assignment.personaId,
              pipelineRunId: result.data!.pipelineRunId,
            }),
            { triggerType: "event", triggerRef: "image-search" },
          ),
        );

        // Load article content + emit in a single step (saves 1 step overhead)
        await step.run(`emit-complete-${i}`, async () => {
          let articleContent = "";
          if (result.data!.pipelineRunId) {
            const { prisma } = await import("@/lib/db");
            const run = await prisma.pipelineRun.findUnique({
              where: { id: result.data!.pipelineRunId! },
              select: { editedContent: true, draftContent: true },
            });
            articleContent = run?.editedContent ?? run?.draftContent ?? "";
          }

          await inngest.send({
            name: "agent/content-producer.complete",
            data: {
              result: result.data!,
              articleContent,
              topic: assignment.topic,
              platforms: assignment.platforms || [],
              personaId: assignment.personaId,
              agentRunId: result.runId,
            },
          });
        });
      }
    }

    return { processed: results.length, successful: results.filter((r) => r.success).length };
  },
);

/** Process urgent content from Chief Editor emergency. */
export const contentProducerUrgent = inngest.createFunction(
  { id: "content-producer-urgent", retries: 1 },
  { event: "agent/chief-editor.urgent-content" },
  async ({ event, step }) => {
    const assignment = event.data.assignment as DailyAssignment;

    const result = await step.run("produce-urgent", () =>
      runAgent(
        "content-producer",
        (ctx) => runContentProduction(ctx, assignment),
        {
          triggerType: "event",
          triggerRef: "agent/chief-editor.urgent-content",
          input: { assignment, reason: event.data.reason },
        },
      ),
    );

    if (result.success && result.data) {
      // Search candidate images for urgent content too
      await step.run("image-search-urgent", () =>
        runAgent(
          "content-producer",
          (ctx) => searchCandidateImages(ctx, {
            topic: assignment.topic,
            articleSummary: result.data!.topic,
            platforms: assignment.platforms || [],
            personaId: assignment.personaId,
            pipelineRunId: result.data!.pipelineRunId,
          }),
          { triggerType: "event", triggerRef: "image-search-urgent" },
        ),
      );

      // Load article content + emit in a single step
      await step.run("emit-complete", async () => {
        let articleContent = "";
        if (result.data!.pipelineRunId) {
          const { prisma } = await import("@/lib/db");
          const run = await prisma.pipelineRun.findUnique({
            where: { id: result.data!.pipelineRunId! },
            select: { editedContent: true, draftContent: true },
          });
          articleContent = run?.editedContent ?? run?.draftContent ?? "";
        }

        await inngest.send({
          name: "agent/content-producer.complete",
          data: {
            result: result.data!,
            articleContent,
            topic: assignment.topic,
            platforms: assignment.platforms || [],
            personaId: assignment.personaId,
            agentRunId: result.runId,
          },
        });
      });
    }

    return result;
  },
);
