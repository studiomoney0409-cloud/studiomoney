import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/content/link-import/:id — get import details */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const record = await prisma.linkImport.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!record) return notFound("Link import not found");
    return json(record);
  } catch (e) {
    return serverError(String(e));
  }
}
