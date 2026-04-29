/**
 * Design Engine — Core type definitions.
 *
 * Shared types for all design agents (Director, Visual, Motion, Critic, etc.)
 * and the design orchestration pipeline.
 */

// ── Enums & Literals ────────────────────────────────────

export type DesignContentType =
  | "album_review"
  | "artist_spotlight"
  | "trending"
  | "data_insight"
  | "list_ranking"
  | "general";

export type DesignPlatform =
  | "instagram"
  | "instagram_story"
  | "twitter"
  | "youtube_thumb"
  | "facebook"
  | "blog"
  | "tiktok";

export type DesignFormat =
  | "card_news"
  | "sns_image"
  | "motion_graphic"
  | "infographic"
  | "cover"
  | "quote_card"
  | "data_chart";

export type LayoutStyle =
  | "editorial"
  | "bold"
  | "minimal"
  | "data-driven"
  | "immersive";

export type TypographyMood =
  | "serif_classic"
  | "sans_modern"
  | "display_impact"
  | "handwritten";

export type ColorMood =
  | "warm"
  | "cool"
  | "vibrant"
  | "muted"
  | "dark"
  | "pastel";

export type CriticVerdict = "pass" | "refine" | "regenerate";

// ── Platform dimensions ─────────────────────────────────

export const PLATFORM_SIZES: Record<DesignPlatform, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  twitter: { width: 1200, height: 675 },
  youtube_thumb: { width: 1280, height: 720 },
  facebook: { width: 1200, height: 630 },
  blog: { width: 1200, height: 630 },
  tiktok: { width: 1080, height: 1920 },
};

// ── StyleToken ──────────────────────────────────────────

/** Extracted from a reference image (album art, moodboard, etc.) by Style Transfer Agent. */
export interface StyleToken {
  id: string;
  name: string;
  sourceImageUrl?: string;

  colors: {
    palette: string[];       // hex values
    ratios: number[];        // usage ratios (sum to 1)
    gradient?: string;       // CSS gradient expression
  };

  typography: {
    mood: TypographyMood;
    weight: "light" | "regular" | "bold" | "black";
    style: "serif" | "sans" | "display" | "mono";
  };

  layout: {
    density: "sparse" | "balanced" | "dense";
    alignment: "center" | "left" | "asymmetric";
    whitespace: "generous" | "moderate" | "tight";
  };

  effects: string[];         // e.g. ["gradient", "blur_bg", "neon_glow"]
  moodKeywords: string[];    // e.g. ["futuristic", "minimal", "energetic"]
}

// ── DesignBrief ─────────────────────────────────────────

/** Single output item planned by the Design Director. */
export interface DesignOutput {
  format: DesignFormat;
  platform: DesignPlatform;
  slideCount?: number;       // for card_news / carousel
  durationSec?: number;      // for motion_graphic
  priority: "must" | "nice_to_have";
}

/** Produced by the Design Director Agent — consumed by all downstream agents. */
export interface DesignBrief {
  contentType: DesignContentType;
  mood: string;              // e.g. "에너지틱하면서 세련된"
  keyMessage: string;        // core message to convey

  visualConcept: string;     // e.g. "네온 글로우 + 미니멀"
  colorDirection: {
    primary: string;         // hex or semantic ("앨범 커버에서 추출")
    mood: ColorMood;
  };
  layoutStyle: LayoutStyle;
  typographyMood: TypographyMood;

  styleToken?: StyleToken;   // if reference image was provided

  outputs: DesignOutput[];
}

// ── Design Critic ───────────────────────────────────────

/** Score on a single evaluation dimension (1-10). */
export interface CriticDimensionScore {
  dimension: string;
  score: number;             // 1-10
  feedback: string;
}

/** Result from the Design Critic Agent. */
export interface DesignCriticResult {
  scores: CriticDimensionScore[];
  averageScore: number;
  verdict: CriticVerdict;
  refinementInstructions?: string;
}

// ── Edit Interpreter ────────────────────────────────────

export interface DesignEditAction {
  target: string;            // e.g. "background", "title", "slide_3"
  property: string;          // e.g. "color", "fontSize", "layout"
  action: string;            // e.g. "darken", "increase", "change"
  value?: string | number;   // e.g. "#1a1a2e", 1.2
}

export interface DesignEditRequest {
  naturalLanguage: string;
  actions: DesignEditAction[];
}

// ── Visual Designer output ──────────────────────────────

/** A single rendered slide (card news, SNS image, etc.) */
export interface FigmaTemplateSpec {
  templateId: string;
  texts: Record<string, string>;
  images: Record<string, string>;
  colors: Record<string, string>;
}

