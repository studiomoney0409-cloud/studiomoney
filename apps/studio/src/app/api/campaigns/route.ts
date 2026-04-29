import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/campaigns — list keyword campaigns in this workspace */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const campaigns = await prisma.keywordCampaign.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(campaigns);
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/campaigns — create a keyword campaign */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const body = (await req.json()) as Record<string, unknown>;
    const snsAccountId = body.snsAccountId as string;
    const name = body.name as string;

    if (!snsAccountId || !name) return badRequest("snsAccountId and name required");

    const account = await prisma.snsAccount.findFirst({
      where: { id: snsAccountId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!account) return badRequest("snsAccount not in this workspace");

    const campaign = await prisma.keywordCampaign.create({
      data: {
        workspaceId: workspace.id,
        snsAccountId,
        name,
        keywords: (body.keywords as string[]) ?? [],
        platforms: (body.platforms as string[]) ?? ["threads"],
        commentMode: (body.commentMode as string) ?? "ai",
        commentTemplate: (body.commentTemplate as string) ?? null,
        aiInstructions: (body.aiInstructions as string) ?? null,
        dailyLimit: (body.dailyLimit as number) ?? 10,
        operatingStart: (body.operatingStart as number) ?? 9,
        operatingEnd: (body.operatingEnd as number) ?? 22,
      },
    });
    return json(campaign, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
