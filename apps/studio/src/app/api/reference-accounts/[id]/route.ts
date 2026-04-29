import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/reference-accounts/:id — single account with recent feeds.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const account = await prisma.referenceAccount.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        feeds: {
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        _count: { select: { feeds: true } },
      },
    });

    if (!account) return notFound("Account not found");
    return json(account);
  } catch (e) {
    return serverError(String(e));
  }
}

/**
 * PATCH /api/reference-accounts/:id — update account fields.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.referenceAccount.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Account not found");

    const body = (await req.json()) as {
      category?: string;
      tags?: string[];
      isActive?: boolean;
    };

    const account = await prisma.referenceAccount.update({
      where: { id },
      data: {
        ...(body.category !== undefined && { category: body.category }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return json(account);
  } catch (e) {
    return serverError(String(e));
  }
}

/**
 * DELETE /api/reference-accounts/:id — delete account (cascades to feeds).
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.referenceAccount.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Account not found");

    await prisma.referenceAccount.delete({ where: { id } });
    return json({ deleted: true });
  } catch (e) {
    return serverError(String(e));
  }
}
