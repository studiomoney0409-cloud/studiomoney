import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;

/** GET /api/topics — list topic drafts in this workspace */
export async function GET(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    const where = status
      ? { workspaceId: workspace.id, status }
      : { workspaceId: workspace.id };

    const [drafts, total] = await Promise.all([
      prisma.topicDraft.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: { _count: { select: { messages: true } } },
      }),
      prisma.topicDraft.count({ where }),
    ]);

    return json({ drafts, total });
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/topics — create a new topic draft */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const topic = body.topic as string;
    if (!topic?.trim()) return badRequest("topic is required");

    const draft = await prisma.topicDraft.create({
      data: {
        workspaceId: workspace.id,
        topic: topic.trim(),
        angle: (body.angle as string) ?? "",
        reasoning: (body.reasoning as string) ?? "",
        contentType: (body.contentType as string) ?? "blog",
        sourceType: (body.sourceType as string) ?? "manual",
        sourceData: (body.sourceData as JsonInput) ?? null,
        trendSources: (body.trendSources as string[]) ?? [],
        relatedEntities: (body.relatedEntities as string[]) ?? [],
        formats: (body.formats as JsonInput) ?? null,
        personaId: (body.personaId as string) ?? null,
      },
    });

    return json(draft, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
