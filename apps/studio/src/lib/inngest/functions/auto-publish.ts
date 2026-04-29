/**
 * Auto-Publish — triggered by Design Director completion.
 *
 * Chains: design-director.complete → create/update publications → schedule publish events.
 * Closes the final gap in the pipeline: Content → Design → Publish.
 */
import { inngest } from "../client";
import { prisma } from "@/lib/db";
import { getSmartScheduleTime } from "@/lib/autopilot/scheduler";

/** Auto-publish after Design Director completes designs. */
export const autoPublishAfterDesign = inngest.createFunction(
  { id: "auto-publish-after-design", retries: 2 },
  { event: "agent/design-director.complete" },
  async ({ event, step }) => {
    const { topic, designAssets, publicationIds, agentRunId } = event.data as {
      topic: string;
      designAssets: Array<{ platform: string; imageUrl?: string }>;
      publicationIds: string[];
      agentRunId: string;
    };

    const scheduled: string[] = [];

    // 1. Attach design assets to existing publications (created by Content Producer)
    if (publicationIds.length > 0) {
      for (const pubId of publicationIds) {
        const pub = await step.run(`attach-design-${pubId}`, async () => {
          const existing = await prisma.publication.findUnique({
            where: { id: pubId },
            select: { platform: true, status: true, content: true },
          });
          if (!existing) return null;

          const asset = designAssets.find((a) => a.platform === existing.platform);
          if (asset?.imageUrl) {
            const content = (existing.content ?? {}) as Record<string, unknown>;
            content.imageUrl = asset.imageUrl;
            await prisma.publication.update({
              where: { id: pubId },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: { content: content as any },
            });
          }
          return existing;
        });

        // Schedule publish if not already scheduled
        if (pub && pub.status === "scheduled") {
          await step.run(`schedule-${pubId}`, () =>
            inngest.send({
              name: "publication/scheduled",
              data: { publicationId: pubId },
            }),
          );
          scheduled.push(pubId);
        }
      }
    }

    // 2. Create new publications for platforms that don't have one yet
    const coveredPlatforms = new Set<string>();
    if (publicationIds.length > 0) {
      const existingPubs = await step.run("check-existing-pubs", () =>
        prisma.publication.findMany({
          where: { id: { in: publicationIds } },
          select: { platform: true },
        }),
      );
      for (const p of existingPubs) coveredPlatforms.add(p.platform);
    }

    for (const asset of designAssets) {
      if (coveredPlatforms.has(asset.platform)) continue;

      const newPubId = await step.run(`create-pub-${asset.platform}`, async () => {
        const account = await prisma.snsAccount.findFirst({
          where: { platform: asset.platform },
          select: { id: true, workspaceId: true },
        });
        if (!account) return null;

        const smartTime = await getSmartScheduleTime(account.id).catch(() => null);
        const pub = await prisma.publication.create({
          data: {
            workspaceId: account.workspaceId,
            snsAccountId: account.id,
            platform: asset.platform,
            content: {
              text: topic,
              imageUrl: asset.imageUrl,
            },
            status: "scheduled",
            scheduledAt: smartTime?.scheduledAt ?? new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        return pub.id;
      });

      if (newPubId) {
        await step.run(`schedule-new-${asset.platform}`, () =>
          inngest.send({
            name: "publication/scheduled",
            data: { publicationId: newPubId },
          }),
        );
        scheduled.push(newPubId);
      }
    }

    return {
      topic,
      scheduledCount: scheduled.length,
      publicationIds: scheduled,
      agentRunId,
    };
  },
);
