/**
 * Visual Designer Agent — generates static images (card news, SNS images).
 *
 * Two paths:
 *   Path A (Template): Matches DesignBrief to existing templates, fills data slots,
 *                      and uses LLM to fine-tune colors/fonts. Reliable.
 *   Path B (Generated): LLM generates Satori-compatible inline-style HTML directly.
 *                       More creative, but requires Satori CSS constraint awareness.
 *
 * Both paths output SlideDesign[] that can be rendered to PNG via Satori + Resvg.
 */

import { callGptJson, callGptSafe } from "@/lib/llm";
import type {
  DesignBrief,
  DesignFormat,
  DesignPlatform,
  FigmaTemplateSpec,
  SlideDesign,
  VisualDesignResult,
} from "./types";
import { PLATFORM_SIZES } from "./types";
import { DEFAULT_BRAND_KIT, getBrandFontStack, pickGradient } from "./brand-kit";
import type { BrandKit } from "./brand-kit";
import { SATORI_SUPPORTED_CSS, SATORI_UNSUPPORTED_CSS } from "./fonts";
import { sanitizeForSatori } from "./satori-sanitizer";

// Figma SVG template check — lazy import to avoid circular deps
let _figmaTemplateExists: ((id: string) => boolean) | null = null;
async function checkFigmaTemplate(templateId: string): Promise<boolean> {
  if (!_figmaTemplateExists) {
    try {
      const mod = await import("@agents/shared/figmaSvgRenderer");
      _figmaTemplateExists = mod.figmaTemplateExists;
    } catch {
      _figmaTemplateExists = () => false;
    }
  }
  return _figmaTemplateExists(templateId);
}

// Template renderer — resolves templateId + renderSpec → HTML string
// Uses dynamic import to avoid circular dependency with agents/ package
async function resolveTemplateToHtml(templateId: string, renderSpec: Record<string, unknown>): Promise<string> {
  // Import from agents/shared/templates at runtime
  // In Next.js this resolves via the @agents/* path alias in tsconfig
  const { renderSlideHtml } = await import("@agents/shared/templates/index");
  return renderSlideHtml(templateId as Parameters<typeof renderSlideHtml>[0], renderSpec as unknown as Parameters<typeof renderSlideHtml>[1]);
}

// ── Template path helpers ───────────────────────────────

/** Content-type → recommended template sequence for card news */
const CARD_NEWS_SEQUENCES: Record<string, string[]> = {
  album_review: [
    "cover.hero.v1", "body.fact.v1", "body.quote.v1", "body.highlight.v1", "end.cta.v1",
  ],
  artist_spotlight: [
    "cover.hero.v2", "body.fact.v2", "body.stat.v1", "body.quote.v1",
    "body.fact.v3", "body.highlight.v1", "end.cta.v1",
  ],
  trending: [
    "cover.hero.v1", "body.list.v1", "body.fact.v1", "body.stat.v1", "end.outro.v1",
  ],
  data_insight: [
    "cover.minimal.v1", "body.stat.v1", "body.fact.v4", "body.highlight.v1", "end.outro.v1",
  ],
  list_ranking: [
    "cover.hero.v1", "body.ranking.v1", "body.ranking.v1", "body.ranking.v1",
    "body.ranking.v1", "body.ranking.v1", "body.fact.v1", "end.cta.v1",
  ],
  general: [
    "cover.hero.v1", "body.fact.v1", "body.fact.v2", "body.highlight.v1", "end.outro.v1",
  ],
};

/** Photo-first sequences — full-bleed image cover for magazine-style output */
const PHOTO_FIRST_SEQUENCES: Record<string, string[]> = {
  album_review: [
    "cover.photo.v1", "body.fact.v1", "body.quote.v1", "body.highlight.v1", "end.cta.v1",
  ],
  artist_spotlight: [
    "cover.photo.v1", "body.fact.v2", "body.stat.v1", "body.quote.v1", "end.cta.v1",
  ],
  trending: [
    "cover.photo.v1", "body.list.v1", "body.fact.v1", "body.stat.v1", "end.outro.v1",
  ],
  general: [
    "cover.photo.v1", "body.fact.v1", "body.fact.v2", "body.highlight.v1", "end.outro.v1",
  ],
};

/** SNS format → template mapping */
const SNS_TEMPLATE_MAP: Record<DesignPlatform, string> = {
  instagram: "sns.square.v1",
  instagram_story: "sns.story.v1",
  twitter: "sns.twitter.v1",
  youtube_thumb: "sns.youtube.v1",
  facebook: "sns.twitter.v1",     // same aspect ratio
  blog: "sns.twitter.v1",
  tiktok: "sns.story.v1",
};

