/**
 * Copy Editor Agent — final quality gate before publication.
 *
 * Runs all 3 QA modules (copy, legal, technical) in parallel,
 * checks cross-article consistency via embeddings,
 * and can BLOCK publication if critical issues are found.
 *
 * Unlike editor-agent.ts (which rewrites inside the pipeline loop),
 * this agent only passes or blocks — no rewriting.
 */
import { callGptJson } from "@/lib/llm";
import { searchHybrid } from "@/lib/pipeline/embedding";
import { runCopyQa, type CopyQaInput } from "../../../../../agents/shared/qa/copy";
import { runLegalQa, type LegalQaInput } from "../../../../../agents/shared/qa/legal";
import { runTechnicalQa, type TechnicalQaInput } from "../../../../../agents/shared/qa/technical";
import { aggregateQa } from "../../../../../agents/shared/qa/aggregate";
import { z } from "zod";
import type { AgentContext, CopyEditorResult } from "./types";

interface CopyEditorInput {
  articleContent: string;
  topic: string;
  platforms: string[];
  pipelineRunId?: string;
  personaId?: string;
  publicationIds: string[];
  blogPostId?: string;
}

export async function runCopyEdit(
  ctx: AgentContext,
  input: CopyEditorInput,
): Promise<CopyEditorResult> {
  await ctx.log("info", `Starting copy edit for: ${input.topic}`);

  // 1. Build slide-format input from article (QA modules expect slide format)
  const paragraphs = input.articleContent
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, i) => ({
      slideIndex: i,
      title: p.slice(0, 60),
      bodyText: p,
      kind: "text",
    }));

  const caption = input.articleContent.slice(0, 2200);
  const hashtagMatch = input.articleContent.match(/#[\w가-힣]+/g);
  const hashtags = hashtagMatch?.slice(0, 30) ?? [];

  // 2. Run all 3 QA modules in parallel
  const technicalInput: TechnicalQaInput = {
    captionText: caption,
    hashtags,
    pngPaths: [],
    slides: paragraphs.map((s) => ({
      slideIndex: s.slideIndex,
      title: s.title,
      bodyText: s.bodyText,
    })),
  };

  const copyInput: CopyQaInput = {
    slides: paragraphs,
    caption,
  };

  const legalInput: LegalQaInput = {
    slides: paragraphs.map((s) => ({
      slideIndex: s.slideIndex,
      title: s.title,
      bodyText: s.bodyText,
    })),
    caption,
  };

  const [technical, copy, legal] = await Promise.all([
    runTechnicalQa(technicalInput).catch((err: unknown) => {
      ctx.log("warn", `Technical QA failed: ${err}`);
      return { passed: true, issues: [] };
    }),
    runCopyQa(copyInput).catch((err: unknown) => {
      ctx.log("warn", `Copy QA failed: ${err}`);
      return { passed: true, issues: [], suggestions: [] };
    }),
    runLegalQa(legalInput).catch((err: unknown) => {
      ctx.log("warn", `Legal QA failed: ${err}`);
      return { passed: true, blocked: false, issues: [], riskScore: 0 };
    }),
  ]);

  const qaReport = aggregateQa({ technical, copy, legal });
  await ctx.log("info", `QA report: ${qaReport.overall.errorCount} errors, ${qaReport.overall.warningCount} warnings, blocked=${qaReport.overall.blocked}`);

  // 3. Cross-article consistency check via embeddings
  const crossArticleIssues: CopyEditorResult["crossArticleIssues"] = [];

  try {
    // Use first 300 chars of article for more accurate similarity search
    const searchQuery = input.articleContent.slice(0, 300) || input.topic;
    const similar = await searchHybrid(searchQuery, { limit: 3 });
    for (const chunk of similar) {
      if (chunk.score > 0.92) {
        crossArticleIssues.push({
          type: "duplication",
          message: `기존 기사와 높은 유사도 (${(chunk.score * 100).toFixed(0)}%): "${chunk.content.slice(0, 80)}..."`,
          relatedArticleId: chunk.sourceId,
        });
      }
    }
  } catch (err) {
    await ctx.log("warn", `Cross-article check failed: ${err}`);
  }

  // 4. Persona voice consistency check
  if (input.personaId) {
    try {
      const persona = await ctx.prisma.writingPersona.findUnique({
        where: { id: input.personaId },
        select: { name: true, styleFingerprint: true, tone: true },
      });

      if (persona?.styleFingerprint) {
        const voiceCheck = await callGptJson(
          `당신은 글 톤 일관성 검사 전문가입니다.

## 페르소나 스타일
- 이름: ${persona.name}
- 톤: ${persona.tone}
- 스타일 지문: ${persona.styleFingerprint}

## 검사할 글 (처음 1000자)
${input.articleContent.slice(0, 1000)}

이 글이 해당 페르소나의 톤과 일관성이 있는지 확인하세요.`,
          {
            caller: `copy-editor:voice-check`,
            schema: z.object({
              consistent: z.boolean(),
              driftAreas: z.array(z.string()),
            }),
          },
        );

        if (!voiceCheck.consistent) {
          for (const area of voiceCheck.driftAreas) {
            crossArticleIssues.push({
              type: "tone-drift",
              message: area,
            });
          }
        }
      }
    } catch (err) {
      await ctx.log("warn", `Voice consistency check failed: ${err}`);
    }
  }

  // 5. Determine verdict
  const hasDuplication = crossArticleIssues.some((i) => i.type === "duplication");
  const blockReasons: string[] = [];

  if (qaReport.overall.blocked) {
    blockReasons.push("법적 위험 감지 (Legal QA blocked)");
  }
  if (qaReport.overall.errorCount >= 5) {
    blockReasons.push(`심각한 오류 ${qaReport.overall.errorCount}건 감지`);
  }
  if (hasDuplication) {
    blockReasons.push("기존 기사와 과도한 중복");
  }

  let verdict: CopyEditorResult["verdict"];
  if (blockReasons.length > 0) {
    verdict = "blocked";
  } else if (qaReport.overall.errorCount > 0 || crossArticleIssues.length > 0) {
    verdict = "needs-review";
  } else {
    verdict = "passed";
  }

  // 6. Update publication statuses if blocked
  let publicationsUpdated = 0;
  if (verdict === "blocked" && input.publicationIds.length > 0) {
    const updateResult = await ctx.prisma.publication.updateMany({
      where: { id: { in: input.publicationIds } },
      data: { status: "draft" }, // revert to draft instead of publishing
    });
    publicationsUpdated = updateResult.count;
    await ctx.log("warn", `Blocked ${publicationsUpdated} publications: ${blockReasons.join(", ")}`);
  }

  const result: CopyEditorResult = {
    crossArticleIssues,
    verdict,
    blockReasons,
    issueCount: qaReport.overall.errorCount + qaReport.overall.warningCount,
    publicationsUpdated,
  };

  await ctx.log("info", `Copy edit verdict: ${verdict} (${result.issueCount} issues)`);

  return result;
}
