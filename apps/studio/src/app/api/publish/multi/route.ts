import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { publishMulti } from "@/lib/sns/publish";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * POST /api/publish/multi — publish to multiple accounts simultaneously.
 * Body: { accountIds: string[], content: { text, mediaUrls?, hashtags? }, projectId? }
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const accountIds = body.accountIds as string[];
    const content = body.content as Record<string, unknown>;

    if (!accountIds?.length) return badRequest("accountIds array is required");
    if (!content?.text) return badRequest("content.text is required");

    // Only accounts in this workspace
    const accounts = await prisma.snsAccount.findMany({
      where: { id: { in: accountIds }, workspaceId: workspace.id, isActive: true },
    });

    if (!accounts.length) return badRequest("No valid accounts found in this workspace");

    const pubIds: string[] = [];
    for (const account of accounts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pub = await prisma.publication.create({
        data: {
          workspaceId: workspace.id,
          snsAccountId: account.id,
          platform: account.platform,
          content: content as any,
          projectId: (body.projectId as string) ?? null,
          status: "draft",
        },
      });
      pubIds.push(pub.id);
    }

    const result = await publishMulti(pubIds);
    return json(result);
  } catch (e) {
    return serverError(String(e));
  }
}
