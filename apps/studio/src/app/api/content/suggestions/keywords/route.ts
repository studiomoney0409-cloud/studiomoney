import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * Workspace-scoped keyword settings.
 * GET returns the current workspace.keywords array; PUT replaces it.
 * (Was previously a global Setting key; now stored on the Workspace.)
 */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    return json({ keywords: workspace.keywords });
  } catch (e) {
    return serverError(String(e));
  }
}

export async function PUT(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as { keywords?: string[] };
    const keywords = (body.keywords ?? [])
      .map((k) => k.trim())
      .filter(Boolean);

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { keywords },
      select: { keywords: true },
    });
    return json({ keywords: updated.keywords });
  } catch (e) {
    return serverError(String(e));
  }
}
