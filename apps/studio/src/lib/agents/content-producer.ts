/**
 * Content Producer Agent — wraps E2E pipeline with quality gate
 * and platform-specific text variants.
 *
 * Wraps existing: runE2EPipeline(), getSmartScheduleTime()
 */
import { runE2EPipeline } from "@/lib/pipeline/e2e-orchestrator";
import { getSmartScheduleTime } from "@/lib/autopilot/scheduler";
import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type {
  AgentContext,
  DailyAssignment,
  ContentProducerResult,
  PlatformVariant,
} from "./types";
import type { PersonaContext } from "@/lib/pipeline/types";
import type { DesignPlatform } from "@/lib/design/types";

const QUALITY_AUTO_APPROVE = 75;
const QUALITY_REVIEW = 50;

export async function runContentProduction(
  ctx: AgentContext,
  assignment: DailyAssignment,
): Promise<ContentProducerResult> {
  await ctx.log("info", `Producing content: "${assignment.topic}" (${assignment.contentType})`);

  // 1. Load persona if specified
  let persona: PersonaContext | null = null;
  if (assignment.personaId) {
    const p = await ctx.prisma.writingPersona.findUnique({
      where: { id: assignment.personaId },
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
        contentRules: p.contentRules as { always: string[]; never: string[] } | null,
        goldenExamples: p.goldenExamples as Record<string, string[]> | null,
        channelProfiles: p.channelProfiles as Record<string, unknown> | null,
      };
    }
  }

  // 2. Run E2E pipeline (article only, design handled by Design Director)
  const e2eResult = await runE2EPipeline({
    topic: assignment.topic,
    contentType: assignment.contentType as "blog" | "sns" | "carousel" | "review",
    persona,
    platforms: (assignment.platforms || ["instagram"]) as DesignPlatform[],
    skip: { design: true, dataViz: true },
  });

  if (e2eResult.stage === "failed" || !e2eResult.article) {
    await ctx.log("error", `Pipeline failed for "${assignment.topic}"`);
    return {
      topic: assignment.topic,
      qualityScore: 0,
      autoApproved: false,
      platformVariants: [],
      publicationIds: [],
    };
  }

  const qualityScore = e2eResult.article.qualityScore?.overall ?? 0;
  await ctx.log("info", `Quality score: ${qualityScore}/100`);

  // 3. Quality gate
  let autoApproved = false;
  let finalContent = e2eResult.article.editedContent || e2eResult.article.draftContent || "";

  if (qualityScore >= QUALITY_AUTO_APPROVE) {
    autoApproved = true;
    await ctx.log("info", "Auto-approved (score >= 75)");
  } else if (qualityScore >= QUALITY_REVIEW) {
    await ctx.log("info", "Needs human review (score 50-74)");
  } else {
    await ctx.log("warn", `Low quality (score < 50) — will create for review`);
  }

  // 4. Generate platform-specific text variants
  const platformVariants: PlatformVariant[] = [];
  if (finalContent && assignment.platforms?.length) {
    try {
      const variants = await callGptJson(
        `원본 기사를 각 SNS 플랫폼에 맞게 변환해주세요.

## 원본 기사 (요약)
제목: ${assignment.topic}
${finalContent.slice(0, 1500)}

## 변환할 플랫폼
${assignment.platforms.join(", ")}

## 규칙
- threads: 150자 이내, 핵심만 짧게, 의견 제시
- instagram: 300자 이내, 해시태그 5-10개, 이모지 적절히
- blog: 원본 그대로 (변환 불필요)
- twitter: 280자 이내

각 플랫폼별 { platform, text, hashtags } 형태로 반환하세요.`,
        {
          caller: `content-producer:variants`,
          schema: z.object({
            variants: z.array(z.object({
              platform: z.string(),
              text: z.string(),
              hashtags: z.array(z.string()).default([]),
            })),
          }),
        },
      );
      platformVariants.push(...variants.variants.map((v) => ({
        platform: v.platform,
        text: v.text,
        hashtags: v.hashtags ?? [],
      })));
    } catch (err) {
      await ctx.log("warn", `Platform variant generation failed: ${err}`);
      // Fallback: use original content for all platforms
      for (const platform of assignment.platforms) {
        platformVariants.push({
          platform,
          text: finalContent.slice(0, 500),
          hashtags: [],
        });
      }
    }
  }

  // 5. Create proposals/publications
  const publicationIds: string[] = [];
  const pipelineRunId: string | undefined = undefined;

  // Find an active SNS account for each platform
  for (const variant of platformVariants) {
    const account = await ctx.prisma.snsAccount.findFirst({
      where: { platform: variant.platform },
      select: { id: true },
    });
    if (!account) continue;

    // Create proposal
    await ctx.prisma.autopilotProposal.create({
      data: {
        autopilotConfigId: (await ctx.prisma.autopilotConfig.findFirst({
          where: { snsAccountId: account.id, isActive: true },
          select: { id: true },
        }))?.id ?? "default",
        topic: assignment.topic,
        reasoning: `[Agent] ${assignment.angle}`,
        content: {
          text: variant.text,
          hashtags: variant.hashtags,
        },
        platform: variant.platform,
        personaId: assignment.personaId ?? null,
        status: autoApproved ? "approved" : "pending",
      },
    });

    // Create publication if auto-approved
    if (autoApproved) {
      const smartTime = await getSmartScheduleTime(account.id).catch(() => null);
      const pub = await ctx.prisma.publication.create({
        data: {
          snsAccountId: account.id,
          platform: variant.platform,
          content: { text: variant.text, hashtags: variant.hashtags },
          personaId: assignment.personaId ?? null,
          status: "scheduled",
          scheduledAt: smartTime?.scheduledAt ?? new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      publicationIds.push(pub.id);
    }
  }

  await ctx.log("info", `Created ${publicationIds.length} publications (auto-approved: ${autoApproved})`);

  // 6. Update daily briefing status
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const briefing = await ctx.prisma.dailyBriefing.findUnique({
    where: { date: todayDate },
  });
  if (briefing) {
    const statusJson = (briefing.statusJson as Record<string, string>) ?? {};
    const assignments = (briefing.assignmentsJson as unknown as DailyAssignment[]) ?? [];
    const idx = assignments.findIndex((a) => a.topic === assignment.topic);
    if (idx >= 0) {
      statusJson[String(idx)] = "completed";
      await ctx.prisma.dailyBriefing.update({
        where: { id: briefing.id },
        data: { statusJson },
      });
    }
  }

  return {
    pipelineRunId,
    topic: assignment.topic,
    qualityScore,
    autoApproved,
    platformVariants,
    publicationIds,
  };
}
