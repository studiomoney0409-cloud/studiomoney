import OpenAI from "openai";
import { PlanGenerateRequestSchema, PlanGenerateResponseSchema } from "@/lib/studio/plan/types";
import { CONTENT_CATEGORIES } from "@/lib/studio/contentCategories";
import { prisma } from "@/lib/db";
import { fetchTrends, formatEnrichedTrendsForPrompt } from "@/lib/trends";
import { getWorkspaceOrNull } from "@/lib/auth/workspace";
import { buildTopicPerformanceContext } from "@/lib/feedback/topic-context";

interface FrequencyInput {
  weeklyTotal: number;
  maxPerDay: number;
  heavyDays?: number[];
}

const DAY_NAMES_KR = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * Fetch live trends + keywords and format for prompt injection.
 * Non-fatal — returns empty string on failure.
 */
async function buildTrendContext(niche?: string): Promise<string> {
  try {
    // Load niche keywords
    const row = await prisma.setting.findUnique({ where: { key: "niche-keywords" } });
    const nicheKeywords = (row?.value as { keywords?: string[] })?.keywords ?? [];

    // Also gather autopilot keywords
    const configs = await prisma.autopilotConfig.findMany({
      where: { isActive: true },
      select: { topicKeywords: true },
    });
    const autopilotKws = [...new Set(configs.flatMap((c) => c.topicKeywords))];
    const allKeywords = [...new Set([...nicheKeywords, ...autopilotKws])];

    const { global: globalTrends, niche: nicheTrends } = await fetchTrends(
      allKeywords.length > 0 ? allKeywords : undefined,
    );

    // Enrich (non-fatal)
    let enrichedAll: import("@/lib/trends/enrich").EnrichedTrendItem[];
    try {
      const { enrichTrends } = await import("@/lib/trends/enrich");
      enrichedAll = await enrichTrends([...globalTrends, ...nicheTrends], { niche });
    } catch {
      enrichedAll = [...globalTrends, ...nicheTrends];
    }

    const enrichedGlobal = enrichedAll.filter(
      (t) => !nicheTrends.some((n) => n.title === t.title),
    );
    const enrichedNiche = enrichedAll.filter(
      (t) => nicheTrends.some((n) => n.title === t.title),
    );

    return formatEnrichedTrendsForPrompt(enrichedGlobal, enrichedNiche);
  } catch (err) {
    console.error("[plan/generate] trend fetch failed:", err);
    return "";
  }
}

/**
 * Fetch recent artist/album data from Knowledge Graph.
 */
