// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";

/**
 * GET /api/webhooks/meta — Webhook verification (required by Meta).
 * Meta sends a GET with hub.mode, hub.verify_token, hub.challenge.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/meta — Receive webhook events from Meta
 * (Instagram comments, Threads replies, DMs, etc.)
 *
 * Now also:
 * 1. Verifies X-Hub-Signature-256 using META_APP_SECRET
 * 2. Creates IncomingMessage records from comment/DM payloads
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    // Verify X-Hub-Signature-256 if META_APP_SECRET is set
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (signature) {
        const expected =
          "sha256=" +
          crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
        if (signature !== expected) {
          return json({ error: "Invalid signature" }, 403);
        }
      }
    }

    const body = JSON.parse(rawBody) as {
      object: string;
      entry: Array<{
        id: string;
        time: number;
        changes?: Array<{ field: string; value: Record<string, unknown> }>;
        messaging?: Array<Record<string, unknown>>;
      }>;
    };

    const events = [];
    const incomingMessages = [];

    for (const entry of body.entry ?? []) {
      // Map entry.id (IG/Threads user ID) to our snsAccountId
      const platform =
        body.object === "instagram" ? "instagram" : "threads";
      const account = await prisma.snsAccount.findFirst({
        where: { platformUserId: entry.id, platform, isActive: true },
        select: { id: true, workspaceId: true },
      });
      const snsAccountId = account?.id ?? null;
      const workspaceId = account?.workspaceId ?? null;

      // Comment/reply changes
      for (const change of entry.changes ?? []) {
        events.push({
          platform,
          eventType: change.field,
          payload: change.value as JsonInput,
          snsAccountId,
        });

        // Parse comment payloads into IncomingMessage
        if (change.field === "comments" && snsAccountId && workspaceId) {
          const v = change.value as {
            id?: string;
            text?: string;
            from?: { id?: string; username?: string };
            media?: { id?: string };
            created_time?: number;
          };
          if (v.id) {
            incomingMessages.push({
              workspaceId,
              snsAccountId,
              platform,
              externalId: v.id,
              parentPostId: v.media?.id ?? null,
              senderName: v.from?.username ?? "",
              senderHandle: v.from?.username ?? "",
              messageType: "comment",
              body: v.text ?? "",
              receivedAt: v.created_time
                ? new Date(v.created_time * 1000)
                : new Date(),
            });
          }
        }
      }

      // Direct messages
      for (const msg of entry.messaging ?? []) {
        events.push({
          platform: "instagram",
          eventType: "dm",
          payload: msg as JsonInput,
          snsAccountId,
        });

        // Parse DM into IncomingMessage
        if (snsAccountId && workspaceId) {
          const m = msg as {
            message?: { mid?: string; text?: string };
            sender?: { id?: string };
            timestamp?: number;
          };
          if (m.message?.mid) {
            incomingMessages.push({
              workspaceId,
              snsAccountId,
              platform: "instagram",
              externalId: m.message.mid,
              parentPostId: null,
              senderName: m.sender?.id ?? "",
              senderHandle: m.sender?.id ?? "",
              messageType: "dm",
              body: m.message.text ?? "",
              receivedAt: m.timestamp
                ? new Date(m.timestamp)
                : new Date(),
            });
          }
        }
      }
    }

    if (events.length > 0) {
      await prisma.webhookEvent.createMany({ data: events });
    }

    // Create IncomingMessage records (skip duplicates)
    for (const im of incomingMessages) {
      try {
        await prisma.incomingMessage.create({ data: im });
      } catch (e) {
        const msg = String(e);
        if (msg.includes("Unique constraint")) continue;
        // Non-dedup errors: log but don't fail the webhook
        console.error("Webhook IncomingMessage create error:", e);
      }
    }

    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}
