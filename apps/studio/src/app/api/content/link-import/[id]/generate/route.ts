import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { json, notFound, badRequest, serverError } from "@/lib/studio";
import type { ExtractedContent } from "@/lib/sns/linkExtractor";
import { workspaceGuard } from "@/lib/auth/route-guard";

const openai = new OpenAI();

/**
 * POST /api/content/link-import/:id/generate
 * Generate SNS post text from extracted content.
 * Body: { urlIndex?: number, platform?: string, personaFingerprint?: string }
 */
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
      urlIndex?: number;
      platform?: string;
      personaFingerprint?: string;
    };

    const record = await prisma.linkImport.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!record) return notFound("Link import not found");
    if (record.status !== "completed" || !record.results) {
      return badRequest("Import not yet completed or has no results");
    }

    const results = record.results as unknown as ExtractedContent[];
    const platform = body.platform ?? "threads";

    const single = body.urlIndex !== undefined ? results[body.urlIndex] : undefined;
    const targets: ExtractedContent[] =
      body.urlIndex !== undefined
        ? single ? [single] : []
        : results.filter((r) => r.success);

    if (!targets.length) return badRequest("No valid content to generate from");

    const posts = [];
    for (const target of targets) {
      const systemPrompt = [
        `You are a social media content creator. Generate a ${platform} post from the following article.`,
        record.commonInstructions
          ? `Follow these instructions: ${record.commonInstructions}`
          : "",
        body.personaFingerprint
          ? `Write in this style: ${body.personaFingerprint}`
          : "",
        "Rules:",
        "- Write in Korean",
        "- Keep it concise and engaging",
        "- Include relevant hashtags (3-5)",
        "- Do NOT include the URL in the post body",
        `- Platform: ${platform} (respect character limits)`,
      ]
        .filter(Boolean)
        .join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Title: ${target.title}\nSource: ${target.domain}\n\nArticle:\n${target.text.slice(0, 3000)}`,
          },
        ],
        max_tokens: 1000,
      });

      posts.push({
        url: target.url,
        title: target.title,
        domain: target.domain,
        generatedPost: completion.choices[0]?.message?.content ?? "",
        platform,
      });
    }

    return json({ importId: id, posts });
  } catch (e) {
    return serverError(String(e));
  }
}
