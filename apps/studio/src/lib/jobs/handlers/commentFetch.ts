import { prisma } from "@/lib/db";
import { getValidToken } from "@/lib/sns/tokenManager";
import { getCommentAdapter } from "@/lib/sns/comments";
import type { JobHandler } from "../types";

/**
 * Comment fetch job: polls all active SNS accounts' published posts
 * for new comments. Creates IncomingMessage records with dedup via
 * @@unique([platform, externalId]).
 *
 * Threads has no webhook support, so polling is the only way.
 * Instagram uses this as a fallback supplement to webhooks.
 */
export const commentFetchHandler: JobHandler = {
  type: "comment_fetch",
  async handle() {
    const accounts = await prisma.snsAccount.findMany({
      where: { isActive: true, platform: { in: ["threads", "instagram"] } },
    });

    let fetched = 0;
    let created = 0;

    for (const account of accounts) {
      let adapter;
      try {
        adapter = getCommentAdapter(account.platform);
      } catch {
        continue; // no adapter for this platform
      }

      let accessToken: string;
      try {
        accessToken = await getValidToken(account.id);
      } catch {
        continue; // token expired or unavailable
      }

      // Get recently published posts (last 7 days)
      const publications = await prisma.publication.findMany({
        where: {
          snsAccountId: account.id,
          status: "published",
          publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          platformPostId: { not: null },
        },
        select: { platformPostId: true },
      });

      // Collect all comments from all posts, then batch insert
      const allComments: Array<{
        workspaceId: string;
        snsAccountId: string;
        platform: string;
        externalId: string;
        parentPostId: string | undefined;
        senderName: string;
        senderHandle: string;
        messageType: string;
        body: string;
        receivedAt: Date;
      }> = [];

      for (const pub of publications) {
        if (!pub.platformPostId) continue;
        try {
          const comments = await adapter.fetchCommentsOnPost(
            accessToken,
            pub.platformPostId,
          );
          fetched += comments.length;
          for (const comment of comments) {
            allComments.push({
              workspaceId: account.workspaceId,
              snsAccountId: account.id,
              platform: account.platform,
              externalId: comment.externalId,
              parentPostId: comment.parentPostId,
              senderName: comment.senderName,
              senderHandle: comment.senderHandle,
              messageType: comment.messageType,
              body: comment.body,
              receivedAt: comment.receivedAt,
            });
          }
        } catch {
          // API error for this post — continue with others
          continue;
        }
      }

      if (allComments.length > 0) {
        const result = await prisma.incomingMessage.createMany({
          data: allComments,
          skipDuplicates: true,
        });
        created += result.count;
      }
    }

    return { fetched, created, accounts: accounts.length };
  },
};
