import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { json, badRequest, serverError } from "@/lib/studio";
import { z } from "zod";
import { workspaceGuard } from "@/lib/auth/route-guard";

const ResultSchema = z.object({
  sns: z.object({
    text: z.string(),
    hashtags: z.array(z.string()),
  }),
  blog: z.object({
    title: z.string(),
    outline: z.string(),
  }),
  carousel: z.object({
    concept: z.string(),
    slideCount: z.number(),
    slideTopics: z.array(z.string()),
  }),
});

/**
 * POST /api/content/multi-generate
 * Generate content in 3 formats from a single topic.
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as { topic?: string; personaId?: string };
    const topic = body.topic?.trim();
    if (!topic) return badRequest("topic is required");

    let personaContext = "";
    if (body.personaId) {
      const persona = await prisma.writingPersona.findFirst({
        where: { id: body.personaId, workspaceId: workspace.id },
      });
      if (persona) {
        personaContext = `\n\nWriting Persona: ${persona.name}\nTone: ${JSON.stringify(persona.tone)}\nStyle: ${persona.styleFingerprint}`;
      }
    }

    const intro = workspace.promptHints?.trim() || "You are a Korean content creator.";

    const prompt = `${intro} Generate content in 3 formats for the topic: "${topic}"
${personaContext}

Return JSON:
{
  "sns": {
    "text": "SNS 포스트 본문 (Korean, 200자 이내, 플랫폼 최적화)",
    "hashtags": ["해시태그1", "해시태그2", "해시태그3"]
  },
  "blog": {
    "title": "블로그 제목 (Korean, SEO 최적화)",
    "outline": "## 섹션1\\n핵심 포인트\\n## 섹션2\\n핵심 포인트\\n## 섹션3\\n핵심 포인트"
  },
  "carousel": {
    "concept": "카드뉴스 컨셉 설명 (Korean, 1문장)",
    "slideCount": 5,
    "slideTopics": ["슬라이드1 제목", "슬라이드2 제목", "슬라이드3 제목", "슬라이드4 제목", "슬라이드5 제목"]
  }
}

Respond ONLY with the JSON object.`;

    const result = await callGptJson(prompt, {
      caller: "multi-generate",
      schema: ResultSchema,
      maxTokens: 1500,
    });

    return json(result);
  } catch (e) {
    return serverError(String(e));
  }
}
