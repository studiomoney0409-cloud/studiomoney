import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const events = await prisma.calendarEvent.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(events);
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
    const event = await prisma.calendarEvent.create({
      data: {
        workspaceId: workspace.id,
        date: String(body.date ?? ""),
        title: String(body.title ?? ""),
        type: String(body.type ?? "post"),
        category: String(body.category ?? ""),
        status: String(body.status ?? "planned"),
        note: String(body.note ?? ""),
      },
    });
    return json(event, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
