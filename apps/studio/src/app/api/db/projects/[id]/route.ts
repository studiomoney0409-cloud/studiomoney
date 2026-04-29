import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await ctx.params;
    const project = await prisma.designProject.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!project) return notFound("프로젝트를 찾을 수 없습니다");
    return json(project);
  } catch (e) {
    return serverError(String(e));
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await ctx.params;

    const owned = await prisma.designProject.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("프로젝트를 찾을 수 없습니다");

    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = String(body.title);
    if (body.status !== undefined) data.status = String(body.status);
    if (body.category !== undefined) data.category = String(body.category);
    if (body.specJson !== undefined) data.specJson = body.specJson as object;
    if (body.thumbnailDataUri !== undefined) data.thumbnailDataUri = String(body.thumbnailDataUri);

    const project = await prisma.designProject.update({
      where: { id },
      data,
    });
    return json(project);
  } catch (e) {
    return serverError(String(e));
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await ctx.params;

    const owned = await prisma.designProject.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("프로젝트를 찾을 수 없습니다");

    await prisma.designProject.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}
