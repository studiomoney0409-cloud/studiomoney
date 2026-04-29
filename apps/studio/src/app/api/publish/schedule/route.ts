import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { enqueueJob } from "@/lib/jobs";
import { adjustScheduleTime } from "@/lib/autopilot/scheduler";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * POST /api/publish/schedule — schedule a publication for a future time.
 * Body: { publicationId, scheduledAt } or same as /draft + scheduledAt
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const scheduledAt = body.scheduledAt as string;

    if (!scheduledAt) return badRequest("scheduledAt is required");
    const schedDate = new Date(scheduledAt);
    if (schedDate <= new Date()) {
      return badRequest("scheduledAt must be in the future");
    }

    let pubId: string;

    if (body.publicationId) {
      pubId = body.publicationId as string;
      const pub = await prisma.publication.findFirst({ where: { id: pubId, workspaceId: workspace.id } });
      if (!pub) return notFound("Publication not found");
      if (pub.status !== "draft") {
        return badRequest("Only draft publications can be scheduled");
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

    const accountId = body.snsAccountId as string ??
      (await prisma.publication.findUnique({ where: { id: pubId }, select: { snsAccountId: true } }))?.snsAccountId;
    const adjustedDate = accountId
      ? await adjustScheduleTime(accountId, schedDate)
      : schedDate;

    await prisma.publication.update({
      where: { id: pubId },
      data: { status: "scheduled", scheduledAt: adjustedDate },
    });

    await enqueueJob({
      type: "publish",
      payload: { publicationId: pubId },
      scheduledAt: adjustedDate,
    });

    const updated = await prisma.publication.findUnique({ where: { id: pubId } });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}
