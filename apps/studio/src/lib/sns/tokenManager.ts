// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "./encryption";
import { getAdapter } from "./platforms";
import type { OAuthTokenResult } from "./types";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const REFRESH_RETRY_DELAYS = [2000, 4000, 8000]; // 3 retries with backoff

/** Errors that should NOT be retried (permanent failures). */
function isPermanentError(e: unknown): boolean {
  const msg = String(e).toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("unauthorized") ||
    msg.includes("revoked") ||
    msg.includes("expired refresh token") ||
    msg.includes("consent_required")
  );
}

/** Save (or update) an SNS account in a workspace after OAuth callback. Tokens are encrypted at rest. */
export async function saveAccount(result: OAuthTokenResult, platform: string, workspaceId: string) {
  const data = {
    displayName: result.displayName,
    profileImageUrl: result.profileImageUrl ?? "",
    accessToken: encrypt(result.accessToken),
    refreshToken: result.refreshToken ? encrypt(result.refreshToken) : "",
    tokenExpiresAt: result.expiresIn
      ? new Date(Date.now() + result.expiresIn * 1000)
      : null,
    scopes: result.scopes,
    isActive: true,
    metadata: (result.metadata ?? {}) as JsonInput,
  };

  return prisma.snsAccount.upsert({
    where: {
      workspaceId_platform_platformUserId: {
        workspaceId,
        platform,
        platformUserId: result.platformUserId,
      },
    },
    create: {
      workspaceId,
      platform,
      platformUserId: result.platformUserId,
      ...data,
    },
    update: data,
  });
}

/** Get a decrypted access token, refreshing if near expiry. */
export async function getValidToken(accountId: string): Promise<string> {
  const account = await prisma.snsAccount.findUniqueOrThrow({
    where: { id: accountId },
  });

  // If no expiry or still valid, return current token
  if (
    !account.tokenExpiresAt ||
    account.tokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS
  ) {
    return decrypt(account.accessToken);
  }

  // Need refresh
  if (!account.refreshToken) {
    throw new Error(
      `Token expired for ${account.platform}:${account.displayName} and no refresh token available. Re-authenticate required.`,
    );
  }

  const adapter = getAdapter(account.platform);
  const decryptedRefresh = decrypt(account.refreshToken);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= REFRESH_RETRY_DELAYS.length; attempt++) {
    try {
      const refreshed = await adapter.refreshAccessToken(decryptedRefresh);

      // Validate refreshed token
      if (!refreshed.accessToken) {
        throw new Error("Token refresh returned empty accessToken");
      }

      await prisma.snsAccount.update({
        where: { id: accountId },
        data: {
          accessToken: encrypt(refreshed.accessToken),
          refreshToken: refreshed.refreshToken
            ? encrypt(refreshed.refreshToken)
            : undefined,
          tokenExpiresAt: refreshed.expiresIn
            ? new Date(Date.now() + refreshed.expiresIn * 1000)
            : undefined,
        },
      });

      return refreshed.accessToken;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      // Don't retry permanent failures (revoked, invalid grant, etc.)
      if (isPermanentError(e)) {
        throw new Error(
          `[${account.platform}:${account.displayName}] Token permanently invalid — re-authenticate required: ${lastError.message}`,
        );
      }

      const delay = REFRESH_RETRY_DELAYS[attempt];
      if (delay === undefined) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(
    `[${account.platform}:${account.displayName}] Token refresh failed after ${REFRESH_RETRY_DELAYS.length + 1} attempts: ${lastError?.message}`,
  );
}
