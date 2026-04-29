import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/sns/accounts — list connected SNS accounts in this workspace (tokens omitted) */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const accounts = await prisma.snsAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        displayName: true,
        profileImageUrl: true,
        scopes: true,
        isActive: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return json(accounts);
  } catch (e) {
    return serverError(String(e));
  }
}