// ── Path A: Template-based ──────────────────────────────

export interface TemplatePathInput {
  brief: DesignBrief;
  contentSlides: Array<{
    title: string;
    body: string;
    footer?: string;
  }>;
  brandKit?: BrandKit;
  /** Sourced image URLs (Unsplash/Spotify) to use as slide backgrounds */
  sourcedImageUrls?: string[];
}

/**
 * Path A: Generate card news or SNS images using templates.
 * LLM decides style overrides (colors, fonts) based on the DesignBrief.
 */
export async function designWithTemplate(
  input: TemplatePathInput,
  format: DesignFormat,
  platform: DesignPlatform,
  opts?: { model?: string },
): Promise<VisualDesignResult> {
  const kit = input.brandKit ?? DEFAULT_BRAND_KIT;
  const { width, height } = PLATFORM_SIZES[platform];

  // LLM generates style overrides based on the brief
  const styleOverrides = await generateStyleOverrides(input.brief, kit, opts);

  if (format === "sns_image" || format === "quote_card") {
    return designSnsWithTemplate(input, platform, kit, styleOverrides);
  }

  // Card news: use template sequence
  // Prefer photo-first sequence when sourced images are available
  const hasImages = (input.sourcedImageUrls?.length ?? 0) > 0;
  const photoSeq = PHOTO_FIRST_SEQUENCES[input.brief.contentType];
  const defaultSeq = CARD_NEWS_SEQUENCES[input.brief.contentType] ?? CARD_NEWS_SEQUENCES.general!;
  const sequence = (hasImages && photoSeq) ? photoSeq : defaultSeq;
  const slideCount = input.brief.outputs.find((o) => o.format === format)?.slideCount
    ?? input.contentSlides.length;

  const slides: SlideDesign[] = [];
  for (let i = 0; i < Math.min(slideCount, input.contentSlides.length); i++) {
    const templateId = sequence![i % sequence!.length]!;
    const content = input.contentSlides[i]!;

    // Pick sourced image for this slide (cycle through available images)
    const bgImageUrl = input.sourcedImageUrls?.length
      ? input.sourcedImageUrls[i % input.sourcedImageUrls.length]
      : undefined;

    // Build template render spec with style overrides
    const renderSpec = {
      title: content.title,
      bodyText: content.body,
      footerText: content.footer ?? "Web Magazine",
      slideIndex: i,
      fontFamily: getBrandFontStack(kit),
      bgGradient: styleOverrides.bgGradient,
      bgImageUrl,
      textColor: styleOverrides.textColor,
      accentColor: styleOverrides.accentColor,
      canvasWidth: width,
      canvasHeight: height,
    };

    // Prefer Figma SVG template when available, fall back to Satori HTML
    const hasFigma = await checkFigmaTemplate(templateId);
    let figmaTemplate: FigmaTemplateSpec | undefined;
    let html = "";

    if (hasFigma) {
      figmaTemplate = {
        templateId,
        texts: {
          title: content.title,
          body: content.body,
          footer: content.footer ?? "Web Magazine",
        },
        images: bgImageUrl ? { "hero-image": bgImageUrl } : {},
        colors: styleOverrides.accentColor ? { "accent-color": styleOverrides.accentColor } : {},
      };
    } else {
      html = await resolveTemplateToHtml(templateId, renderSpec);
    }

    slides.push({
      index: i,
      jsxCode: html,
      width,
      height,
      platform,
      figmaTemplate,
      templateId,
      renderSpec: { ...renderSpec },
    });
  }

  return { slides, format, designPath: "template" };
}

