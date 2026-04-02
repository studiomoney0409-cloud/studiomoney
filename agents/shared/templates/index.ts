/**
 * Shared template dispatcher — single entry point for slide HTML generation.
 */
import type { TemplateId, TemplateConfig, SlideRenderSpec, SlideKind } from "./types";
import { renderCoverV1, renderCoverV2, renderCoverPhotoV1, COVER_V1_CONFIG, COVER_V2_CONFIG, COVER_PHOTO_V1_CONFIG } from "./cover";
import { renderFactV1, renderFactV2, renderFactV3, renderFactV4, FACT_V1_CONFIG, FACT_V2_CONFIG, FACT_V3_CONFIG, FACT_V4_CONFIG } from "./fact";
import { renderOutroV1, OUTRO_V1_CONFIG } from "./outro";
import {
  renderCoverMinimalV1, renderQuoteV1, renderStatV1, renderListV1,
  renderRankingV1, renderHighlightV1, renderCtaV1,
  COVER_MINIMAL_V1_CONFIG, QUOTE_V1_CONFIG, STAT_V1_CONFIG, LIST_V1_CONFIG,
  RANKING_V1_CONFIG, HIGHLIGHT_V1_CONFIG, CTA_V1_CONFIG,
} from "./cardnews-extra";
import {
  renderSnsSquareV1, renderSnsStoryV1, renderSnsTwitterV1,
  renderSnsYoutubeV1, renderSnsQuoteV1,
  SNS_SQUARE_V1_CONFIG, SNS_STORY_V1_CONFIG, SNS_TWITTER_V1_CONFIG,
  SNS_YOUTUBE_V1_CONFIG, SNS_QUOTE_V1_CONFIG,
} from "./sns";
import {
  renderInfographicBarV1, renderInfographicDonutV1,
  renderInfographicComparisonV1, renderInfographicTimelineV1,
  INFOGRAPHIC_BAR_V1_CONFIG, INFOGRAPHIC_DONUT_V1_CONFIG,
  INFOGRAPHIC_COMPARISON_V1_CONFIG, INFOGRAPHIC_TIMELINE_V1_CONFIG,
} from "./infographic";

// Re-export types
export type { TemplateId, TemplateConfig, SlideRenderSpec, SlideKind };

// ── Template registry ────────────────────────────────────

export const TEMPLATES: Record<TemplateId, TemplateConfig> = {
  // Original cardnews
  "cover.hero.v1": COVER_V1_CONFIG,
  "cover.hero.v2": COVER_V2_CONFIG,
  "body.fact.v1": FACT_V1_CONFIG,
  "body.fact.v2": FACT_V2_CONFIG,
  "body.fact.v3": FACT_V3_CONFIG,
  "body.fact.v4": FACT_V4_CONFIG,
  "end.outro.v1": OUTRO_V1_CONFIG,
  // Photo-first
  "cover.photo.v1": COVER_PHOTO_V1_CONFIG,
  // Extended cardnews
  "cover.minimal.v1": COVER_MINIMAL_V1_CONFIG,
  "body.quote.v1": QUOTE_V1_CONFIG,
  "body.stat.v1": STAT_V1_CONFIG,
  "body.list.v1": LIST_V1_CONFIG,
  "body.ranking.v1": RANKING_V1_CONFIG,
  "body.highlight.v1": HIGHLIGHT_V1_CONFIG,
  "end.cta.v1": CTA_V1_CONFIG,
  // SNS
  "sns.square.v1": SNS_SQUARE_V1_CONFIG,
  "sns.story.v1": SNS_STORY_V1_CONFIG,
  "sns.twitter.v1": SNS_TWITTER_V1_CONFIG,
  "sns.youtube.v1": SNS_YOUTUBE_V1_CONFIG,
  "sns.quote.v1": SNS_QUOTE_V1_CONFIG,
  // Infographic
  "infographic.bar.v1": INFOGRAPHIC_BAR_V1_CONFIG,
  "infographic.donut.v1": INFOGRAPHIC_DONUT_V1_CONFIG,
  "infographic.comparison.v1": INFOGRAPHIC_COMPARISON_V1_CONFIG,
  "infographic.timeline.v1": INFOGRAPHIC_TIMELINE_V1_CONFIG,
};

export const TEMPLATES_BY_KIND: Record<SlideKind, TemplateId[]> = {
  cover: ["cover.hero.v1", "cover.hero.v2", "cover.minimal.v1", "cover.photo.v1"],
  fact: ["body.fact.v1", "body.fact.v2", "body.fact.v3", "body.fact.v4", "body.highlight.v1"],
  quote: ["body.quote.v1"],
  stat: ["body.stat.v1"],
  list: ["body.list.v1"],
  ranking: ["body.ranking.v1"],
  cta: ["end.outro.v1", "end.cta.v1"],
  sns: ["sns.square.v1", "sns.story.v1", "sns.twitter.v1", "sns.youtube.v1", "sns.quote.v1"],
  infographic: ["infographic.bar.v1", "infographic.donut.v1", "infographic.comparison.v1", "infographic.timeline.v1"],
};

// ── Dispatcher ───────────────────────────────────────────

/**
 * Render a single slide to Satori-compatible inline-style HTML.
 * Returns an HTML string (no <html>/<body> wrapper — just the root <div>).
 */
export function renderSlideHtml(
  templateId: TemplateId,
  input: SlideRenderSpec,
): string {
  switch (templateId) {
    // Original cardnews
    case "cover.hero.v1": return renderCoverV1(input);
    case "cover.hero.v2": return renderCoverV2(input);
    case "cover.photo.v1": return renderCoverPhotoV1(input);
    case "body.fact.v1": return renderFactV1(input);
    case "body.fact.v2": return renderFactV2(input);
    case "body.fact.v3": return renderFactV3(input);
    case "body.fact.v4": return renderFactV4(input);
    case "end.outro.v1": return renderOutroV1(input);
    // Extended cardnews
    case "cover.minimal.v1": return renderCoverMinimalV1(input);
    case "body.quote.v1": return renderQuoteV1(input);
    case "body.stat.v1": return renderStatV1(input);
    case "body.list.v1": return renderListV1(input);
    case "body.ranking.v1": return renderRankingV1(input);
    case "body.highlight.v1": return renderHighlightV1(input);
    case "end.cta.v1": return renderCtaV1(input);
    // SNS
    case "sns.square.v1": return renderSnsSquareV1(input);
    case "sns.story.v1": return renderSnsStoryV1(input);
    case "sns.twitter.v1": return renderSnsTwitterV1(input);
    case "sns.youtube.v1": return renderSnsYoutubeV1(input);
    case "sns.quote.v1": return renderSnsQuoteV1(input);
    // Infographic
    case "infographic.bar.v1": return renderInfographicBarV1(input);
    case "infographic.donut.v1": return renderInfographicDonutV1(input);
    case "infographic.comparison.v1": return renderInfographicComparisonV1(input);
    case "infographic.timeline.v1": return renderInfographicTimelineV1(input);
    default: {
      throw new Error(`Unknown template: ${String(templateId)}`);
    }
  }
}
