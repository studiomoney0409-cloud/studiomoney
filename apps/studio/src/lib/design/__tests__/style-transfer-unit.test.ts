/**
 * Style Transfer & Spotify Style Extractor — Unit Tests (no LLM/API required).
 * Tests pure functions only.
 */
import { describe, it, expect } from "vitest";
import { styleTokenToColorOverrides } from "../style-transfer";
import { mergeStyleTokens } from "../spotify-style-extractor";
import type { StyleToken } from "../types";

function makeToken(overrides: Partial<StyleToken> = {}): StyleToken {
  return {
    id: "test",
    name: "Test",
    colors: {
      palette: ["#FF0000", "#00FF00", "#0000FF"],
      ratios: [0.5, 0.3, 0.2],
    },
    typography: { mood: "sans_modern", weight: "bold", style: "sans" },
    layout: { density: "balanced", alignment: "center", whitespace: "moderate" },
    effects: ["gradient"],
    moodKeywords: ["vibrant"],
    ...overrides,
  };
}

describe("Style Transfer", () => {
  it("styleTokenToColorOverrides — basic", () => {
    const token = makeToken();
    const overrides = styleTokenToColorOverrides(token);
    expect(overrides.primary).toBe("#FF0000");
    expect(overrides.accent).toBe("#00FF00");
    expect(overrides.gradients.length).toBe(1);
    expect(overrides.gradients[0]!).toContain("#FF0000");
  });

  it("styleTokenToColorOverrides — with explicit gradient", () => {
    const token = makeToken({
      colors: {
        palette: ["#AA00BB", "#CC00DD"],
        ratios: [0.6, 0.4],
        gradient: "linear-gradient(90deg, #AA00BB, #CC00DD)",
      },
    });
    const overrides = styleTokenToColorOverrides(token);
    expect(overrides.gradients[0]).toBe("linear-gradient(90deg, #AA00BB, #CC00DD)");
  });

  it("mergeStyleTokens — single token returns itself", () => {
    const token = makeToken({ name: "Solo" });
    const merged = mergeStyleTokens([token]);
    expect(merged).not.toBeNull();
    expect(merged!.name).toBe("Solo");
  });

  it("mergeStyleTokens — empty returns null", () => {
    const merged = mergeStyleTokens([]);
    expect(merged).toBeNull();
  });

  it("mergeStyleTokens — merges 3 tokens", () => {
    const t1 = makeToken({
      name: "Style A",
      colors: { palette: ["#FF0000", "#00FF00"], ratios: [0.6, 0.4] },
      typography: { mood: "sans_modern", weight: "bold", style: "sans" },
      moodKeywords: ["vibrant", "modern"],
      effects: ["gradient"],
    });
    const t2 = makeToken({
      name: "Style B",
      colors: { palette: ["#FF0000", "#0000FF"], ratios: [0.5, 0.5] },
      typography: { mood: "sans_modern", weight: "regular", style: "sans" },
      moodKeywords: ["clean", "minimal"],
      effects: ["shadow"],
    });
    const t3 = makeToken({
      name: "Style C",
      colors: { palette: ["#FF0000", "#FFFF00"], ratios: [0.7, 0.3] },
      typography: { mood: "display_impact", weight: "bold", style: "display" },
      moodKeywords: ["energetic"],
      effects: ["neon_glow"],
    });

    const merged = mergeStyleTokens([t1, t2, t3]);
    expect(merged).not.toBeNull();
    expect(merged!.colors.palette[0]).toBe("#ff0000");
    expect(merged!.typography.mood).toBe("sans_modern");
    expect(merged!.typography.weight).toBe("bold");
    expect(merged!.moodKeywords.length).toBeGreaterThanOrEqual(3);
    expect(merged!.effects.length).toBe(3);
  });
});
