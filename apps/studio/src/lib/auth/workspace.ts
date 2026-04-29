import { cookies } from "next/headers";
import { prisma } from "../db";
import { syncCurrentUser } from "./sync-user";
import type { User, Workspace } from "../../generated/prisma/client";

const COOKIE_NAME = "active_workspace_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export class AuthError extends Error {
  constructor(public code: "UNAUTHORIZED" | "NO_WORKSPACE" | "FORBIDDEN", public status: number) {
    super(code);
  }
}

export type WorkspaceContext = { user: User; workspace: Workspace };

export async function getActiveWorkspaceId(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

export async function setActiveWorkspaceId(id: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearActiveWorkspaceId(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

/**
 * Resolve the active workspace for the current request.
 * - Authenticates via Clerk
 * - Returns the cookie-selected workspace if owned by the user
 * - Falls back to the user's default workspace, then their oldest workspace
 * - Throws NO_WORKSPACE if the user has none yet
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const user = await syncCurrentUser();
  if (!user) throw new AuthError("UNAUTHORIZED", 401);

  const activeId = await getActiveWorkspaceId();
  if (activeId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: activeId, ownerId: user.id },
    });
    if (ws) return { user, workspace: ws };
  }

  const fallback = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!fallback) throw new AuthError("NO_WORKSPACE", 409);

  return { user, workspace: fallback };
}

/**
 * Like requireWorkspace, but returns null instead of throwing when no workspace exists.
 * Useful for onboarding pages that need to know auth state without forcing a workspace.
 */
export async function getWorkspaceOrNull(): Promise<WorkspaceContext | null> {
  try {
    return await requireWorkspace();
  } catch (e) {
    if (e instanceof AuthError && e.code === "NO_WORKSPACE") return null;
    throw e;
  }
}
