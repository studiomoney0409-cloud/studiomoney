import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { publishNow } from "@/lib/sns/publish";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * POST /api/publish/now — publish immediately.
 * Body: { publicationId } or same as /draft (create + publish in one step)
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;

    let pubId: string;

    if (body.publicationId) {
      pubId = body.publicationId as string;
      const pub = await prisma.publication.findFirst({ where: { id: pubId, workspaceId: workspace.id } });
      if (!pub) return notFound("Publication not found");
      if (pub.status === "published") {
        return badRequest("Already published");
      }
    } else {
      const snsAccountId = body.snsAccountId as string;
      const platform = body.platform as string;
      const content = body.content as Record<string, unknown>;
      if (!snsAccountId || !platform || !content?.text) {
        return badRequest("snsAccountId, platform, and content.text are required");
      }
      const account = await prisma.snsAccount.findFirst({ where: { id: snsAccountId, workspaceId: workspace.id }, select: { id: true } });
      if (!account) return badRequest("SNS account not in this workspace");

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
      pubId = pub.id;
    }

    await publishNow(pubId);
    const result = await prisma.publication.findUnique({ where: { id: pubId } });
    return json(result);
  } catch (e) {
    return serverError(String(e));
  }
}
