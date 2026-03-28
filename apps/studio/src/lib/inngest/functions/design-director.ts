/**
 * Design Director Agent — Inngest Function
 *
 * Triggered by Content Producer completion event.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runDesignProduction } from "@/lib/agents/design-director-agent";
import type { ContentProducerResult } from "@/lib/agents/types";

/** Generate designs after content production completes. */
export const designDirectorRun = inngest.createFunction(
  { id: "design-director-run", retries: 1 },
  { event: "agent/content-producer.complete" },
  async ({ event, step }) => {
    const { result, topic, platforms, personaId } = event.data as {
      result: ContentProducerResult;
      topic: string;
      platforms: string[];
      personaId?: string;
    };

    // Skip design if no platforms or content failed
    if (!platforms.length || !result.pipelineRunId) {
      return { skipped: true, reason: "No platforms or no pipeline run" };
    }

    const designResult = await step.run("produce-design", () =>
      runAgent(
        "design-director",
        (ctx) =>
          runDesignProduction(ctx, {
            topic,
            articleContent: "",
            platforms,
            personaId,
            pipelineRunId: result.pipelineRunId,
          }),
        {
          triggerType: "event",
          triggerRef: "agent/content-producer.complete",
          input: { topic, platforms, pipelineRunId: result.pipelineRunId },
        },
      ),
    );

    if (designResult.success && designResult.data) {
      await step.run("emit-complete", () =>
        inngest.send({
          name: "agent/design-director.complete",
          data: {
            topic,
            designAssets: designResult.data!.designAssets.map((a) => ({
              platform: a.platform,
              imageUrl: a.imageUrl,
            })),
            publicationIds: designResult.data!.publicationIds,
            agentRunId: designResult.runId,
          },
        }),
      );
    }

    return designResult;
  },
);
