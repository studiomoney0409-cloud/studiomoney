/**
 * Brand Kit — visual identity system for all design engine outputs.
 *
 * Single source of truth for colors, typography, logos, and layout rules.
 * All design agents reference this to maintain brand consistency.
 */

/**
 * FontMood type — mirrors agents/shared/fonts.ts.
 * Re-declared here to avoid cross-package import issues in Studio builds.
 */
export type FontMood =
  | "bold-display"
  | "clean-sans"
  | "editorial"
  | "playful"
  | "minimal"
  | "impact";

// ── Brand Kit interface ─────────────────────────────────

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: {
    dark: string;
    light: string;
  };
  text: {
    primary: string;
    secondary: string;
    onDark: string;
    onLight: string;
  };
  gradients: string[];        // CSS gradient presets
}

export interface BrandTypography {
  heading: {
    fontFamily: string;
    weights: number[];
    fontMood: FontMood;
  };
  body: {
    fontFamily: string;
    weights: number[];
    fontMood: FontMood;
  };
  accent: {
    fontFamily: string;
    weights: number[];
    fontMood: FontMood;
  };
  sizes: {
    hero: number;             // px
    title: number;
    subtitle: number;
    body: number;
    caption: number;
    label: number;
  };
}

export interface BrandAssets {
  logoUrl?: string;
  logoSmallUrl?: string;
  watermarkUrl?: string;
}

export interface BrandLayout {
  safeMargin: number;         // px — minimum padding from edge
  cornerRadius: number;       // px — default border radius
  maxTextPerSlide: number;    // characters
  maxTitleLength: number;     // characters
  slideGap: number;           // px — gap between elements
}

export interface BrandKit {
  name: string;
  colors: BrandColors;
  typography: BrandTypography;
  assets: BrandAssets;
  layout: BrandLayout;
}

// ── Default Brand Kit ───────────────────────────────────

export const DEFAULT_BRAND_KIT: BrandKit = {
  name: "Web Magazine Default",

  colors: {
    primary: "#6C5CE7",       // vibrant purple
    secondary: "#2D3436",     // charcoal
    accent: "#E17055",        // warm coral
    background: {
      dark: "#1A1A2E",
      light: "#F8F9FA",
    },
    text: {
      primary: "#2D3436",
      secondary: "#636E72",
      onDark: "#FFFFFF",
      onLight: "#2D3436",
    },
    gradients: [
      "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)",           // deep dark
      "linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)",           // purple glow
      "linear-gradient(135deg, #2D3436 0%, #636E72 100%)",           // charcoal
      "linear-gradient(135deg, #E17055 0%, #FDCB6E 100%)",           // warm sunset
      "linear-gradient(180deg, #0F0F1A 0%, #1A1A2E 50%, #2D1B69 100%)", // concert night
    ],
  },

  typography: {
    heading: {
      fontFamily: "Pretendard",
      weights: [700, 800, 900],
      fontMood: "bold-display",
    },
    body: {
      fontFamily: "Pretendard",
      weights: [400, 500, 600],
      fontMood: "clean-sans",
    },
    accent: {
      fontFamily: "Pretendard",
      weights: [600, 700],
      fontMood: "minimal",
    },
    sizes: {
      hero: 64,
      title: 48,
      subtitle: 32,
      body: 18,
      caption: 14,
      label: 12,
    },
  },

  assets: {
    logoUrl: undefined,
    logoSmallUrl: undefined,
    watermarkUrl: undefined,
  },

  layout: {
    safeMargin: 60,
    cornerRadius: 16,
    maxTextPerSlide: 80,
    maxTitleLength: 22,
    slideGap: 24,
  },
};

// ── Utility functions ───────────────────────────────────

/**
 * Get a CSS-ready font stack string from the brand kit.
 */
export function getBrandFontStack(
  kit: BrandKit,
  role: "heading" | "body" | "accent" = "heading",
): string {
  const family = kit.typography[role].fontFamily;
  return `"${family}", "Apple SD Gothic Neo", sans-serif`;
}

/**
 * Get the appropriate FontMood for Satori rendering based on content type.
 */
export function getFontMoodForContent(
  kit: BrandKit,
  role: "heading" | "body" | "accent" = "heading",
): FontMood {
  return kit.typography[role].fontMood;
}

/**
 * Build a safe-zone-aware container style object for Satori JSX.
 */
export function getSafeContainerStyle(
  kit: BrandKit,
  width: number,
  height: number,
): Record<string, string | number> {
  return {
    display: "flex",
    flexDirection: "column",
    width,
    height,
    padding: kit.layout.safeMargin,
    fontFamily: getBrandFontStack(kit, "body"),
  };
}

/**
 * Pick gradient from brand kit by index (wraps around).
 */
export function pickGradient(kit: BrandKit, index: number): string {
  const gradients = kit.colors.gradients;
  if (gradients.length === 0) return kit.colors.background.dark;
  return gradients[index % gradients.length]!;
}

/**
 * Load a user's brand kit from the database.
 * Falls back to DEFAULT_BRAND_KIT if no kit exists or DB is unavailable.
 */
