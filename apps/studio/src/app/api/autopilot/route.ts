import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/autopilot — list autopilot configs in this workspace */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const configs = await prisma.autopilotConfig.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(configs);
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/autopilot — create a new autopilot config */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const snsAccountId = body.snsAccountId as string;
    if (!snsAccountId) return badRequest("snsAccountId is required");

    // Verify the SNS account belongs to this workspace
    const account = await prisma.snsAccount.findFirst({
      where: { id: snsAccountId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!account) return badRequest("snsAccount not in this workspace");

    const config = await prisma.autopilotConfig.create({
      data: {
        workspaceId: workspace.id,
        snsAccountId,
        personaId: (body.personaId as string) ?? null,
        platforms: (body.platforms as string[]) ?? [],
        postsPerDay: (body.postsPerDay as number) ?? 1,
        approvalMode: (body.approvalMode as string) ?? "manual",
        topicKeywords: (body.topicKeywords as string[]) ?? [],
        isActive: (body.isActive as boolean) ?? false,
      },
    });
    return json(config, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
