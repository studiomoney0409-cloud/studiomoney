/**
 * Resolve a "default" workspace id when a caller doesn't have one in scope.
 * Used by legacy lib code paths that pre-date multi-tenancy.
 *
 * Returns null if no workspace exists at all (e.g. fresh DB, no users).
 * Callers should treat null as a fail-fast signal to skip the operation.
 */
import { prisma } from "../db";

let cachedFallbackId: string | null | undefined;

export async function fallbackWorkspaceId(): Promise<string | null> {
  if (cachedFallbackId !== undefined) return cachedFallbackId;
  const ws = await prisma.workspace.findFirst({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  cachedFallbackId = ws?.id ?? null;
  return cachedFallbackId;
}

/** Reset the cache — useful in tests or after workspace deletion. */
export function clearFallbackWorkspaceCache(): void {
  cachedFallbackId = undefined;
}
