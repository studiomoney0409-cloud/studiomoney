/**
 * Design Director Agent — analyzes content and generates a DesignBrief.
 *
 * The "creative director" of the design engine. Takes content input
 * (topic, article text, content type) and produces a DesignBrief that
 * all downstream agents (Visual Designer, Motion Designer, etc.) consume.
 *
 * Uses gpt-4o-mini for cost efficiency; upgrade to gpt-4o for higher
 * quality on premium content.
 */

import { callGptJson } from "@/lib/llm";
import { z } from "zod";
import type {
  DesignBrief,
  DesignContentType,
  DesignEngineInput,
  DesignFormat,
  DesignOutput,
  DesignPlatform,
  ColorMood,
  LayoutStyle,
  TypographyMood,
} from "./types";

// ── Zod schema for LLM response validation ─────────────

const designDirectorSchema = z.object({
  contentType: z.string(),
  mood: z.string().default("세련된"),
  keyMessage: z.string().default(""),
  visualConcept: z.string().default("모던 미니멀"),
  colorDirection: z.object({
    primary: z.string().default("#6C5CE7"),
    mood: z.string().default("vibrant"),
  }).default({ primary: "#6C5CE7", mood: "vibrant" }),
  layoutStyle: z.string().default("bold"),
  typographyMood: z.string().default("sans_modern"),
});

// ── Content-type → default output plan ──────────────────

interface OutputPlan {
  formats: Array<{
    format: DesignFormat;
    platform: DesignPlatform;
    slideCount?: number;
    durationSec?: number;
    priority: "must" | "nice_to_have";
  }>;
}

