/**
 * Partnership Manager Agent — collaboration tracking, outreach, opportunity scanning.
 *
 * Two modes:
 * - weekly-review: check active partnerships, deadlines, outreach status
 * - opportunity-scan: extract entities from trend briefing and match against KG
 */
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type { AgentContext, PartnershipResult, TrendBriefing } from "./types";

// ── Weekly Review Mode ───────────────────────────────────

export async function runWeeklyReview(ctx: AgentContext): Promise<PartnershipResult> {
  await ctx.log("info", "Starting weekly partnership review");

  const now = new Date();
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // 1. Active partners
  const activePartners = await ctx.prisma.partner.findMany({
    where: { status: "active" },
    select: { id: true, name: true, type: true, lastContactAt: true },
  });

  // 2. In-progress collaborations
  const collabs = await ctx.prisma.collaboration.findMany({
    where: { status: "in-progress" },
    select: {
      id: true,
      title: true,
      endDate: true,
      deliverables: true,
      partner: { select: { id: true, name: true } },
    },
  });

  // Check overdue tasks
  const overdueTasks: PartnershipResult["weeklyReview"] extends infer R
    ? R extends { overdueTasks: infer T } ? T : never
    : never = [];

  for (const collab of collabs) {
    const deliverables = (collab.deliverables as Array<{ item: string; deadline?: string; status?: string }>) ?? [];
    for (const d of deliverables) {
      if (d.deadline && d.status !== "completed" && new Date(d.deadline) < now) {
        const daysOverdue = Math.floor((now.getTime() - new Date(d.deadline).getTime()) / (24 * 60 * 60 * 1000));
        overdueTasks.push({
          partnerId: collab.partner.id,
          task: `${collab.partner.name}: ${d.item}`,
          daysOverdue,
        });
      }
    }

    if (collab.endDate && collab.endDate < now) {
      overdueTasks.push({
        partnerId: collab.partner.id,
        task: `${collab.partner.name}: "${collab.title}" 마감 초과`,
        daysOverdue: Math.floor((now.getTime() - collab.endDate.getTime()) / (24 * 60 * 60 * 1000)),
      });
    }
  }

  // 3. Pending outreach
  const pendingOutreach = await ctx.prisma.outreachCampaign.count({
    where: { status: { in: ["draft", "sent"] } },
  });

  // 4. Upcoming artist releases (from MusicAlbum)
  const upcomingReleases: Array<{ artistName: string; albumTitle: string; releaseDate: string }> = [];
  try {
    const albums = await ctx.prisma.musicAlbum.findMany({
      where: {
        releaseDate: {
          gte: now.toISOString().split("T")[0],
          lte: twoWeeksFromNow.toISOString().split("T")[0],
        },
      },
      select: {
        title: true,
        releaseDate: true,
        artist: { select: { name: true } },
      },
      take: 10,
    });

    for (const album of albums) {
      upcomingReleases.push({
        artistName: album.artist.name,
        albumTitle: album.title,
        releaseDate: album.releaseDate ?? "",
      });
    }
  } catch {
    // MusicAlbum might not have data yet
  }

  // 5. LLM: generate recommendations
  let recommendations: string[] = [];
  try {
    const llmResult = await callGptJson(
      `당신은 웹매거진 제휴 전략 매니저입니다.

## 현황
- 활성 파트너: ${activePartners.length}개 (${activePartners.map((p) => p.name).join(", ") || "없음"})
- 진행 중 협업: ${collabs.length}건
- 지연 작업: ${overdueTasks.length}건
- 대기 중 아웃리치: ${pendingOutreach}건
- 다가오는 릴리스: ${upcomingReleases.map((r) => `${r.artistName} - ${r.albumTitle} (${r.releaseDate})`).join(", ") || "없음"}

3-5개 실행 가능한 제휴 전략 추천사항을 한국어로 작성하세요.`,
      {
        caller: "partnership-manager:weekly-review",
        schema: z.object({ recommendations: z.array(z.string()) }),
      },
    );
    recommendations = llmResult.recommendations;
  } catch (err) {
    await ctx.log("warn", `Recommendation generation failed: ${err}`);
    recommendations = ["파트너십 리뷰 완료 — 추천 생성 실패"];
  }

  await ctx.log("info", `Review: ${activePartners.length} partners, ${overdueTasks.length} overdue, ${upcomingReleases.length} releases`);

  return {
    mode: "weekly-review",
    weeklyReview: {
      activePartners: activePartners.length,
      inProgressCollabs: collabs.length,
      pendingOutreach,
      overdueTasks,
      upcomingReleases,
      recommendations,
    },
  };
}

