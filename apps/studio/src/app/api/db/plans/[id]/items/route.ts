import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id: planId } = await params;
    const owned = await prisma.contentPlan.findFirst({ where: { id: planId, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Plan not found");

    const body = (await req.json()) as Record<string, unknown>;

    const item = await prisma.planItem.create({
      data: {
        id: typeof body.id === "string" ? body.id : undefined,
        planId,
        date: String(body.date ?? ""),
        title: String(body.title ?? ""),
        description: String(body.description ?? ""),
        type: String(body.type ?? "post"),
        category: String(body.category ?? ""),
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
        reasoning: String(body.reasoning ?? ""),
        addedToCalendar: Boolean(body.addedToCalendar),
        calendarEventId: typeof body.calendarEventId === "string" ? body.calendarEventId : null,
      },
    });

    return json(item, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