const OUTPUT_PLANS: Record<DesignContentType, OutputPlan> = {
  album_review: {
    formats: [
      { format: "card_news", platform: "instagram", slideCount: 5, priority: "must" },
      { format: "sns_image", platform: "twitter", priority: "must" },
      { format: "sns_image", platform: "instagram_story", priority: "nice_to_have" },
      { format: "sns_image", platform: "facebook", priority: "nice_to_have" },
      { format: "quote_card", platform: "instagram", priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
  artist_spotlight: {
    formats: [
      { format: "card_news", platform: "instagram", slideCount: 7, priority: "must" },
      { format: "sns_image", platform: "twitter", priority: "must" },
      { format: "sns_image", platform: "youtube_thumb", priority: "nice_to_have" },
      { format: "sns_image", platform: "facebook", priority: "nice_to_have" },
      { format: "quote_card", platform: "instagram", priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
  trending: {
    formats: [
      { format: "card_news", platform: "instagram", slideCount: 5, priority: "must" },
      { format: "sns_image", platform: "twitter", priority: "must" },
      { format: "sns_image", platform: "instagram_story", priority: "must" },
      { format: "sns_image", platform: "tiktok", priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
  data_insight: {
    formats: [
      { format: "infographic", platform: "instagram", priority: "must" },
      { format: "data_chart", platform: "twitter", priority: "must" },
      { format: "card_news", platform: "instagram", slideCount: 5, priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
  list_ranking: {
    formats: [
      { format: "card_news", platform: "instagram", slideCount: 8, priority: "must" },
      { format: "sns_image", platform: "twitter", priority: "must" },
      { format: "sns_image", platform: "facebook", priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
  general: {
    formats: [
      { format: "card_news", platform: "instagram", slideCount: 5, priority: "must" },
      { format: "sns_image", platform: "twitter", priority: "must" },
      { format: "sns_image", platform: "facebook", priority: "nice_to_have" },
      { format: "cover", platform: "blog", priority: "must" },
    ],
  },
};

// ── Skip filter ─────────────────────────────────────────

function applySkipFilter(
  outputs: DesignOutput[],
  skip?: DesignEngineInput["skip"],
): DesignOutput[] {
  if (!skip) return outputs;
  return outputs.filter((o) => {
    if (skip.cardNews && o.format === "card_news") return false;
    if (skip.snsImages && o.format === "sns_image") return false;
    if (skip.motionGraphic && o.format === "motion_graphic") return false;
    if (skip.dataViz && (o.format === "data_chart" || o.format === "infographic")) return false;
    if (skip.coverImage && o.format === "cover") return false;
    return true;
  });
}

// ── Main function ───────────────────────────────────────

export interface DesignDirectorOptions {
  model?: string;
  temperature?: number;
}

/**
 * Generate a DesignBrief from content input.
 * This is the entry point for the entire design engine pipeline.
 */
export async function generateDesignBrief(
  input: DesignEngineInput,
  opts?: DesignDirectorOptions,
): Promise<DesignBrief> {
  if (!input.content || input.content.trim().length < 10) {
    throw new Error("DesignDirector: content must be at least 10 characters");
  }
  const contentSnippet = input.content.slice(0, 3000);

  // Build trend context section for the prompt
  let trendSection = "";
  if (input.trendContext) {
    const tc = input.trendContext;
    const urgencyLevel = tc.velocity > 0.6 ? "매우 급상승" : tc.velocity > 0.3 ? "상승 중" : "안정적";
    const emphasis = tc.sourceCount >= 3 ? "높음 (다수 소스에서 언급)" : tc.sourceCount >= 2 ? "중간" : "보통";
    trendSection = `
=== TREND CONTEXT ===
Trend velocity: ${urgencyLevel} (${tc.velocity.toFixed(2)})
Source coverage: ${emphasis} (${tc.sourceCount}개 소스)
Topic type: ${tc.isExploration ? "탐색적 (실험적, 차별화된 디자인 가능)" : "검증됨 (안전한, 브랜드 일관성 우선)"}
→ ${tc.velocity > 0.5 ? "Use bolder, more urgent visual style (vibrant colors, display_impact typography)" : "Use balanced, editorial visual style"}
=== END TREND ===
`;
  }

  // Build sourced images section
  let imageSection = "";
  if (input.sourcedImageUrls && input.sourcedImageUrls.length > 0) {
    imageSection = `\nAvailable sourced images (${input.sourcedImageUrls.length} images from Unsplash/Spotify):\nThese real images are available for use in designs. Consider incorporating them into card news slides or as background elements.\n`;
  }

  // Build StyleToken section (from reference image analysis)
  let styleTokenSection = "";
  if (input.styleToken) {
    const st = input.styleToken;
    styleTokenSection = `
=== STYLE TOKEN (from reference image analysis) ===
Use this as a strong visual guide — the design should echo these characteristics.
Color palette: ${st.colors.palette.join(", ")}${st.colors.gradient ? ` (gradient: ${st.colors.gradient})` : ""}
Typography mood: ${st.typography.mood} / ${st.typography.weight} / ${st.typography.style}
Layout: density=${st.layout.density}, alignment=${st.layout.alignment}, whitespace=${st.layout.whitespace}
Effects: ${st.effects.join(", ") || "none"}
Mood keywords: ${st.moodKeywords.join(", ") || "none"}
→ IMPORTANT: colorDirection.primary should come from the palette above. typographyMood should align with "${st.typography.mood}". layoutStyle should match density/alignment.
=== END STYLE TOKEN ===
`;
  }

  // Build performance-based style hint section
  let styleHintSection = "";
  if (input.styleHint) {
    styleHintSection = `
=== PERFORMANCE-BASED STYLE RECOMMENDATION ===
${input.styleHint}
→ These styles have shown the highest engagement rates in past designs. Prefer these unless the content clearly demands a different approach.
=== END STYLE RECOMMENDATION ===
`;
  }

  const prompt = `You are a creative director for a Korean music/culture web magazine's design team.

Analyze the content below and produce a design brief that will guide visual designers, motion designers, and data visualization agents.

=== CONTENT ===
Topic: ${input.topic}
Content (first 1500 chars):
${contentSnippet}
=== END CONTENT ===
${trendSection}${styleTokenSection}${styleHintSection}${imageSection}${input.referenceImageUrl ? `\nReference image URL provided: ${input.referenceImageUrl}\n(Note: You cannot see this image directly. Infer style from the URL path/filename if possible, otherwise focus on content analysis.)\n` : ""}
Your job:
1. Classify the content type (album_review, artist_spotlight, trending, data_insight, list_ranking, general)
2. Determine the overall mood/emotion of the content (in Korean, e.g. "에너지틱하면서 세련된")
3. Extract the single most important message to convey visually (keyMessage, in Korean)
4. Create a visual concept description (in Korean, e.g. "네온 글로우 + 미니멀 타이포")
5. Choose color direction:
   - primary: a hex color that fits the mood (e.g. "#6C5CE7")
   - mood: one of [warm, cool, vibrant, muted, dark, pastel]
6. Choose layout style: one of [editorial, bold, minimal, data-driven, immersive]
7. Choose typography mood: one of [serif_classic, sans_modern, display_impact, handwritten]

Return a JSON object:
{
  "contentType": "...",
  "mood": "...",
  "keyMessage": "...",
  "visualConcept": "...",
  "colorDirection": {
    "primary": "#hex",
    "mood": "..."
  },
  "layoutStyle": "...",
  "typographyMood": "..."
}

Guidelines:
- For album reviews, lean toward the album's likely aesthetic (e.g. dark/neon for electronic, warm/organic for indie folk)
- For trending topics, use vibrant/bold styles to convey urgency
- For data insights, prefer clean/minimal layouts with data-driven style
- For artist spotlights, match the artist's known visual identity
- keyMessage should be a compelling phrase, not a summary (max 20 chars in Korean)
- visualConcept should be specific and actionable, not generic

Respond ONLY with the JSON object.`;

  const llmResult = await callGptJson(prompt, {
    caller: "design",
    model: opts?.model ?? "gpt-4o-mini",
    temperature: opts?.temperature ?? 0.7,
    maxTokens: 800,
    schema: designDirectorSchema,
  });

  // Build output plan from content type defaults
  const contentType = validateContentType(llmResult.contentType);
  const defaultPlan = OUTPUT_PLANS[contentType];
  const plannedOutputs: DesignOutput[] = defaultPlan.formats.map((f) => ({
    format: f.format,
    platform: f.platform,
    slideCount: f.slideCount,
    durationSec: f.durationSec,
    priority: f.priority,
  }));

  const filteredOutputs = applySkipFilter(plannedOutputs, input.skip);

  // Ensure at least one output remains after filtering
  if (filteredOutputs.length === 0) {
    filteredOutputs.push({
      format: "cover",
      platform: "blog",
      priority: "must",
    });
  }

  const brief: DesignBrief = {
    contentType,
    mood: llmResult.mood || "세련된",
    keyMessage: llmResult.keyMessage || input.topic,
    visualConcept: llmResult.visualConcept || "모던 미니멀",
    colorDirection: {
      primary: validateHexColor(llmResult.colorDirection?.primary) ?? "#6C5CE7",
      mood: validateColorMood(llmResult.colorDirection?.mood) ?? "vibrant",
    },
    layoutStyle: validateLayoutStyle(llmResult.layoutStyle) ?? "bold",
    typographyMood: validateTypographyMood(llmResult.typographyMood) ?? "sans_modern",
    outputs: filteredOutputs,
    styleToken: input.styleToken,
  };

  return brief;
}

// ── Validation helpers ──────────────────────────────────

const VALID_CONTENT_TYPES: DesignContentType[] = [
  "album_review", "artist_spotlight", "trending", "data_insight", "list_ranking", "general",
];

const VALID_COLOR_MOODS: ColorMood[] = ["warm", "cool", "vibrant", "muted", "dark", "pastel"];

const VALID_LAYOUT_STYLES: LayoutStyle[] = [
  "editorial", "bold", "minimal", "data-driven", "immersive",
];

const VALID_TYPOGRAPHY_MOODS: TypographyMood[] = [
  "serif_classic", "sans_modern", "display_impact", "handwritten",
];

function validateContentType(v: string): DesignContentType {
  return VALID_CONTENT_TYPES.includes(v as DesignContentType)
    ? (v as DesignContentType)
    : "general";
}

function validateColorMood(v?: string): ColorMood | undefined {
  if (!v) return undefined;
  return VALID_COLOR_MOODS.includes(v as ColorMood) ? (v as ColorMood) : undefined;
}

function validateLayoutStyle(v?: string): LayoutStyle | undefined {
  if (!v) return undefined;
  return VALID_LAYOUT_STYLES.includes(v as LayoutStyle) ? (v as LayoutStyle) : undefined;
}

function validateTypographyMood(v?: string): TypographyMood | undefined {
  if (!v) return undefined;
  return VALID_TYPOGRAPHY_MOODS.includes(v as TypographyMood) ? (v as TypographyMood) : undefined;
}

function validateHexColor(v?: string): string | undefined {
  if (!v) return undefined;
  // Accept 3-digit (#FFF) or 6-digit (#FFFFFF) hex
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    // Expand 3-digit to 6-digit: #ABC → #AABBCC
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}
