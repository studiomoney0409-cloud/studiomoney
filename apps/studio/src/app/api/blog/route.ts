import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { runPipeline, indexArticle, recordTopicPublished, generateVisualAssets } from "@/lib/pipeline";
import type { PersonaContext } from "@/lib/pipeline";
import { generateSlug } from "@/lib/blog/writer";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/blog — list blog posts */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const posts = await prisma.blogPost.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        wordCount: true,
        status: true,
        pipelineRunId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return json(posts);
  } catch (e) {
    return serverError(String(e));
  }
}

/** POST /api/blog — generate a new blog post via editorial pipeline */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as Record<string, unknown>;
    const rawTopic = body.topic as string;
    if (!rawTopic) return badRequest("topic is required");
    const outlineHint = body.outline as string | undefined;
    // Enrich topic with AI-suggested outline when available
    const topic = outlineHint
      ? `${rawTopic}\n\n[참고 아웃라인] ${outlineHint}`
      : rawTopic;

    const personaId = body.personaId as string | undefined;
    let persona: PersonaContext | null = null;

    if (personaId) {
      const p = await prisma.writingPersona.findFirst({
        where: { id: personaId, workspaceId: workspace.id },
      });
      if (p) {
        persona = {
          name: p.name,
          styleFingerprint: p.styleFingerprint,
          perspective: p.perspective,
          expertiseAreas: p.expertiseAreas,
          tone: p.tone as Record<string, unknown> | null,
          emotionalDrivers: p.emotionalDrivers,
          vocabulary: p.vocabulary as Record<string, unknown> | null,
          structure: p.structure as Record<string, unknown> | null,
          contentRules: p.contentRules as PersonaContext["contentRules"],
          goldenExamples: p.goldenExamples as Record<string, string[]> | null,
          channelProfiles: p.channelProfiles as Record<string, unknown> | null,
        };
      }
    }

    // Create pipeline run record
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        workspaceId: workspace.id,
        topic,
        contentType: (body.contentType as string) ?? "blog",
        personaId: personaId ?? null,
        status: "running",
      },
    });

    try {
      // Run the editorial pipeline
      const result = await runPipeline({
        topic,
        persona,
        contentType: (body.contentType as string as "blog") ?? "blog",
        targetWordCount: (body.targetWordCount as number) ?? 2000,
        onStatusChange: async (status) => {
          await prisma.pipelineRun.update({
            where: { id: pipelineRun.id },
            data: { status },
          });
        },
      });

      // Update pipeline run with results
      await prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: result.status,
          angle: result.outline.angle,
          outlineJson: JSON.parse(JSON.stringify(result.outline)),
          researchJson: result.researchPacket
            ? JSON.parse(JSON.stringify(result.researchPacket))
            : undefined,
          draftContent: result.draftContent,
          editedContent: result.editedContent,
          qualityScore: JSON.parse(JSON.stringify(result.qualityScore)),
          rewriteCount: result.rewriteCount,
        },
      });

      // Use edited content (editor-improved version)
      const content = result.editedContent;
      const wordCount = content.split(/\s+/).length;
      const slug = generateSlug(result.outline.title);

      const post = await prisma.blogPost.create({
        data: {
          workspaceId: workspace.id,
          title: result.outline.title,
          slug,
          content,
          excerpt: content
            .slice(0, 200)
            .replace(/[#*\n]/g, " ")
            .trim(),
          seoTitle: result.outline.seoTitle,
          seoDescription: result.outline.seoDescription,
          seoKeywords: result.outline.seoKeywords,
          wordCount,
          personaId: personaId ?? null,
          pipelineRunId: pipelineRun.id,
          status: result.status === "approved" ? "approved" : "reviewed",
        },
      });

      // Record topic performance for cooling/learning (fire-and-forget)
      recordTopicPublished(
        topic,
        (body.contentType as string) ?? "blog",
      ).catch(() => {});

      // Generate visual assets in background (fire-and-forget)
      generateVisualAssets({
        topic,
        content,
        brandColor: body.brandColor as string | undefined,
      }).then(async (visual) => {
        await prisma.blogPost.update({
          where: { id: post.id },
          data: {
            coverImageUrl: visual.coverImage?.imageUrl ?? null,
            visualAssets: JSON.parse(JSON.stringify(visual)),
          },
        });
      }).catch(() => {/* visual generation failure is non-fatal */});

      // Auto-index content for RAG (fire-and-forget)
      indexArticle({
        content,
        sourceType: "blog",
        sourceId: post.id,
        personaId: personaId,
        topics: result.outline.seoKeywords,
        artistMentions: result.researchPacket?.entities.artists ?? [],
        publishedAt: new Date(),
      }).catch(() => {/* indexing failure is non-fatal */});

      return json(
        {
          ...post,
          qualityScore: result.qualityScore,
          rewriteCount: result.rewriteCount,
          pipelineStatus: result.status,
        },
        201,
      );
    } catch (pipelineError) {
      // Record failure in pipeline run
      await prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: "failed",
          errorMessage: String(pipelineError),
        },
      });
      throw pipelineError;
    }
  } catch (e) {
    return serverError(String(e));
  }
}