async function buildArtistAlbumContext(): Promise<string> {
  try {
    const [artists, albums] = await Promise.all([
      prisma.musicArtist.findMany({
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { name: true, nameKo: true, genres: true, activeFrom: true },
      }),
      prisma.musicAlbum.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { artist: { select: { name: true, nameKo: true } } },
      }),
    ]);

    if (artists.length === 0 && albums.length === 0) return "";

    const lines: string[] = ["\n## 참고할 아티스트/앨범 데이터"];
    if (artists.length > 0) {
      lines.push("아티스트:");
      for (const a of artists) {
        const name = a.nameKo || a.name;
        const genres = a.genres.length > 0 ? ` (${a.genres.slice(0, 3).join(", ")})` : "";
        const since = a.activeFrom ? ` [활동시작: ${a.activeFrom}]` : "";
        lines.push(`- ${name}${genres}${since}`);
      }
    }
    if (albums.length > 0) {
      lines.push("최근 앨범:");
      for (const al of albums) {
        const artistName = al.artist.nameKo || al.artist.name;
        const release = al.releaseDate ? ` [${al.releaseDate}]` : "";
        lines.push(`- ${artistName} — '${al.titleKo || al.title}'${release} (${al.albumType})`);
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

function buildSystemPrompt(
  startDate: string,
  endDate: string,
  frequency: FrequencyInput,
  existingEvents: Array<{ date: string; title: string; category: string }>,
  trendContext: string,
  artistAlbumContext: string,
  topicPerformanceContext: string,
  preferences?: {
    focusCategories?: string[];
    avoidCategories?: string[];
    typeRatio?: { post: number; reels: number; promotion: number };
    notes?: string;
  },
): string {
  const categories = CONTENT_CATEGORIES.map(
    (c) => `  - ${c.id}: ${c.label} — ${c.description}`,
  ).join("\n");

  const existingJson =
    existingEvents.length > 0
      ? JSON.stringify(existingEvents, null, 2)
      : "(없음)";

  const prefSection: string[] = [];
  if (preferences?.focusCategories?.length) {
    prefSection.push(
      `선호 카테고리 (비중 높게): ${preferences.focusCategories.join(", ")}`,
    );
  }
  if (preferences?.avoidCategories?.length) {
    prefSection.push(
      `제외 카테고리 (사용하지 않기): ${preferences.avoidCategories.join(", ")}`,
    );
  }
  if (preferences?.typeRatio) {
    const r = preferences.typeRatio;
    const allowed = Object.entries(r)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${v}%`)
      .join(", ");
    const forbidden = Object.entries(r)
      .filter(([, v]) => v === 0)
      .map(([k]) => k);
    prefSection.push(`타입 비율: ${allowed}`);
    if (forbidden.length > 0) {
      prefSection.push(
        `STRICTLY FORBIDDEN types (0% — NEVER use these): ${forbidden.join(", ")}. Do NOT generate any item with these types.`,
      );
    }
  }
  if (preferences?.notes) {
    prefSection.push(`추가 요청: ${preferences.notes}`);
  }

  const heavyDaysText =
    frequency.heavyDays && frequency.heavyDays.length > 0
      ? `집중 요일: ${frequency.heavyDays.map((d) => DAY_NAMES_KR[d]).join(", ")} — 이 요일에 더 많은 게시물을 배치할 것`
      : "";

  return `You are an Instagram content planning assistant for a Korean indie/band music web magazine.
Given a date range, posting frequency, and REAL-TIME TREND DATA, generate a content schedule.

## Content Categories (MUST use these exact IDs):
${categories}

${trendContext ? `## 실시간 트렌드 데이터\n${trendContext}` : ""}
${artistAlbumContext}
${topicPerformanceContext}

## Rules:
1. 날짜 범위: ${startDate} ~ ${endDate}, 주 ${frequency.weeklyTotal}개 게시, 하루 최대 ${frequency.maxPerDay}개
${heavyDaysText ? `   ${heavyDaysText}` : ""}
2. 카테고리 분산 — 같은 카테고리 주 3회 이상 금지
3. 요일 최적화 — 집중 요일이 지정되지 않은 경우 화/목/토는 post 선호, 월/수는 reels 선호 (단, User Preferences에서 특정 타입이 0%이면 해당 타입은 절대 사용하지 말 것)
4. promotion은 주 1회 이하
5. 기존 캘린더 이벤트와 주제 중복 금지
6. tags는 한국어 인스타그램 해시태그 (# 포함, 5개 이내)
7. reasoning은 왜 이 날짜에 이 카테고리/주제를 선택했는지, 어떤 트렌드 데이터를 근거로 했는지 1문장 설명

## 구체성 규칙 (매우 중요)
제목과 설명은 반드시 특정 아티스트명, 곡명, 앨범명, 공연/이벤트명을 포함해야 합니다.

### BAD — 이런 주제는 절대 금지:
- "인디 음악의 숨은 명곡 발굴하기" → 어떤 곡인지 특정 안 됨
- "이번 주 주목할 신보 소식" → 어떤 아티스트의 어떤 앨범인지 없음
- "밴드 음악 트렌드 분석" → 막연함
- "기타 장비 분석: 최고의 사운드를 찾아서" → 누구의 어떤 장비인지 없음
- "봄맞이 플레이리스트 추천" → 어떤 곡들인지 없음

### GOOD — 이 수준으로 구체적이어야 합니다:
- "실리카겔 'NO PAIN' 기타 톤 분석 — Fender Jazzmaster 세팅 추정"
- "잔나비 '소우주' 선공개곡 가사 해석 — 전작과 달라진 3가지"
- "서울숲재즈페스티벌 2026 라인업 발표 — 주목할 아티스트 3팀"
- "혁오 vs 실리카겔: 2026년 페스티벌 헤드라이너 비교"

위 트렌드 데이터와 아티스트/앨범 데이터를 적극 활용하여 구체적 주제를 생성하세요.

${prefSection.length > 0 ? "## User Preferences:\n" + prefSection.join("\n") : ""}

## Existing calendar events (avoid duplication):
${existingJson}

## Output Format:
Respond with a JSON object containing:
- "items": array of objects, each with: date, title, description, type, category, tags, reasoning
- "summary": 전체 플랜 전략을 1-2문장으로 요약 (한국어)

IMPORTANT: Output MUST be valid JSON. category values must be one of the exact IDs listed above. type must be "post", "reels", or "promotion".`;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PlanGenerateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { startDate, endDate, frequency, existingEvents, preferences } = parsed.data;

  const ctx = await getWorkspaceOrNull();
  const niche = ctx?.workspace.niche;

  // Fetch real-time trends + artist data + topic performance feedback in parallel
  const [trendContext, artistAlbumContext, topicPerformanceContext] = await Promise.all([
    buildTrendContext(niche),
    buildArtistAlbumContext(),
    buildTopicPerformanceContext(),
  ]);

  const client = new OpenAI({ apiKey });
  const systemPrompt = buildSystemPrompt(
    startDate,
    endDate,
    frequency,
    existingEvents ?? [],
    trendContext,
    artistAlbumContext,
    topicPerformanceContext,
    preferences,
  );

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${startDate}부터 ${endDate}까지 주 ${frequency.weeklyTotal}개, 하루 최대 ${frequency.maxPerDay}개 콘텐츠 플랜을 생성해줘.${
            frequency.heavyDays?.length
              ? ` ${frequency.heavyDays.map((d) => DAY_NAMES_KR[d]).join("/")}요일에 더 많이 배치해줘.`
              : ""
          }`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    const json = JSON.parse(text) as unknown;
    const validated = PlanGenerateResponseSchema.safeParse(json);

    if (validated.success) {
      const result = validated.data;

      // Enforce type ratio: reassign forbidden types (0%) to allowed types
      if (preferences?.typeRatio) {
        const ratio = preferences.typeRatio;
        const forbidden = new Set(
          (Object.entries(ratio) as [string, number][])
            .filter(([, v]) => v === 0)
            .map(([k]) => k),
        );

        if (forbidden.size > 0) {
          const allowed = (["post", "reels", "promotion"] as const).filter(
            (t) => !forbidden.has(t),
          );
          if (allowed.length > 0) {
            const totalWeight = allowed.reduce((s, t) => s + ratio[t], 0);

            for (const item of result.items) {
              if (forbidden.has(item.type)) {
                let r = Math.random() * totalWeight;
                let picked = allowed[0]!;
                for (const t of allowed) {
                  r -= ratio[t];
                  if (r <= 0) {
                    picked = t;
                    break;
                  }
                }
                item.type = picked;
              }
            }
          }
        }
      }

      return Response.json(result);
    }

    return Response.json(
      { error: "AI response validation failed", raw: json },
      { status: 502 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}
