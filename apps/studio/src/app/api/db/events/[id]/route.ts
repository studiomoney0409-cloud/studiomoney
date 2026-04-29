import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const owned = await prisma.calendarEvent.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Event not found");
    const body = (await req.json()) as Record<string, unknown>;
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: body,
    });
    return json(event);
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return notFound("Event not found");
    return serverError(String(e));
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const owned = await prisma.calendarEvent.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Event not found");
    await prisma.calendarEvent.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return notFound("Event not found");
    return serverError(String(e));
  }
}