async function designSnsWithTemplate(
  input: TemplatePathInput,
  platform: DesignPlatform,
  kit: BrandKit,
  styleOverrides?: StyleOverrides,
): Promise<VisualDesignResult> {
  const { width, height } = PLATFORM_SIZES[platform];
  const templateId = SNS_TEMPLATE_MAP[platform];
  const content = input.contentSlides[0] ?? {
    title: input.brief.keyMessage,
    body: input.brief.visualConcept,
    footer: "Web Magazine",
  };

  const renderSpec = {
    title: content.title,
    bodyText: content.body,
    footerText: content.footer ?? "Web Magazine",
    slideIndex: 0,
    fontFamily: getBrandFontStack(kit),
    bgGradient: styleOverrides?.bgGradient ?? pickGradient(kit, 0),
    textColor: styleOverrides?.textColor ?? kit.colors.text.onDark,
    accentColor: styleOverrides?.accentColor ?? kit.colors.accent,
    canvasWidth: width,
    canvasHeight: height,
  };

  const hasFigma = await checkFigmaTemplate(templateId);
  let figmaTemplate: FigmaTemplateSpec | undefined;
  let html = "";

  if (hasFigma) {
    const bgImageUrl = input.sourcedImageUrls?.[0];
    figmaTemplate = {
      templateId,
      texts: {
        title: content.title,
        body: content.body,
        footer: content.footer ?? "Web Magazine",
      },
      images: bgImageUrl ? { "hero-image": bgImageUrl } : {},
      colors: styleOverrides?.accentColor ? { "accent-color": styleOverrides.accentColor } : {},
    };
  } else {
    html = await resolveTemplateToHtml(templateId, renderSpec);
  }

  return {
    slides: [{
      index: 0,
      jsxCode: html,
      width,
      height,
      platform,
      figmaTemplate,
      templateId,
      renderSpec: { ...renderSpec },
    }],
    format: "sns_image",
    designPath: "template",
  };
}

// ── Style override generation ───────────────────────────

interface StyleOverrides {
  bgGradient: string;
  textColor: string;
  accentColor: string;
  footerColor: string;
}

async function generateStyleOverrides(
  brief: DesignBrief,
  kit: BrandKit,
  opts?: { model?: string },
): Promise<StyleOverrides> {
  const prompt = `You are a visual designer for a Korean music/culture web magazine.

Given this design brief, choose the best color scheme for the slides.

Brief:
- Content type: ${brief.contentType}
- Mood: ${brief.mood}
- Visual concept: ${brief.visualConcept}
- Color direction: ${brief.colorDirection.primary} (${brief.colorDirection.mood})
- Layout: ${brief.layoutStyle}

Brand Kit available colors:
- Primary: ${kit.colors.primary}
- Secondary: ${kit.colors.secondary}
- Accent: ${kit.colors.accent}
- Gradients: ${kit.colors.gradients.map((g, i) => `[${i}] ${g}`).join("; ")}

Return a JSON object with CSS values:
{
  "bgGradient": "linear-gradient(...) or solid color",
  "textColor": "#hex for main text",
  "accentColor": "#hex for accent elements",
  "footerColor": "rgba(...) for footer text"
}

Match the mood and color direction from the brief. Use brand kit colors as base but adjust for the specific mood.
Respond ONLY with the JSON object.`;

  try {
    return await callGptJson<StyleOverrides>(prompt, {
      caller: "design",
      model: opts?.model ?? "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 300,
    });
  } catch {
    // Fallback to brand kit defaults
    return {
      bgGradient: pickGradient(kit, 0),
      textColor: kit.colors.text.onDark,
      accentColor: kit.colors.accent,
      footerColor: "rgba(255,255,255,0.5)",
    };
  }
}

// ── Path B: LLM-generated HTML ──────────────────────────

export interface GeneratedPathInput {
  brief: DesignBrief;
  slideContents: Array<{
    slideNumber: number;
    title: string;
    body: string;
    role: "cover" | "body" | "outro";
  }>;
  brandKit?: BrandKit;
}

/**
 * Path B: LLM generates Satori-compatible inline-style HTML directly.
 * More creative but requires careful prompting for Satori constraints.
 */
export async function designWithLLM(
  input: GeneratedPathInput,
  platform: DesignPlatform,
  opts?: { model?: string; temperature?: number },
): Promise<VisualDesignResult> {
  const kit = input.brandKit ?? DEFAULT_BRAND_KIT;
  const { width, height } = PLATFORM_SIZES[platform];
  const format: DesignFormat = input.slideContents.length > 1 ? "card_news" : "sns_image";

  const slides: SlideDesign[] = [];

  for (const content of input.slideContents) {
    const html = await generateSlideHtml(
      input.brief, content, kit, width, height, opts,
    );
    slides.push({
      index: content.slideNumber,
      jsxCode: html,
      width,
      height,
      platform,
    });
  }

  return { slides, format, designPath: "generated" };
}