// ── Opportunity Scan Mode ────────────────────────────────

export async function runOpportunityScan(
  ctx: AgentContext,
  briefing: TrendBriefing,
): Promise<PartnershipResult> {
  await ctx.log("info", `Scanning ${briefing.topics.length} trending topics for partnership opportunities`);

  // 1. Extract entity names from trending topics
  const topTopics = briefing.topics
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 10);

  // 2. Match against existing partners
  const existingPartners = await ctx.prisma.partner.findMany({
    select: { id: true, name: true, type: true, status: true, warmthScore: true },
  });
  const partnerNames = new Set(existingPartners.map((p) => p.name.toLowerCase()));

  // 3. Match against MusicArtist KG
  const artistNames = topTopics.map((t) => t.topic);
  const matchedArtists = artistNames.length > 0
    ? await ctx.prisma.musicArtist.findMany({
        where: {
          OR: artistNames.map((name) => ({
            OR: [
              { name: { contains: name, mode: "insensitive" as const } },
              { nameKo: { contains: name, mode: "insensitive" as const } },
            ],
          })),
        },
        select: { id: true, name: true, nameKo: true, popularity: true },
        take: 20,
      })
    : [];

  const artistNameSet = new Set(matchedArtists.map((a) => a.name.toLowerCase()));

  // 4. Score opportunities
  const opportunities: NonNullable<PartnershipResult["opportunities"]> = [];

  for (const topic of topTopics) {
    const topicLower = topic.topic.toLowerCase();
    const existingRel = partnerNames.has(topicLower);
    const isKnownArtist = artistNameSet.has(topicLower);

    if (isKnownArtist || topic.velocity > 60) {
      const matchedArtist = matchedArtists.find(
        (a) => a.name.toLowerCase().includes(topicLower) || a.nameKo.includes(topic.topic),
      );

      opportunities.push({
        entityName: topic.topic,
        entityType: isKnownArtist ? "artist" : "label",
        trendVelocity: topic.velocity,
        existingRelationship: existingRel,
        suggestedApproach: existingRel
          ? "기존 파트너 — 트렌드 연계 협업 제안"
          : isKnownArtist
            ? `인지도 ${matchedArtist?.popularity ?? 0} 아티스트 — 인터뷰/피처 기사 제안`
            : "신규 타겟 — 탐색적 아웃리치 권장",
        priority: topic.velocity >= 80 ? "high" : topic.velocity >= 50 ? "medium" : "low",
      });
    }
  }

  // 5. Create outreach campaigns for high-priority new opportunities (skip duplicates)
  const highPriorityNew = opportunities.filter((o) => o.priority === "high" && !o.existingRelationship);
  for (const opp of highPriorityNew) {
    // Check for existing recent campaign to avoid duplicates
    const existing = await ctx.prisma.outreachCampaign.findFirst({
      where: {
        targetName: opp.entityName,
        status: { in: ["draft", "sent"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    await ctx.prisma.outreachCampaign.create({
      data: {
        targetName: opp.entityName,
        targetType: opp.entityType,
        status: "draft",
        trendSource: `velocity: ${opp.trendVelocity}`,
      },
    }).catch((err: unknown) => ctx.log("warn", `Outreach campaign creation failed: ${err}`));
  }

  await ctx.log("info", `Found ${opportunities.length} partnership opportunities`);

  return {
    mode: "opportunity-scan",
    opportunities,
  };
}
