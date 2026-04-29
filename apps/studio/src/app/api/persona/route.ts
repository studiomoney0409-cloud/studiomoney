import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/persona — list all writing personas */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const personas = await prisma.writingPersona.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return json(personas);
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/persona — create a new writing persona */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const body = (await req.json()) as Record<string, unknown>;
    const name = body.name as string;
    const method = body.creationMethod as string;

    if (!name?.trim()) return badRequest("name is required");
    if (!["copy", "analyze", "manual", "template"].includes(method)) {
      return badRequest("creationMethod must be copy, analyze, manual, or template");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persona = await prisma.writingPersona.create({
      data: {
        workspaceId: workspace.id,
        name: name.trim(),
        creationMethod: method,
        sourceAccountId: (body.sourceAccountId as string) ?? null,
        tone: (body.tone ?? null) as any,
        vocabulary: (body.vocabulary ?? null) as any,
        structure: (body.structure ?? null) as any,
        topicPrefs: (body.topicPrefs ?? null) as any,
        sampleTexts: (body.sampleTexts ?? null) as any,
        styleFingerprint: (body.styleFingerprint as string) ?? "",
        isDefault: body.isDefault === true,
      },
    });

    return json(persona, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
