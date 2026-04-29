import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;

/** GET /api/topics/[id] — get draft with messages */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const draft = await prisma.topicDraft.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!draft) return notFound("Draft not found");
    return json(draft);
  } catch (e) {
    return serverError(String(e));
  }
}

/** PATCH /api/topics/[id] — update draft fields */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const draft = await prisma.topicDraft.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!draft) return notFound("Draft not found");

    const allowedFields = [
      "topic", "angle", "reasoning", "contentType", "status",
      "trendSources", "relatedEntities", "formats", "personaId",
    ];

    const data: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) data[key] = body[key];
    }

    if (Object.keys(data).length === 0) return badRequest("No valid fields to update");

    const updated = await prisma.topicDraft.update({
      where: { id },
      data: data as JsonInput,
    });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}

/** DELETE /api/topics/[id] — delete draft and messages */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const draft = await prisma.topicDraft.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!draft) return notFound("Draft not found");

    await prisma.topicDraft.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}
