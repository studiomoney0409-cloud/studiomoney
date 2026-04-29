import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/inbox — list incoming messages in this workspace */
export async function GET(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const url = new URL(req.url);
    const filter = url.searchParams.get("filter");
    const classification = url.searchParams.get("classification");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

    const where: Record<string, unknown> = { workspaceId: workspace.id };
    if (filter === "unread") where.isRead = false;
    if (classification) where.classification = classification;

    const messages = await prisma.incomingMessage.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.incomingMessage.count({
      where: { workspaceId: workspace.id, isRead: false },
    });

    return json({ messages, unreadCount });
  } catch (e) {
    return serverError(String(e));
  }
}
