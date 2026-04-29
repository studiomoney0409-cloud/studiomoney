import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { getSmartScheduleTime } from "@/lib/autopilot/scheduler";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * GET /api/publish/smart-time?accountId=xxx — Get AI-recommended next publish time.
 * Considers engagement data, avoids collisions, respects daily limits.
 */
export async function GET(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    if (!accountId) return badRequest("accountId is required");

    const owned = await prisma.snsAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Account not found");

    const slot = await getSmartScheduleTime(accountId);
    if (!slot) {
      return json({ scheduledAt: null, message: "추천 가능한 시간이 없습니다." });
    }

    return json({
      scheduledAt: slot.scheduledAt.toISOString(),
      dayLabel: slot.dayLabel,
      timeLabel: slot.timeLabel,
      reason: slot.reason,
    });
  } catch (e) {
    return serverError(String(e));
  }
}
