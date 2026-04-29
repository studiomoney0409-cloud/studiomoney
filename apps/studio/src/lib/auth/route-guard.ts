import { NextResponse } from "next/server";
import { AuthError, requireWorkspace, type WorkspaceContext } from "./workspace";

/**
 * Result of `workspaceGuard()` — discriminated union so the caller can
 * `if (!guard.ok) return guard.response` and then access `guard.ctx`.
 */
export type GuardResult =
  | { ok: true; ctx: WorkspaceContext }
  | { ok: false; response: NextResponse };

/**
 * Standard route guard: authenticates via Clerk and resolves the active workspace.
 * Returns a 401 (UNAUTHORIZED) or 409 (NO_WORKSPACE) response when the caller
 * cannot operate on a workspace. Other errors propagate to the caller's try/catch.
 *
 * Usage:
 *   export async function GET() {
 *     const guard = await workspaceGuard();
 *     if (!guard.ok) return guard.response;
 *     const { workspace } = guard.ctx;
 *     // ... prisma.x.findMany({ where: { workspaceId: workspace.id } })
 *   }
 */
export async function workspaceGuard(): Promise<GuardResult> {
  try {
    const ctx = await requireWorkspace();
    return { ok: true, ctx };
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, response: NextResponse.json({ error: e.code }, { status: e.status }) };
    }
    throw e;
  }
}
