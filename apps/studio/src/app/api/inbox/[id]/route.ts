import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** PATCH /api/inbox/[id] — mark as read, update classification, etc */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.incomingMessage.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Message not found");

    const body = (await req.json()) as Record<string, unknown>;
    const updated = await prisma.incomingMessage.update({
      where: { id },
      data: {
        ...(body.isRead !== undefined ? { isRead: body.isRead as boolean } : {}),
        ...(body.classification ? { classification: body.classification as string } : {}),
        ...(body.priority ? { priority: body.priority as string } : {}),
      },
    });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}
