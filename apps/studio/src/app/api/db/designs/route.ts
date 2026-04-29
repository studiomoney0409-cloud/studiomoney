import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const entries = await prisma.designEntry.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(entries);
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
    const entry = await prisma.designEntry.create({
      data: {
        workspaceId: workspace.id,
        category: String(body.category ?? ""),
        title: String(body.title ?? ""),
        imageDataUri: String(body.imageDataUri ?? ""),
        html: String(body.html ?? ""),
        fontMood: String(body.fontMood ?? ""),
      },
    });
    return json(entry, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
