// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { getValidToken } from "@/lib/sns/tokenManager";
import { getInsightsAdapter } from "@/lib/sns/insights";
import type { JobHandler } from "../types";

/**
 * Analytics collection job: gathers daily metrics from connected SNS accounts.
 * Runs once daily via Vercel Cron.
 * Creates AnalyticsSnapshot records for each active account.
 */
export const analyticsCollectHandler: JobHandler = {
  type: "analytics_collect",
  async handle() {
    const accounts = await prisma.snsAccount.findMany({
      where: { isActive: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const accountIds = accounts.map((a) => a.id);

    // Batch fetch: snapshots (today + yesterday), publications, performance — 3 queries total
    const [allSnapshots, allPubs, allPerf] = await Promise.all([
      prisma.analyticsSnapshot.findMany({
        where: { snsAccountId: { in: accountIds }, date: { in: [today, yesterday] } },
      }),
      prisma.publication.findMany({
        where: { snsAccountId: { in: accountIds }, publishedAt: { gte: today } },
        take: 200,
      }),
      prisma.postPerformance.findMany({
        where: { snsAccountId: { in: accountIds }, snapshotAt: { gte: today } },
        take: 500,
      }),
    ]);

    // Group by account
    const todayFmt = today.toISOString();
    const yesterdayFmt = yesterday.toISOString();
    const snapshotsByAccount = new Map<string, { today?: typeof allSnapshots[0]; yesterday?: typeof allSnapshots[0] }>();
    for (const snap of allSnapshots) {
      const key = snap.snsAccountId;
      const entry = snapshotsByAccount.get(key) ?? {};
      if (snap.date.toISOString() === todayFmt) entry.today = snap;
      else if (snap.date.toISOString() === yesterdayFmt) entry.yesterday = snap;
      snapshotsByAccount.set(key, entry);
    }
    const pubsByAccount = Map.groupBy(allPubs, (p) => p.snsAccountId);
    const perfByAccount = Map.groupBy(allPerf, (p) => p.snsAccountId);

    let collected = 0;

    for (const account of accounts) {
      const snaps = snapshotsByAccount.get(account.id);
      if (snaps?.today) continue; // already have today's snapshot

      const prevSnapshot = snaps?.yesterday;
      const todayPubs = pubsByAccount.get(account.id) ?? [];
      const todayPerf = perfByAccount.get(account.id) ?? [];

      const totalLikes = todayPerf.reduce((sum, p) => sum + p.likes, 0);
      const totalComments = todayPerf.reduce((sum, p) => sum + p.comments, 0);
      const totalShares = todayPerf.reduce((sum, p) => sum + p.shares, 0);
      const totalViews = todayPerf.reduce((sum, p) => sum + p.views, 0);
      const engagement = totalLikes + totalComments + totalShares;

      // Fetch real follower count + demographics from platform API
      let followers = prevSnapshot?.followers ?? 0;
      let demographics: JsonInput = null;
      const adapter = getInsightsAdapter(account.platform);
      if (adapter?.fetchAccountInsights) {
        try {
          const accessToken = await getValidToken(account.id);
          const accountInsights = await adapter.fetchAccountInsights(
            accessToken,
            account.platformUserId,
          );
          followers = accountInsights.followersCount;
          if (accountInsights.demographics) {
            demographics = accountInsights.demographics;
          }
        } catch {
          // Fallback to previous data if API fails
        }
      }

      const followersGrowth = prevSnapshot
        ? followers - prevSnapshot.followers
        : 0;

      await prisma.analyticsSnapshot.create({
        data: {
          workspaceId: account.workspaceId,
          snsAccountId: account.id,
          platform: account.platform,
          date: today,
          followers,
          followersGrowth,
          reach: totalViews,
          impressions: totalViews,
          engagement,
          engagementRate: totalViews > 0 ? engagement / totalViews : 0,
          profileViews: 0,
          demographics,
          topPosts: todayPubs.slice(0, 5).map((p) => ({
            postId: p.platformPostId,
            text: ((p.content as Record<string, unknown>)?.text as string ?? "").slice(0, 100),
          })),
        },
      });
      collected++;
    }

    // Trigger persona learning after analytics collection
    await enqueueJob({ type: "persona_learn", payload: {} });

    return { accountsProcessed: accounts.length, snapshotsCreated: collected };
  },
};
