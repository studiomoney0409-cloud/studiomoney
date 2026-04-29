import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { getValidToken } from "@/lib/sns/tokenManager";
import { getCommentAdapter } from "@/lib/sns/comments";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * POST /api/inbox/[id]/reply
 * Body: { text: string }
 *
 * Sends a reply to a comment/DM via the platform API immediately.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) return json({ error: "text is required" }, 400);

    const msg = await prisma.incomingMessage.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!msg) return json({ error: "Message not found" }, 404);

    const account = await prisma.snsAccount.findFirst({
      where: { id: msg.snsAccountId, workspaceId: workspace.id },
    });
    if (!account) return json({ error: "SNS account not found" }, 404);

    const accessToken = await getValidToken(account.id);
    const adapter = getCommentAdapter(account.platform);

    const result = await adapter.replyToComment(
      accessToken,
      account.platformUserId,
      msg.externalId,
      text,
    );

    await prisma.incomingMessage.update({
      where: { id },
      data: {
        autoReplied: false,
        autoReplyText: text,
        processedAt: new Date(),
      },
    });

    return json({ success: true, replyId: result.replyId });
  } catch (e) {
    return serverError(String(e));
  }
}
