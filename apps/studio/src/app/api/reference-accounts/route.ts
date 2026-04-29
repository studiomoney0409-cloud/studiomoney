import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { discoverProfile } from "@/lib/sns/instagram-discovery";
import { enqueueJob } from "@/lib/jobs";
import { workspaceGuard } from "@/lib/auth/route-guard";
import { nicheContextFromWorkspace } from "@/lib/niche/context";

/**
 * GET /api/reference-accounts — list reference accounts in this workspace.
 */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const accounts = await prisma.referenceAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { feeds: true } },
      },
    });

    return json(
      accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
        profileImageUrl: a.profileImageUrl,
        followersCount: a.followersCount,
        category: a.category,
        tags: a.tags,
        isActive: a.isActive,
        lastSyncedAt: a.lastSyncedAt,
        syncError: a.syncError,
        feedCount: a._count.feeds,
        createdAt: a.createdAt,
      })),
    );
  } catch (e) {
    return serverError(String(e));
  }
}

/**
 * POST /api/reference-accounts — add a new reference account.
 * Body: { username, platform?, category?, tags? }
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as {
      username?: string;
      platform?: string;
      category?: string;
      tags?: string[];
    };

    const username = body.username?.replace(/^@/, "").trim();
    if (!username) return badRequest("username is required");

    const platform = body.platform ?? "instagram";

    const existing = await prisma.referenceAccount.findUnique({
      where: { workspaceId_platform_username: { workspaceId: workspace.id, platform, username } },
    });
    if (existing) return badRequest(`@${username} is already registered in this workspace`);

    const profile = await discoverProfile(username);
    if (!profile) {
      return badRequest(
        `@${username} is not a Business/Creator account or does not exist. ` +
          "Ensure the account is public and has a Business or Creator profile.",
      );
    }

    const tpl = await prisma.nicheTemplate.findUnique({ where: { niche: workspace.niche } });
    const ctx = nicheContextFromWorkspace(workspace, tpl);

    const account = await prisma.referenceAccount.create({
      data: {
        workspaceId: workspace.id,
        platform,
        username,
        platformUserId: profile.id,
        displayName: profile.name,
        profileImageUrl: profile.profilePictureUrl,
        followersCount: profile.followersCount,
        category: body.category ?? ctx.defaultCategory,
        tags: body.tags ?? [],
      },
    });

    await enqueueJob({
      type: "reference_feed_sync",
      payload: { accountId: account.id },
    });

    return json(account, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