export interface SlideDesign {
  index: number;
  jsxCode: string;           // Satori-compatible JSX (stringified)
  width: number;
  height: number;
  platform: DesignPlatform;

  // Figma SVG template (preferred over jsxCode when present)
  figmaTemplate?: FigmaTemplateSpec;

  // Edit support metadata (preserved for refinement loop)
  templateId?: string;                    // template path only
  renderSpec?: Record<string, unknown>;   // template render spec for re-rendering
}

/** Output from Visual Designer Agent. */
export interface VisualDesignResult {
  slides: SlideDesign[];
  format: DesignFormat;
  designPath: "template" | "generated";  // Path A or B
}

// ── Motion Designer output ──────────────────────────────

export interface MotionDesignResult {
  compositionId: string;     // Remotion composition ID (e.g. "TextReveal", "ChartAnimation")
  props: Record<string, unknown>;  // Composition props matching the Zod schema
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  generationTimeMs: number;
}

// ── Data Viz output ─────────────────────────────────────

export type ChartType = "bar" | "line" | "area" | "donut" | "radar" | "scatter" | "treemap";

export interface DataVizResult {
  chartType: ChartType;
  chartConfig: Record<string, unknown>;   // Chart.js config object
  narrativeOverlay: string;               // key insight text
  width: number;
  height: number;
}

// ── Benchmark Report (for external-reference-based evaluation) ──

/** Aggregated benchmark data from past quality + style performance stores. */
export interface BenchmarkReport {
  /** Historical average scores by dimension (from quality-store) */
  historicalBaseline: {
    averageScore: number;
    passRate: number;
    byDimension: Record<string, number>; // dimension → avg score
  };
  /** Top performing style attributes (from style-performance) */
  topPerformingStyles: Array<{
    attribute: string;    // e.g. "colorMood", "layoutStyle"
    value: string;        // e.g. "vibrant", "bold"
    engagementRate: number;
    comparedToAvg: number; // percentage above/below average
    sampleSize: number;
  }>;
  /** Platform-specific best practices */
  platformNorms: {
    platform: string;
    avgScore: number;
    topTemplates: string[];
    bestColorMood?: string;
    bestLayoutStyle?: string;
  };
  /** Sample size for confidence indicator */
  totalSamples: number;
  confidence: "high" | "medium" | "low";
}

// ── Quality log (for DB persistence) ────────────────────

export interface DesignQualityRecord {
  designId: string;
  /** Workspace owning this record. Optional for legacy single-tenant callers; resolved to default workspace when omitted. */
  workspaceId?: string;
  contentType: DesignContentType;
  format: DesignFormat;
  platform: DesignPlatform;
  scores: CriticDimensionScore[];
  averageScore: number;
  verdict: CriticVerdict;
  iterationCount: number;
  designPath: "template" | "generated" | "motion" | "data_viz";
  generationTimeMs: number;
  costUsd?: number;
}

// ── Orchestrator ────────────────────────────────────────

export interface DesignEngineInput {
  topic: string;
  content: string;                  // approved article text
  researchPacket?: unknown;         // ResearchPacket from pipeline
  referenceImageUrl?: string;       // optional album art / moodboard
  persona?: unknown;                // WritingPersona for voice consistency
  /** StyleToken extracted from reference image — influences Director's color/layout/typography choices */
  styleToken?: StyleToken;
  /** Sourced images from Unsplash/Spotify to use in designs */
  sourcedImageUrls?: string[];
  /** Trend context for visual emphasis (e.g. trending topics get bolder styles) */
  trendContext?: {
    velocity: number;               // 0-1, how fast this topic is rising
    sourceCount: number;            // how many trend sources mentioned this
    isExploration: boolean;         // exploration vs exploitation topic
  };
  /** Performance-based style recommendation hint for the Design Director LLM */
  styleHint?: string;
  /** Niche/domain context injected into the design director prompt (e.g. "한국 음악 매거진"). */
  nicheHints?: string;
  skip?: {
    cardNews?: boolean;
    motionGraphic?: boolean;
    snsImages?: boolean;
    dataViz?: boolean;
    coverImage?: boolean;
  };
}

export interface DesignEngineOutput {
  brief: DesignBrief;
  cardNews?: {
    slides: SlideDesign[];
    renderedPngs: string[];         // URLs or base64
  };
  motionGraphic?: {
    result: MotionDesignResult;
    videoUrl?: string;              // after rendering
  };
  snsImages?: {
    slides: SlideDesign[];
    renderedPngs: string[];
  };
  dataViz?: DataVizResult;
  coverImage?: {
    imageUrl: string;
    dallePrompt: string;
  };
  quality: DesignQualityRecord[];
}
