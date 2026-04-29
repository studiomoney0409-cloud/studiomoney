import { prisma } from "@/lib/db";
import { json, notFound, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/publish/:id */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const pub = await prisma.publication.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!pub) return notFound("Publication not found");
    return json(pub);
  } catch (e) {
    return serverError(String(e));
  }
}

/** DELETE /api/publish/:id — cancel a scheduled or draft publication */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const pub = await prisma.publication.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!pub) return notFound("Publication not found");
    if (pub.status === "published" || pub.status === "publishing") {
      return badRequest("Cannot delete a published or publishing publication");
    }
    await prisma.publication.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}