async function generateSlideHtml(
  brief: DesignBrief,
  content: { slideNumber: number; title: string; body: string; role: string },
  kit: BrandKit,
  width: number,
  height: number,
  opts?: { model?: string; temperature?: number },
): Promise<string> {
  const prompt = `You are an expert visual designer generating Satori-compatible HTML for a Korean music/culture web magazine.

Generate a single slide as inline-style HTML. The HTML will be rendered by Satori (Vercel) to a PNG image.

=== DESIGN BRIEF ===
Content type: ${brief.contentType}
Mood: ${brief.mood}
Key message: ${brief.keyMessage}
Visual concept: ${brief.visualConcept}
Color: ${brief.colorDirection.primary} (${brief.colorDirection.mood})
Layout: ${brief.layoutStyle}
Typography: ${brief.typographyMood}

=== SLIDE CONTENT ===
Slide ${content.slideNumber + 1} (${content.role})
Title: ${content.title}
Body: ${content.body}

=== CANVAS ===
Width: ${width}px, Height: ${height}px

=== BRAND KIT ===
Font: "${kit.typography.heading.fontFamily}", fallback "Apple SD Gothic Neo", sans-serif
Colors: primary=${kit.colors.primary}, accent=${kit.colors.accent}, bg_dark=${kit.colors.background.dark}
Safe margin: ${kit.layout.safeMargin}px
Corner radius: ${kit.layout.cornerRadius}px

=== SATORI CONSTRAINTS (CRITICAL) ===
Satori uses Yoga (Flexbox only). You MUST follow these rules:

REQUIRED:
- Every element MUST have display:flex
- Use flexDirection, alignItems, justifyContent for layout
- Use inline styles only (style="...")
- Use px values for sizes (not rem/em)
- Root div must have exact width:${width}px;height:${height}px
- Font family must include quotes: font-family:"Pretendard","Apple SD Gothic Neo",sans-serif

SUPPORTED CSS: ${SATORI_SUPPORTED_CSS.join(", ")}

FORBIDDEN (will crash):
${SATORI_UNSUPPORTED_CSS.join(", ")}
- No CSS Grid, no float, no filter, no backdropFilter
- No transform, no animation, no transition
- No class names, no <style> tags
- No <br>, <hr>, or other non-container elements — use margin/padding for spacing
- <img> MUST have explicit width and height in px
- No self-closing tags except <img />

=== OUTPUT FORMAT ===
Return ONLY the raw HTML string. No markdown fences, no explanation.
Start with <div style="display:flex; and end with </div>.

Make it visually compelling — use the mood and visual concept to guide creative decisions.
Korean text should be natural and grammatically correct.`;

  // Use callGptSafe (not callGptJson) since we expect raw HTML, not JSON
  const raw = await callGptSafe(prompt, {
    caller: "design",
    model: opts?.model ?? "gpt-4o-mini",
    temperature: opts?.temperature ?? 0.8,
    maxTokens: 2000,
  });

  // Strip markdown fences if the LLM wraps the HTML
  const cleaned = raw.replace(/```html?\n?/g, "").replace(/```/g, "").trim();

  // Sanitize for Satori compatibility (strip unsupported CSS, fix tags)
  return sanitizeForSatori(cleaned);
}

// ── Unified entry point ─────────────────────────────────

export interface VisualDesignInput {
  brief: DesignBrief;
  contentSlides: Array<{
    title: string;
    body: string;
    footer?: string;
    role?: "cover" | "body" | "outro";
  }>;
  brandKit?: BrandKit;
  preferGenerated?: boolean;
  /** Sourced image URLs (Unsplash/Spotify) to use as slide backgrounds */
  sourcedImageUrls?: string[];
}

/**
 * Unified Visual Designer — auto-selects Path A or B based on content type.
 *
 * - Template path (A): used for standard content types with established layouts
 * - Generated path (B): used when preferGenerated=true or for complex layouts
 */
export async function generateVisualDesign(
  input: VisualDesignInput,
  format: DesignFormat,
  platform: DesignPlatform,
  opts?: { model?: string; temperature?: number },
): Promise<VisualDesignResult> {
  if (input.preferGenerated) {
    return designWithLLM(
      {
        brief: input.brief,
        slideContents: input.contentSlides.map((s, i) => ({
          slideNumber: i,
          title: s.title,
          body: s.body,
          role: s.role ?? (i === 0 ? "cover" : i === input.contentSlides.length - 1 ? "outro" : "body"),
          bgImageUrl: input.sourcedImageUrls?.length
            ? input.sourcedImageUrls[i % input.sourcedImageUrls.length]
            : undefined,
        })),
        brandKit: input.brandKit,
      },
      platform,
      opts,
    );
  }

  return designWithTemplate(
    {
      brief: input.brief,
      contentSlides: input.contentSlides,
      brandKit: input.brandKit,
      sourcedImageUrls: input.sourcedImageUrls,
    },
    format,
    platform,
    opts,
  );
}
