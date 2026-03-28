/**
 * Design Director Agent — wraps existing design engine with
 * performance-based style selection.
 *
 * Wraps existing: generateDesignBrief(), runRefinementLoop()
 */
import { generateDesignBrief } from "@/lib/design/design-director";
import { runRefinementLoop } from "@/lib/design/refinement-loop";
import type { DesignPlatform, DesignFormat, DesignBrief } from "@/lib/design/types";
import type { AgentContext } from "./types";
import type { PersonaContext } from "@/lib/pipeline/types";

interface DesignDirectorInput {
  topic: string;
  articleContent: string;
  platforms: string[];
  personaId?: string;
  pipelineRunId?: string;
}

export interface DesignDirectorResult {
  topic: string;
  designAssets: Array<{
    platform: string;
    brief: DesignBrief;
    imageUrl?: string;
  }>;
  publicationIds: string[];
}

export async function runDesignProduction(
  ctx: AgentContext,
  input: DesignDirectorInput,
): Promise<DesignDirectorResult> {
  await ctx.log("info", `Designing for: "${input.topic}" on ${input.platforms.join(", ")}`);

  // 1. Fetch article content from pipeline run if not provided
  let content = input.articleContent;
  if (!content && input.pipelineRunId) {
    const run = await ctx.prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      select: { editedContent: true, draftContent: true },
    });
    content = run?.editedContent ?? run?.draftContent ?? "";
  }

  if (!content) {
    await ctx.log("warn", "No article content available — using topic as content");
    content = input.topic;
  }

  // 2. Load persona if available
  let persona: PersonaContext | null = null;
  if (input.personaId) {
    const p = await ctx.prisma.writingPersona.findUnique({
      where: { id: input.personaId },
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

  // 3. Query performance-based style preferences
  const topStyles = await ctx.prisma.stylePerformanceEntry.findMany({
    orderBy: { engagementRate: "desc" },
    take: 5,
    select: {
      typographyMood: true,
      layoutStyle: true,
      colorMood: true,
      engagementRate: true,
    },
  });

  const topStyle = topStyles[0];
  const preferredStyle = topStyle
    ? {
        typographyMood: topStyle.typographyMood,
        layoutStyle: topStyle.layoutStyle,
      }
    : null;

  if (preferredStyle) {
    await ctx.log("info", `Using performance-preferred style: ${preferredStyle.typographyMood} / ${preferredStyle.layoutStyle}`);
  }

  // 4. Generate designs per platform
  const designAssets: DesignDirectorResult["designAssets"] = [];

  for (const platform of input.platforms) {
    try {
      // Generate brief (existing)
      // Generate brief (existing)
      const brief = await generateDesignBrief({
        topic: input.topic,
        content,
      });

      // Build minimal visual design input for refinement loop
      const visualInput: import("@/lib/design/visual-designer").VisualDesignInput = {
        brief,
        contentSlides: [{ title: input.topic, body: content.slice(0, 500), role: "cover" }],
      };

      // Run refinement loop (existing) for higher quality
      const refined = await runRefinementLoop(
        visualInput,
        brief,
        "sns_image" as DesignFormat,
        platform as DesignPlatform,
        { maxIterations: 2 },
      );

      designAssets.push({
        platform,
        brief,
        imageUrl: undefined, // rendered externally via resvg
      });

      await ctx.log("info", `Design for ${platform}: ${refined.iterations.length} iterations`);
    } catch (err) {
      await ctx.log("error", `Design failed for ${platform}: ${err}`);
      // Continue with other platforms
    }
  }

  await ctx.log("info", `Design complete: ${designAssets.length}/${input.platforms.length} platforms`);

  return {
    topic: input.topic,
    designAssets,
    publicationIds: [],
  };
}
