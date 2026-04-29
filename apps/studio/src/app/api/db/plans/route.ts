import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

const MAX_PLANS = 10;

export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const plans = await prisma.contentPlan.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: MAX_PLANS,
      include: { items: true },
    });
    return json(plans);
  } catch (e) {
    return serverError(String(e));
  }
}

export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const body = (await req.json()) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [];

    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: workspace.id,
        id: typeof body.id === "string" ? body.id : undefined,
        startDate: String(body.startDate ?? ""),
        endDate: String(body.endDate ?? ""),
        frequency: body.frequency as object,
        summary: String(body.summary ?? ""),
        preferences: body.preferences as object | undefined,
        items: {
          create: items.map((item: Record<string, unknown>) => ({
            id: typeof item.id === "string" ? item.id : undefined,
            date: String(item.date ?? ""),
            title: String(item.title ?? ""),
            description: String(item.description ?? ""),
            type: String(item.type ?? "post"),
            category: String(item.category ?? ""),
            tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
            reasoning: String(item.reasoning ?? ""),
            addedToCalendar: Boolean(item.addedToCalendar),
            calendarEventId: typeof item.calendarEventId === "string" ? item.calendarEventId : null,
          })),
        },
      },
      include: { items: true },
    });

    // Enforce per-workspace max plans
    const allPlans = await prisma.contentPlan.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (allPlans.length > MAX_PLANS) {
      const toDelete = allPlans.slice(MAX_PLANS).map((p) => p.id);
      await prisma.contentPlan.deleteMany({ where: { id: { in: toDelete } } });
    }

    return json(plan, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
