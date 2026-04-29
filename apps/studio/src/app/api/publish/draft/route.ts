import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * POST /api/publish/draft — create a draft publication.
 * Body: { snsAccountId, platform, content: { text, mediaUrls?, hashtags? }, projectId? }
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const snsAccountId = body.snsAccountId as string;
    const platform = body.platform as string;
    const content = body.content as Record<string, unknown>;

    if (!snsAccountId || !platform) {
      return badRequest("snsAccountId and platform are required");
    }
    if (!content?.text) {
      return badRequest("content.text is required");
    }

    const account = await prisma.snsAccount.findFirst({
      where: { id: snsAccountId, workspaceId: workspace.id },
    });
    if (!account) return badRequest("SNS account not found");
    if (account.platform !== platform) {
      return badRequest(`Account platform (${account.platform}) doesn't match requested platform (${platform})`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = await prisma.publication.create({
      data: {
        workspaceId: workspace.id,
        snsAccountId,
        platform,
        content: content as any,
        projectId: (body.projectId as string) ?? null,
        status: "draft",
      },
    });

    return json(pub, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
