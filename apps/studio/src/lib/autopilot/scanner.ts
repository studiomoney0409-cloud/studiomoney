import { prisma } from "@/lib/db";
import { callGptJson } from "@/lib/llm";
import { createLogger } from "@/lib/logger";
import { notifySlack } from "@/lib/notify";
import { fetchTrends, formatEnrichedTrendsForPrompt } from "@/lib/trends";
import { buildTopicPerformanceContext } from "@/lib/feedback/topic-context";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonInput = any;

interface ProposalDraft {
  topic: string;
  source: string;
  sourceUrls: string[];
  reasoning: string;
  text: string;
  hashtags: string[];
  platform: string;
}

// ---------------------------------------------------------------------------
// Context builders — gather concrete "materials" for the prompt
// ---------------------------------------------------------------------------

async function buildArtistAlbumContext(): Promise<string> {
  const [artists, albums] = await Promise.all([
    prisma.musicArtist.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { name: true, nameKo: true, genres: true, activeFrom: true },
    }),
    prisma.musicAlbum.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        artist: { select: { name: true, nameKo: true } },
      },
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
}

async function buildRecentProposalContext(configId: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.autopilotProposal.findMany({
    where: {
      autopilotConfigId: configId,
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { topic: true },
  });

  if (recent.length === 0) return "";

  const lines = ["\n## 최근 7일 이미 다룬 주제 (중복 금지)"];
  for (const r of recent) {
    lines.push(`- ${r.topic}`);
  }
  return lines.join("\n");
}

async function buildPersonaContext(personaId: string | null): Promise<string> {
  if (!personaId) return "";
  const persona = await prisma.writingPersona.findUnique({
    where: { id: personaId },
  });
  if (!persona) return "";

  return `\n## 작성 페르소나
- 이름: ${persona.name}
- 톤: ${JSON.stringify(persona.tone)}
- 문체: ${persona.styleFingerprint}
- 어휘: ${JSON.stringify(persona.vocabulary)}`;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(opts: {
  platform: string;
  keywords: string[];
  trendContext: string;
  artistAlbumContext: string;
  recentProposalContext: string;
  personaContext: string;
  topicPerformanceContext: string;
}): string {
  const keywordLine =
    opts.keywords.length > 0
      ? `사용자 지정 키워드: ${opts.keywords.join(", ")}`
      : "";

  return `당신은 한국 인디/밴드 음악 웹매거진의 편집장입니다.
독자층: 20-30대, 인디 공연을 다니고, 밴드 음악에 깊은 관심이 있는 사람들.
플랫폼: ${opts.platform}

${keywordLine}

${opts.trendContext}
${opts.artistAlbumContext}
${opts.recentProposalContext}
${opts.personaContext}
${opts.topicPerformanceContext}

---

위 데이터를 교차 분석하여, 지금 가장 시의적절한 콘텐츠 1개를 제안하세요.

## 반드시 지킬 규칙

1. **구체성**: 반드시 특정 아티스트명, 곡명, 앨범명, 공연 날짜, 또는 이벤트명을 포함할 것
2. **근거 필수**: 위 데이터 중 어떤 것을 근거로 이 주제를 선택했는지 "source" 필드에 명시
3. **중복 금지**: "최근 7일 이미 다룬 주제"와 겹치거나 유사한 주제 금지
4. **포괄적 표현 금지**: 아래 BAD 예시와 같은 막연한 주제 절대 금지
5. **사실 확인**: 아티스트를 "신인", "떠오르는", "새로운" 등으로 표현할 때 반드시 활동시작 연도를 확인할 것. 활동시작이 2년 이상 된 아티스트는 신인이 아님

## BAD — 이런 제안은 하지 마세요
- "인디 음악의 숨은 명곡 발굴하기" → 어떤 곡인지 특정 안 됨
- "K팝 아티스트의 비하인드 스토리 공개!" → 누구인지 없음
- "2026년 봄, 기대되는 신보 소식!" → 어떤 아티스트의 어떤 앨범인지 없음
- "기타 장비 분석: 최고의 사운드를 찾아서" → 누구의 어떤 장비인지 없음

## GOOD — 이 수준으로 구체적이어야 합니다
- "실리카겔 'NO PAIN' 기타 톤 분석 — Fender Jazzmaster 세팅 추정"
- "잔나비 '소우주' 선공개곡 가사 해석 — 전작과 달라진 3가지"
- "뉴진스 3월 컴백 트레일러 분석 — 'How Sweet' 뮤비 레퍼런스 추적"
- "서울숲재즈페스티벌 2026 라인업 발표 — 주목할 아티스트 3팀"

Return JSON:
{
  "topic": "구체적 주제 제목 (Korean)",
  "source": "이 주제를 선택한 근거 데이터 출처 (예: 'Spotify 신보 데이터 + Google 트렌드 검색량 상승')",
  "sourceUrls": ["근거가 된 트렌드 항목의 원문 URL들 (위 데이터에서 URL이 있는 항목만)"],
  "reasoning": "왜 지금 이 주제인지 1-2문장 (Korean)",
  "text": "${opts.platform}에 맞는 완성된 게시물 본문 (Korean)",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"]
}

Respond ONLY with the JSON object.`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Scan trends and generate content proposals for an autopilot config.
 * Called by the autopilot_scan job.
 */
export async function generateProposals(configId: string): Promise<number> {
  const config = await prisma.autopilotConfig.findUnique({
    where: { id: configId },
    include: { workspace: { select: { niche: true } } },
  });
  if (!config || !config.isActive) return 0;
  const niche = config.workspace?.niche;

  // Count today's pending/approved/published proposals
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.autopilotProposal.count({
    where: {
      autopilotConfigId: configId,
      createdAt: { gte: todayStart },
      status: { in: ["pending", "approved", "published"] },
    },
  });
  const remaining = config.postsPerDay - todayCount;
  if (remaining <= 0) return 0;

  // Gather all context in parallel
  const keywords = config.topicKeywords;

  const [
    { global: globalTrends, niche: nicheTrends },
    artistAlbumContext,
    recentProposalContext,
    personaContext,
    topicPerformanceContext,
  ] = await Promise.all([
    fetchTrends(keywords.length > 0 ? keywords : undefined),
    buildArtistAlbumContext(),
    buildRecentProposalContext(configId),
    buildPersonaContext(config.personaId),
    buildTopicPerformanceContext(),
  ]);

  // Enrich trends with real-time context (non-fatal — lazy import to avoid
  // heavy deps crashing the module at load time)
  let enrichedGlobal: import("@/lib/trends/enrich").EnrichedTrendItem[];
  let enrichedNiche: import("@/lib/trends/enrich").EnrichedTrendItem[];
  try {
    const { enrichTrends } = await import("@/lib/trends/enrich");
    const allRaw = [...globalTrends, ...nicheTrends];
    const enriched = await enrichTrends(allRaw, { niche });
    enrichedGlobal = enriched.filter((t) => !nicheTrends.some((n) => n.title === t.title));
    enrichedNiche = enriched.filter((t) => nicheTrends.some((n) => n.title === t.title));
  } catch (enrichErr) {
    createLogger({}).warn(enrichErr, "enrichTrends failed, using raw trends");
    enrichedGlobal = globalTrends;
    enrichedNiche = nicheTrends;
  }

  const trendContext = formatEnrichedTrendsForPrompt(enrichedGlobal, enrichedNiche);

  // Generate proposals for each platform
  const proposals: ProposalDraft[] = [];
  for (const platform of config.platforms) {
    if (proposals.length >= remaining) break;

    const prompt = buildPrompt({
      platform,
      keywords,
      trendContext,
      artistAlbumContext,
      recentProposalContext,
      personaContext,
      topicPerformanceContext,
    });

    try {
      const parsed = await callGptJson(prompt, {
        caller: "autopilot",
        schema: z.object({
          topic: z.string().default("Untitled"),
          source: z.string().default(""),
          sourceUrls: z.array(z.string()).default([]),
          reasoning: z.string().default(""),
          text: z.string().default(""),
          hashtags: z.array(z.string()).default([]),
        }),
      });
      proposals.push({
        topic: parsed.topic ?? "Untitled",
        source: parsed.source ?? "",
        sourceUrls: parsed.sourceUrls ?? [],
        reasoning: parsed.reasoning ?? "",
        text: parsed.text ?? "",
        hashtags: parsed.hashtags ?? [],
        platform,
      });
    } catch (err) {
      createLogger({ configId, platform }).error(err, "autopilot proposal failed");
      await notifySlack(
        `[Autopilot] 제안 생성 실패`,
        { configId, platform, error: String(err) },
      );
    }
  }

  // Save proposals
  for (const p of proposals) {
    await prisma.autopilotProposal.create({
      data: {
        autopilotConfigId: configId,
        topic: p.topic,
        reasoning: `[${p.source}] ${p.reasoning}`,
        content: { text: p.text, hashtags: p.hashtags, sourceUrls: p.sourceUrls } as JsonInput,
        platform: p.platform,
        personaId: config.personaId ?? null,
        status: config.approvalMode === "auto" ? "approved" : "pending",
      },
    });
  }

  return proposals.length;
}

/**
 * Publish approved proposals that are due.
 */
export async function publishApprovedProposals(): Promise<number> {
  const approved = await prisma.autopilotProposal.findMany({
    where: {
      status: "approved",
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
    },
    include: { config: true },
    take: 5,
  });

  let published = 0;
  for (const proposal of approved) {
    const config = proposal.config;
    if (!config) continue;

    try {
      // Create a publication and publish
      const content = proposal.content as Record<string, unknown>;
      const pub = await prisma.publication.create({
        data: {
          workspaceId: config.workspaceId,
          snsAccountId: config.snsAccountId,
          platform: proposal.platform,
          content: content as JsonInput,
          personaId: config.personaId ?? null,
          status: "draft",
        },
      });

      // Import publishNow dynamically to avoid circular deps
      const { publishNow } = await import("@/lib/sns/publish");
      await publishNow(pub.id);

      await prisma.autopilotProposal.update({
        where: { id: proposal.id },
        data: {
          status: "published",
          publishedAt: new Date(),
          publicationId: pub.id,
        },
      });
      published++;
    } catch (err) {
      createLogger({ proposalId: proposal.id }).error(err, "autopilot publish failed");
      await notifySlack(
        `[Autopilot] 게시물 발행 실패`,
        { proposalId: proposal.id, error: String(err) },
      );
    }
  }

  return published;
}
