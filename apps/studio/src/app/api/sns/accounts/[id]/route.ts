import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { getValidToken } from "@/lib/sns/tokenManager";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** DELETE /api/sns/accounts/:id — disconnect; cascade is handled by schema FKs except publication status flip */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const existing = await prisma.snsAccount.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!existing) return notFound("Account not found");

    await prisma.$transaction([
      // Cancel pending/scheduled publications (DB-level cascade does not flag them)
      prisma.publication.updateMany({
        where: { snsAccountId: id, status: { in: ["draft", "scheduled"] } },
        data: { status: "failed", error: "Account disconnected" },
      }),
      // Account deletion cascades through FK to: autopilotConfig, autopilotProposal,
      // incomingMessage, autoReplyRule, keywordCampaign, keywordCommentLog, analyticsSnapshot
      prisma.snsAccount.delete({ where: { id } }),
    ]);

    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/sns/accounts/:id — refresh token */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const owned = await prisma.snsAccount.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Account not found");

    await getValidToken(id);
    const account = await prisma.snsAccount.findUnique({
      where: { id },
      select: {
        id: true,
        platform: true,
        displayName: true,
        tokenExpiresAt: true,
        isActive: true,
      },
    });
    return json(account);
  } catch (e) {
    return serverError(String(e));
  }
}
