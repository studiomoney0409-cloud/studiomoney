import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * Find the next optimal posting time for an account.
 * Returns the closest future slot from optimal-times data.
 */
async function getNextOptimalTime(snsAccountId: string, platform: string): Promise<Date | null> {
  const performances = await prisma.postPerformance.findMany({
    where: { snsAccountId, platform },
    select: { dayOfWeek: true, hourOfDay: true, engagementRate: true },
  });

  if (performances.length < 3) return null; // not enough data

  // Aggregate by (dayOfWeek, hourOfDay)
  const slotMap = new Map<string, { day: number; hour: number; total: number; count: number }>();
  for (const p of performances) {
    const key = `${p.dayOfWeek}-${p.hourOfDay}`;
    const existing = slotMap.get(key);
    if (existing) {
      existing.total += p.engagementRate;
      existing.count++;
    } else {
      slotMap.set(key, { day: p.dayOfWeek, hour: p.hourOfDay, total: p.engagementRate, count: 1 });
    }
  }

  // Rank by average engagement
  const ranked = Array.from(slotMap.values())
    .map((s) => ({ ...s, avg: s.total / s.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  if (ranked.length === 0) return null;

  // Find the nearest future slot
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentHour = now.getHours();

  let bestSlot: Date | null = null;
  let minDiff = Infinity;

  for (const slot of ranked) {
    // Try this week and next week
    for (const weekOffset of [0, 1]) {
      let dayDiff = slot.day - currentDay + weekOffset * 7;
      if (dayDiff < 0) dayDiff += 7;
      if (dayDiff === 0 && slot.hour <= currentHour) {
        dayDiff += 7; // already passed today
      }

      const target = new Date(now);
      target.setDate(target.getDate() + dayDiff);
      target.setHours(slot.hour, 0, 0, 0);

      const diff = target.getTime() - now.getTime();
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        bestSlot = target;
      }
    }
  }

  return bestSlot;
}

/** PATCH /api/autopilot/proposals/[id] — approve/reject a proposal */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const { id } = await params;
    const body = (await req.json()) as { status?: string; scheduledAt?: string };

    if (!body.status || !["approved", "rejected"].includes(body.status)) {
      return badRequest("status must be 'approved' or 'rejected'");
    }

    // Workspace ownership check via parent config
    const proposal = await prisma.autopilotProposal.findFirst({
      where: { id, config: { workspaceId: workspace.id } },
    });
    if (!proposal) return notFound("Proposal not found");

    let scheduledAt: Date | null = null;

    if (body.status === "approved") {
      if (body.scheduledAt) {
        scheduledAt = new Date(body.scheduledAt);
      } else {
        const config = await prisma.autopilotConfig.findUnique({
          where: { id: proposal.autopilotConfigId },
        });
        if (config) {
          scheduledAt = await getNextOptimalTime(config.snsAccountId, proposal.platform);
        }
      }
    }

    const updated = await prisma.autopilotProposal.update({
      where: { id },
      data: {
        status: body.status,
        ...(scheduledAt && { scheduledAt }),
      },
    });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}