export async function loadBrandKit(workspaceId: string): Promise<BrandKit> {
  try {
    const { prisma } = await import("@/lib/db");
    const record = await prisma.brandKit.findFirst({
      where: { workspaceId, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!record) return DEFAULT_BRAND_KIT;

    // Parse extended settings stored as JSON (secondary color, gradients, text colors, etc.)
    let extended: Partial<BrandKit> = {};
    if (record.extendedJson) {
      try {
        extended = JSON.parse(record.extendedJson) as Partial<BrandKit>;
      } catch { /* ignore malformed JSON */ }
    }

    return mergeBrandKit({
      name: record.name,
      colors: {
        ...DEFAULT_BRAND_KIT.colors,
        ...extended.colors,
        primary: record.colorPrimary,
        accent: record.colorAccent,
        background: {
          dark: record.colorBgDark,
          light: record.colorBgLight,
          ...extended.colors?.background,
        },
        text: {
          ...DEFAULT_BRAND_KIT.colors.text,
          primary: record.colorText,
          ...extended.colors?.text,
        },
      },
      typography: {
        ...DEFAULT_BRAND_KIT.typography,
        ...extended.typography,
        heading: { ...DEFAULT_BRAND_KIT.typography.heading, fontFamily: record.headingFont, ...extended.typography?.heading },
        body: { ...DEFAULT_BRAND_KIT.typography.body, fontFamily: record.bodyFont, ...extended.typography?.body },
      },
      assets: {
        logoUrl: record.logoUrl ?? undefined,
        logoSmallUrl: record.logomarkUrl ?? undefined,
        ...extended.assets,
      },
      layout: {
        ...DEFAULT_BRAND_KIT.layout,
        safeMargin: record.safeMargin,
        cornerRadius: record.borderRadius,
        ...extended.layout,
      },
    });
  } catch {
    // DB unavailable — fall back to default
    return DEFAULT_BRAND_KIT;
  }
}

/**
 * Save or update a brand kit in the database.
 */
export async function saveBrandKit(
  workspaceId: string,
  kit: Partial<BrandKit> & { name?: string },
): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const merged = mergeBrandKit(kit);

  // Store fields not covered by dedicated columns in extendedJson
  const extendedJson = JSON.stringify({
    colors: {
      secondary: merged.colors.secondary,
      gradients: merged.colors.gradients,
      text: {
        secondary: merged.colors.text.secondary,
        onDark: merged.colors.text.onDark,
        onLight: merged.colors.text.onLight,
      },
    },
    typography: {
      accent: merged.typography.accent,
      sizes: merged.typography.sizes,
      heading: { weights: merged.typography.heading.weights, fontMood: merged.typography.heading.fontMood },
      body: { weights: merged.typography.body.weights, fontMood: merged.typography.body.fontMood },
    },
    assets: { watermarkUrl: merged.assets.watermarkUrl },
    layout: { slideGap: merged.layout.slideGap, maxTextPerSlide: merged.layout.maxTextPerSlide, maxTitleLength: merged.layout.maxTitleLength },
  });

  const data = {
    name: kit.name ?? merged.name,
    colorPrimary: merged.colors.primary,
    colorAccent: merged.colors.accent,
    colorBgDark: merged.colors.background.dark,
    colorBgLight: merged.colors.background.light,
    colorText: merged.colors.text.primary,
    headingFont: merged.typography.heading.fontFamily,
    bodyFont: merged.typography.body.fontFamily,
    safeMargin: merged.layout.safeMargin,
    borderRadius: merged.layout.cornerRadius,
    logoUrl: merged.assets.logoUrl,
    logomarkUrl: merged.assets.logoSmallUrl,
    extendedJson,
  };

  await prisma.brandKit.upsert({
    where: { id: `${workspaceId}-default` },
    create: { id: `${workspaceId}-default`, workspaceId, isDefault: true, ...data },
    update: data,
  });
}

/**
 * Merge a partial brand kit override into the defaults (deep merge for nested objects).
 */
export function mergeBrandKit(overrides: Partial<BrandKit>): BrandKit {
  return {
    ...DEFAULT_BRAND_KIT,
    ...overrides,
    colors: {
      ...DEFAULT_BRAND_KIT.colors,
      ...overrides.colors,
      background: { ...DEFAULT_BRAND_KIT.colors.background, ...overrides.colors?.background },
      text: { ...DEFAULT_BRAND_KIT.colors.text, ...overrides.colors?.text },
      gradients: overrides.colors?.gradients ?? DEFAULT_BRAND_KIT.colors.gradients,
    },
    typography: {
      ...DEFAULT_BRAND_KIT.typography,
      ...overrides.typography,
      heading: { ...DEFAULT_BRAND_KIT.typography.heading, ...overrides.typography?.heading },
      body: { ...DEFAULT_BRAND_KIT.typography.body, ...overrides.typography?.body },
      accent: { ...DEFAULT_BRAND_KIT.typography.accent, ...overrides.typography?.accent },
      sizes: { ...DEFAULT_BRAND_KIT.typography.sizes, ...overrides.typography?.sizes },
    },
    assets: { ...DEFAULT_BRAND_KIT.assets, ...overrides.assets },
    layout: { ...DEFAULT_BRAND_KIT.layout, ...overrides.layout },
  };
}
