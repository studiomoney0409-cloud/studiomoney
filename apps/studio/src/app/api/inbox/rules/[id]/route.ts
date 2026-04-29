import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** PATCH /api/inbox/rules/[id] — toggle or update rule */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.autoReplyRule.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Rule not found");

    const body = (await req.json()) as Record<string, unknown>;
    const updated = await prisma.autoReplyRule.update({
      where: { id },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive as boolean } : {}),
        ...(body.name ? { name: body.name as string } : {}),
        ...(body.replyTemplate !== undefined ? { replyTemplate: body.replyTemplate as string } : {}),
        ...(body.useAi !== undefined ? { useAi: body.useAi as boolean } : {}),
        ...(body.aiInstructions !== undefined ? { aiInstructions: body.aiInstructions as string | null } : {}),
      },
    });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}

/** DELETE /api/inbox/rules/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.autoReplyRule.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Rule not found");

    await prisma.autoReplyRule.delete({ where: { id } });
    return json({ deleted: true });
  } catch (e) {
    return serverError(String(e));
  }
}
