// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;
import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type { JobHandler } from "../types";

const personaSchema = z.object({
  name: z.string(),
  tone: z.object({
    formality: z.number().min(1).max(5),
    humor: z.number().min(1).max(5),
    emotion: z.number().min(1).max(5),
    energy: z.number().min(1).max(5),
  }),
  vocabulary: z.object({
    level: z.string(),
    preferredWords: z.array(z.string()),
    avoidWords: z.array(z.string()),
    jargon: z.array(z.string()),
  }),
  structure: z.object({
    avgSentenceLength: z.string(),
    paragraphPattern: z.string(),
    hookStyle: z.string(),
  }),
  styleFingerprint: z.string(),
});

/**
 * Onboard analyze job: fetches recent posts from a newly connected account
 * and auto-creates a default writing persona based on the writing style.
 */
export const onboardAnalyzeHandler: JobHandler = {
  type: "onboard_analyze",
  async handle(payload) {
    const accountId = payload.accountId as string;
    if (!accountId) return { error: "missing accountId" };

    const account = await prisma.snsAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) return { error: "account not found" };

    // Check if a default persona already exists for this account
    const existing = await prisma.writingPersona.findFirst({
      where: { isDefault: true },
    });
    if (existing) return { skipped: true, reason: "default persona already exists" };

    // Collect recent publications if any exist in our system
    const publications = await prisma.publication.findMany({
      where: { snsAccountId: accountId, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    const texts = publications
      .map((p) => ((p.content as Record<string, unknown>)?.text as string) ?? "")
      .filter((t) => t.length > 10);

    if (texts.length < 3) {
      // Not enough data, create a basic default persona instead
      await prisma.writingPersona.create({
        data: {
          workspaceId: account.workspaceId,
          name: `${account.displayName} 스타일`,
          creationMethod: "analyze",
          tone: { formality: 3, humor: 2, emotion: 3, energy: 3 } as JsonInput,
          vocabulary: { level: "보통", preferredWords: [], avoidWords: [], jargon: [] } as JsonInput,
          structure: { avgSentenceLength: "보통", paragraphPattern: "짧은 단락", hookStyle: "질문형" } as JsonInput,
          styleFingerprint: `${account.displayName}의 기본 페르소나입니다. 더 많은 게시물이 쌓이면 자동으로 학습됩니다.`,
          isDefault: true,
          isActive: true,
        },
      });
      return { created: true, method: "basic_default", textsFound: texts.length };
    }

    // Analyze writing style with GPT
    const prompt = `다음은 한 사용자의 최근 SNS 게시물 ${texts.length}개입니다. 이 사용자의 글쓰기 스타일을 분석하여 페르소나를 생성해주세요.

## 게시물:
${texts.map((t, i) => `${i + 1}. ${t.slice(0, 500)}`).join("\n\n")}

JSON으로 반환:
- name: 페르소나 이름 (예: "캐주얼 마케터", "전문 에디터")
- tone: { formality(1-5), humor(1-5), emotion(1-5), energy(1-5) }
- vocabulary: { level("쉬운"/"보통"/"전문"), preferredWords(자주 쓰는 단어 5개), avoidWords(빈 배열), jargon(분야 용어) }
- structure: { avgSentenceLength("짧은"/"보통"/"긴"), paragraphPattern("한 줄"/"짧은 단락"/"긴 단락"), hookStyle("질문형"/"선언형"/"스토리형") }
- styleFingerprint: 이 사용자의 글쓰기 스타일 설명 (한국어, 2-3문단)

JSON만 반환하세요.`;

    const result = await callGptJson(prompt, {
      caller: "onboarding",
      schema: personaSchema,
      temperature: 0.4,
    });

    await prisma.writingPersona.create({
      data: {
        workspaceId: account.workspaceId,
        name: result.name,
        creationMethod: "analyze",
        tone: result.tone as JsonInput,
        vocabulary: result.vocabulary as JsonInput,
        structure: result.structure as JsonInput,
        styleFingerprint: result.styleFingerprint,
        isDefault: true,
        isActive: true,
      },
    });

    return { created: true, method: "ai_analyzed", textsAnalyzed: texts.length };
  },
};
