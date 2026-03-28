/**
 * Design Director Agent — Inngest Functions
 *
 * Two triggers:
 * 1. agent/content-producer.complete — direct (no images, fallback)
 * 2. agent/image-gate.selected — after human selects images (preferred)
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runDesignProduction } from "@/lib/agents/design-director-agent";
import type { ContentProducerResult } from "@/lib/agents/types";

/** Generate designs after human selects images (preferred path). */
export const designDirectorWithImages = inngest.createFunction(
  { id: "design-director-with-images", retries: 1 },
  { event: "agent/image-gate.selected" },
  async ({ event, step }) => {
    const { topic, selectedUrls, platforms, personaId, pipelineRunId } = event.data as {
      topic: string;
      selectedUrls: string[];
      platforms: string[];
      personaId?: string;
      pipelineRunId?: string;
    };

    if (!platforms.length) {
      return { skipped: true, reason: "No platforms" };
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
            pipelineRunId,
            sourcedImageUrls: selectedUrls,
          }),
        {
          triggerType: "event",
          triggerRef: "agent/image-gate.selected",
          input: { topic, platforms, selectedUrls, pipelineRunId },
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

/** Fallback: generate designs without images (from content-producer.complete). */
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

    // Check if an ImageGate exists for this topic — if so, skip (will be handled by image-gate.selected)
    const { prisma } = await import("@/lib/db");
    const existingGate = await step.run("check-image-gate", () =>
      prisma.imageGate.findFirst({
        where: {
          topic,
          status: "pending",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    );

    if (existingGate) {
      return { skipped: true, reason: "ImageGate pending — waiting for human image selection" };
    }

    // No ImageGate found — proceed without images (fallback)
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
