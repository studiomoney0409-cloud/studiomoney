/**
 * Shared template types — unified input model for slide HTML generation.
 */

// ── Slide kinds ──────────────────────────────────────────
export type SlideKind = "cover" | "fact" | "cta" | "quote" | "stat" | "list" | "ranking" | "sns" | "infographic";

// ── Template IDs ─────────────────────────────────────────
export type TemplateId =
  | "cover.hero.v1"
  | "cover.hero.v2"
  | "cover.minimal.v1"
  | "cover.photo.v1"
  | "body.fact.v1"
  | "body.fact.v2"
  | "body.fact.v3"
  | "body.fact.v4"
  | "body.quote.v1"
  | "body.stat.v1"
  | "body.list.v1"
  | "body.ranking.v1"
  | "body.highlight.v1"
  | "end.outro.v1"
  | "end.cta.v1"
  | "sns.square.v1"
  | "sns.story.v1"
  | "sns.twitter.v1"
  | "sns.youtube.v1"
  | "sns.quote.v1"
  // Infographic
  | "infographic.bar.v1"
  | "infographic.donut.v1"
  | "infographic.comparison.v1"
  | "infographic.timeline.v1";

// ── Template metadata ────────────────────────────────────
export interface TemplateConfig {
  id: TemplateId;
  kind: SlideKind;
  label: string;
  description: string;
  defaultBg: string;
  defaults: {
    titleSizePx: number;
    bodySizePx: number;
    footerSizePx: number;
    titleWeight: number;
    bodyWeight: number;
  };
}

// ── Unified render input ─────────────────────────────────
export interface SlideRenderSpec {
  // Content
  title: string;
  bodyText: string;
  footerText: string;
  heroImageDataUri?: string;
  slideIndex: number;

  // Style overrides
  fontFamily?: string;
  bgGradient?: string;
  textColor?: string;
  accentColor?: string;
  footerColor?: string;
  titleSizePx?: number;
  bodySizePx?: number;
  headlineSizePx?: number;
  titleWeight?: number;
  bodyWeight?: number;
  letterSpacing?: "tight" | "normal" | "wide";
  scrimOpacity?: number;
  imageBrightness?: number;
  cardRadius?: number;

  // Agent-specific (optional)
  cssOverrideBlock?: string;

  // Canvas dimensions (default 1080×1350)
  canvasWidth?: number;
  canvasHeight?: number;
}
