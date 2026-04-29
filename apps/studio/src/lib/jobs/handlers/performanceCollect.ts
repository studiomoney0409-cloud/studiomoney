import { prisma } from "@/lib/db";
import { getValidToken } from "@/lib/sns/tokenManager";
import { getInsightsAdapter } from "@/lib/sns/insights";
import { updateEngagement } from "@/lib/design/style-performance";
import type { JobHandler } from "../types";

/**
 * Collects performance data for published posts.
 * Triggered 24h after publication via scheduled job.
 * Payload: { publicationId: string }
 *
 * Fetches real engagement metrics from platform APIs (Threads/IG/X).
 * Falls back to zeros if the API call fails.
 */
export const performanceCollectHandler: JobHandler = {
  type: "performance_collect",
  async handle(payload) {
    const publicationId = payload.publicationId as string;
    if (!publicationId) throw new Error("publicationId is required");

    const pub = await prisma.publication.findUnique({
      where: { id: publicationId },
    });
    if (!pub || pub.status !== "published" || !pub.publishedAt) {
      return { skipped: true, reason: "Not a published post" };
    }

    // Check if we already have a snapshot for this publication
    const existing = await prisma.postPerformance.findFirst({
      where: { publicationId },
    });
    if (existing) {
      return { skipped: true, reason: "Already collected" };
    }

    const publishedAt = new Date(pub.publishedAt);
    const hourOfDay = publishedAt.getHours();
    const dayOfWeek = publishedAt.getDay(); // 0=Sun

    // Fetch real metrics from platform API
    let views = 0,
      likes = 0,
      comments = 0,
      shares = 0,
      saves = 0;

    if (pub.platformPostId) {
      const adapter = getInsightsAdapter(pub.platform);
      if (adapter) {
        try {
          const token = await getValidToken(pub.snsAccountId);
          const account = await prisma.snsAccount.findUnique({
            where: { id: pub.snsAccountId },
          });
          const insights = await adapter.fetchPostInsights(
            token,
            pub.platformPostId,
            account?.platformUserId ?? "",
          );
          views = insights.views;
          likes = insights.likes;
          comments = insights.comments;
          shares = insights.shares;
          saves = insights.saves;
        } catch {
          // API error — store zeros, don't fail the job
        }
      }
    }

    const totalEngagement = likes + comments + shares + saves;
    const engagementRate = views > 0 ? totalEngagement / views : 0;

    await prisma.postPerformance.create({
      data: {
        workspaceId: pub.workspaceId,
        publicationId: pub.id,
        snsAccountId: pub.snsAccountId,
        platform: pub.platform,
        publishedAt,
        hourOfDay,
        dayOfWeek,
        views,
        likes,
        comments,
        shares,
        saves,
        engagementRate,
      },
    });

    // Bridge to design style performance tracking
    // Content metadata stored in publication.content may include designTrackingId
    const content = pub.content as Record<string, unknown> | null;
    const designMeta = content?.designMeta as Record<string, unknown> | undefined;
    const trackingId = (designMeta?.briefId ?? content?.designTrackingId) as string | undefined;
    if (trackingId) {
      updateEngagement(trackingId, {
        impressions: views,
        engagements: totalEngagement,
        saves,
        shares,
        clicks: 0,
      });
    }

    return { collected: true, publicationId, views, likes, comments, shares, saves };
  },
};
