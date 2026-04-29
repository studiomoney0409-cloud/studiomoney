import { randomUUID } from "crypto";
import { json, badRequest, serverError } from "@/lib/studio";
import { getAdapter, listAvailablePlatforms } from "@/lib/sns/platforms";
import { generatePKCE } from "@/lib/sns/platforms/x";
import type { SnsPlatform } from "@/lib/sns/types";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** POST /api/sns/connect/:platform — start OAuth flow, returns authUrl */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;

    const { platform } = await params;
    const available = listAvailablePlatforms();
    if (!available.includes(platform as SnsPlatform)) {
      return badRequest(
        `Unsupported platform: ${platform}. Available: ${available.join(", ")}`,
      );
    }

    const baseUrl =
      process.env.OAUTH_CALLBACK_BASE_URL ?? "http://localhost:3100";
    const callbackUrl = `${baseUrl}/api/sns/callback/${platform}`;
    const state = randomUUID();

    const adapter = getAdapter(platform);

    // X needs PKCE
    let authUrl: string;
    let codeVerifier: string | undefined;
    if (platform === "x") {
      const pkce = await generatePKCE();
      codeVerifier = pkce.verifier;
      authUrl = adapter
        .getAuthUrl(callbackUrl, state)
        .replace("CODE_CHALLENGE_PLACEHOLDER", pkce.challenge);
    } else {
      authUrl = adapter.getAuthUrl(callbackUrl, state);
    }

    return json({ authUrl, state, codeVerifier });
  } catch (e) {
    return serverError(String(e));
  }
}
