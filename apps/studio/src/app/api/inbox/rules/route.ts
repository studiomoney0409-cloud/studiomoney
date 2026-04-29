import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/inbox/rules — list auto-reply rules in this workspace */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const rules = await prisma.autoReplyRule.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(rules);
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/inbox/rules — create auto-reply rule */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const snsAccountId = body.snsAccountId as string;
    const name = body.name as string;
    const triggerType = body.triggerType as string;
    const triggerValue = body.triggerValue as string;

    if (!snsAccountId || !name || !triggerType || !triggerValue) {
      return badRequest("snsAccountId, name, triggerType, and triggerValue are required");
    }

    const account = await prisma.snsAccount.findFirst({
      where: { id: snsAccountId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!account) return badRequest("snsAccount not in this workspace");

    const rule = await prisma.autoReplyRule.create({
      data: {
        workspaceId: workspace.id,
        snsAccountId,
        name,
        triggerType,
        triggerValue,
        replyTemplate: (body.replyTemplate as string) ?? "",
        useAi: (body.useAi as boolean) ?? false,
        aiInstructions: (body.aiInstructions as string) ?? null,
      },
    });
    return json(rule, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
