import { prisma } from "@/lib/db";
import { json, badRequest, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** POST /api/topics/[id]/launch — launch content pipeline from refined topic */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const { id } = await params;
    const body = (await req.json()) as {
      target: string;
      personaId?: string;
    };

    const target = body.target;
    if (!target || !["blog", "sns", "design", "e2e"].includes(target)) {
      return badRequest("target must be one of: blog, sns, design, e2e");
    }

    const draft = await prisma.topicDraft.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!draft) return notFound("Draft not found");

    const formats = draft.formats as Record<string, string> | null;
    const personaId = body.personaId ?? draft.personaId;

    await prisma.topicDraft.update({
      where: { id },
      data: { status: "sent" },
    });

    switch (target) {
      case "blog": {
        const run = await prisma.pipelineRun.create({
          data: {
            workspaceId: workspace.id,
            topic: draft.topic,
            angle: draft.angle,
            contentType: draft.contentType,
            personaId: personaId ?? null,
            status: "running",
          },
        });

        await prisma.topicDraft.update({
          where: { id },
          data: { pipelineRunId: run.id },
        });

        return json({
          pipelineRunId: run.id,
          redirectUrl: `/studio/blog?topic=${encodeURIComponent(draft.topic)}&outline=${encodeURIComponent(formats?.blog ?? "")}`,
        });
      }

      case "sns": {
        const text = formats?.sns ?? draft.topic;
        return json({
          redirectUrl: `/studio/publish?text=${encodeURIComponent(text)}`,
        });
      }

      case "design": {
        const carousel = formats?.carousel ?? "";
        return json({
          redirectUrl: `/studio/design?quick=1&topic=${encodeURIComponent(draft.topic)}&carousel=${encodeURIComponent(carousel)}`,
        });
      }

      case "e2e": {
        return json({
          topic: draft.topic,
          contentType: draft.contentType,
          personaId,
          redirectUrl: `/studio/blog?topic=${encodeURIComponent(draft.topic)}`,
        });
      }

      default:
        return badRequest("Invalid target");
    }
  } catch (e) {
    return serverError(String(e));
  }
}
