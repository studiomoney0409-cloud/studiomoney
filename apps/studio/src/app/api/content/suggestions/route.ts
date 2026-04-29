import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { fetchTrends, formatEnrichedTrendsForPrompt } from "@/lib/trends";
import { json, serverError } from "@/lib/studio";
import { z } from "zod";
import { workspaceGuard } from "@/lib/auth/route-guard";
import { nicheContextFromWorkspace } from "@/lib/niche/context";

const SourceSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
});

const SuggestionItemSchema = z.object({
  topic: z.string(),
  reasoning: z.string(),
  sources: z.array(SourceSchema).optional().default([]),
  formats: z.object({
    sns: z.string(),
    blog: z.string(),
    carousel: z.string(),
  }),
});

const SuggestionSchema = z.object({
  suggestions: z.array(SuggestionItemSchema),
});

type SuggestionItem = z.infer<typeof SuggestionItemSchema>;

function normalizeSuggestions(raw: unknown): unknown {
  const obj = raw as { suggestions?: Array<Record<string, unknown>> };
  if (!obj?.suggestions) return { suggestions: [] };
  for (const s of obj.suggestions) {
    const formats = s.formats as Record<string, unknown> | undefined;
    if (formats) {
      formats.sns = coerceStr(formats.sns);
      formats.blog = coerceStr(formats.blog);
      formats.carousel = coerceStr(formats.carousel);
    }
  }
  return obj;
}

function coerceStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return JSON.stringify(v);
  return "";
}

function safeParseSuggestions(raw: unknown): SuggestionItem[] {
  if (!raw) return [];
  try {
    const normalized = normalizeSuggestions(raw);
    const result = SuggestionSchema.parse(normalized);
    return result.suggestions;
  } catch (e) {
    console.error("[suggestions] parse failed:", e);
    return [];
  }
}

// In-memory cache (30 min) — keyed per workspace
interface CacheEntry {
  suggestions: SuggestionItem[];
  keywords: string[];
  at: number;
}
const cacheByWorkspace = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

/**
 * GET /api/content/suggestions
 * Returns { suggestions: [...], keywords: [...] }
 * Keywords come from workspace.keywords + active autopilot configs in this workspace.
 */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const tpl = await prisma.nicheTemplate.findUnique({ where: { niche: workspace.niche } });
    const ctx = nicheContextFromWorkspace(workspace, tpl);

    // Workspace keywords + active autopilot config keywords (workspace-scoped)
    const configs = await prisma.autopilotConfig.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      select: { topicKeywords: true },
    });
    const autopilotKws = [...new Set(configs.flatMap((c) => c.topicKeywords))];
    const allKeywords = [...new Set([...workspace.keywords, ...autopilotKws])];

    if (allKeywords.length === 0) {
      return json({ suggestions: [], keywords: [] });
    }

    const keywordHash = allKeywords.sort().join("|");

    const cached = cacheByWorkspace.get(workspace.id);
    if (cached && Date.now() - cached.at < CACHE_TTL && cached.keywords.sort().join("|") === keywordHash) {
      return json({ suggestions: cached.suggestions, keywords: cached.keywords });
    }

    const { global: globalTrends, niche: nicheTrends } = await fetchTrends(allKeywords, ctx);

    let enrichedAll: import("@/lib/trends/enrich").EnrichedTrendItem[];
    try {
      const { enrichTrends } = await import("@/lib/trends/enrich");
      enrichedAll = await enrichTrends([...globalTrends, ...nicheTrends]);
    } catch (enrichErr) {
      console.error("[suggestions] enrichTrends failed, using raw trends:", enrichErr);
      enrichedAll = [...globalTrends, ...nicheTrends];
    }

    const trendContext = formatEnrichedTrendsForPrompt(
      enrichedAll.filter((t) => !nicheTrends.some((n) => n.title === t.title)),
      enrichedAll.filter((t) => nicheTrends.some((n) => n.title === t.title)),
    );

    // Recent publications in this workspace (for de-duplication context)
    const recentPubs = await prisma.publication.findMany({
      where: { workspaceId: workspace.id, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 10,
      select: { content: true },
    });
    const topTopics = recentPubs
      .map((p) => {
        const content = p.content as Record<string, unknown> | null;
        return (content?.text as string)?.slice(0, 80) ?? "";
      })
      .filter(Boolean)
      .slice(0, 5);

    const topTopicsSection = topTopics.length > 0
      ? `최근 발행 콘텐츠 (중복 방지):\n${topTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

    const intro = ctx.promptHints?.trim() || "You are a content strategist.";

    const prompt = `${intro}
전문 분야 키워드: ${allKeywords.join(", ")}

${trendContext}

${topTopicsSection}

위 실시간 트렌드와 전문 분야 키워드를 교차 분석하여, 지금 가장 시의적절한 콘텐츠 주제 6개를 제안하세요.

## 규칙
1. 반드시 키워드(${allKeywords.join(", ")})와 관련된 주제만 제안
2. 일반 트렌드에서도 이 매체의 주제 영역과 연결할 수 있는 각도를 적극적으로 찾을 것
3. 다양한 각도에서 제안 (리뷰, 분석, 뉴스, 비하인드, 비교, 추천 등)
4. 각 제안의 근거가 된 트렌드 데이터의 출처(sources)를 반드시 포함
5. 트렌드 항목에 URL이 있으면 그대로 포함
6. 최근 발행 콘텐츠와 중복되지 않을 것

Return JSON:
{
  "suggestions": [
    {
      "topic": "주제 제목 (Korean, concise)",
      "reasoning": "왜 지금 이 주제인지 1문장 (Korean)",
      "sources": [{"label": "출처 설명 (예: Google 트렌드 — 검색어)", "url": "원문 URL (있으면)"}],
      "formats": {
        "sns": "SNS 포스트 미리보기 (1-2줄, Korean, 해시태그 포함)",
        "blog": "블로그 아웃라인 미리보기 (제목 + 핵심 포인트, Korean)",
        "carousel": "카드뉴스 컨셉 (몇 장, 핵심 메시지, Korean)"
      }
    }
  ]
}`;

    let suggestions: SuggestionItem[] = [];
    try {
      const raw = await callGptJson(prompt, {
        caller: "suggestions",
        maxTokens: 3000,
        timeoutMs: 30_000,
      });
      suggestions = safeParseSuggestions(raw);
    } catch (llmErr) {
      console.error("[suggestions] LLM failed:", llmErr);
    }

    cacheByWorkspace.set(workspace.id, { suggestions, keywords: allKeywords, at: Date.now() });

    return json({ suggestions, keywords: allKeywords });
  } catch (e) {
    console.error("[suggestions] Fatal error:", e);
    return json({ suggestions: [], keywords: [], error: String(e) });
  }
}
