import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/persona/:id */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const persona = await prisma.writingPersona.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!persona) return notFound("Persona not found");
    return json(persona);
  } catch (e) {
    return serverError(String(e));
  }
}

/** PATCH /api/persona/:id */
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

    const existing = await prisma.writingPersona.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!existing) return notFound("Persona not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await prisma.writingPersona.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.tone !== undefined ? { tone: body.tone as any } : {}),
        ...(body.vocabulary !== undefined ? { vocabulary: body.vocabulary as any } : {}),
        ...(body.structure !== undefined ? { structure: body.structure as any } : {}),
        ...(body.topicPrefs !== undefined ? { topicPrefs: body.topicPrefs as any } : {}),
        ...(body.sampleTexts !== undefined ? { sampleTexts: body.sampleTexts as any } : {}),
        ...(body.styleFingerprint !== undefined ? { styleFingerprint: String(body.styleFingerprint) } : {}),
        ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });

    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}

/** DELETE /api/persona/:id */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const existing = await prisma.writingPersona.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!existing) return notFound("Persona not found");
    await prisma.writingPersona.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return serverError(String(e));
  }
}
