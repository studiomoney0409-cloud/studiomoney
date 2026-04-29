/**
 * Publish Bridge — Unit Tests (no API/LLM required).
 * Tests pure helper functions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prepareForPublishing } from "../publish-bridge";
import type { DesignBrief, VisualDesignResult } from "../types";
import { clearPerformanceRecords, getPerformanceRecords } from "../style-performance";

function makeBrief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    contentType: "album_review",
    mood: "에너지틱한",
    keyMessage: "NewJeans 새 앨범 분석",
    visualConcept: "네온 글로우",
    colorDirection: { primary: "#6C5CE7", mood: "vibrant" },
    layoutStyle: "editorial",
    typographyMood: "sans_modern",
    outputs: [],
    ...overrides,
  } as DesignBrief;
}

function makeVisualResult(): VisualDesignResult {
  return {
    format: "card_news",
    slides: [
      { index: 0, jsxCode: "<div>slide1</div>", width: 1080, height: 1080, platform: "instagram" },
      { index: 1, jsxCode: "<div>slide2</div>", width: 1080, height: 1080, platform: "instagram" },
    ],
    designPath: "template",
  };
}

async function mockRender(_html: string, w: number, h: number): Promise<string> {
  return `data:image/png;base64,MOCK_${w}x${h}`;
}

describe("Publish Bridge", () => {
  beforeAll(() => {
    clearPerformanceRecords();
  });

  it("prepareForPublishing — basic", async () => {
    const result = await prepareForPublishing({
      brief: makeBrief(),
      visualResult: makeVisualResult(),
      platform: "instagram",
      renderSlide: mockRender,
    });

    expect(result.platform).toBe("instagram");
    expect(result.imageDataUris.length).toBe(2);
    expect(result.imageDataUris[0]!).toMatch(/^data:image\/png/);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.hashtags.length).toBeGreaterThan(0);
    expect(result.hashtags.some((h) => h.startsWith("#"))).toBe(true);
    expect(result.designMeta.contentType).toBe("album_review");
  });

  it("prepareForPublishing — caption override", async () => {
    const result = await prepareForPublishing({
      brief: makeBrief(),
      visualResult: makeVisualResult(),
      platform: "instagram",
      renderSlide: mockRender,
      captionOverride: "Custom caption text",
    });

    expect(result.text).toBe("Custom caption text");
  });

  it("prepareForPublishing — twitter truncation", async () => {
    const longMessage = "A".repeat(300);
    const result = await prepareForPublishing({
      brief: makeBrief({ keyMessage: longMessage }),
      visualResult: makeVisualResult(),
      platform: "twitter",
      renderSlide: mockRender,
    });

    expect(result.text.length).toBeLessThanOrEqual(280);
    expect(result.text.endsWith("...")).toBe(true);
  });

  it("prepareForPublishing — extra hashtags", async () => {
    const result = await prepareForPublishing({
      brief: makeBrief(),
      visualResult: makeVisualResult(),
      platform: "instagram",
      renderSlide: mockRender,
      extraHashtags: ["NewJeans", "#CustomTag"],
    });

    expect(result.hashtags).toContain("#NewJeans");
    expect(result.hashtags).toContain("#CustomTag");
  });

  it("records style for performance tracking", async () => {
    const records = getPerformanceRecords(10);
    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(records.some((r) => r.contentType === "album_review")).toBe(true);
    expect(records.some((r) => r.typographyMood === "sans_modern")).toBe(true);
  });

  it("rejects empty slides", async () => {
    await expect(
      prepareForPublishing({
        brief: makeBrief(),
        visualResult: { ...makeVisualResult(), slides: [] },
        platform: "instagram",
        renderSlide: mockRender,
      }),
    ).rejects.toThrow(/no slides/);
  });

  it("youtube_thumb — no caption", async () => {
    const result = await prepareForPublishing({
      brief: makeBrief(),
      visualResult: makeVisualResult(),
      platform: "youtube_thumb",
      renderSlide: mockRender,
    });

    expect(result.text).toBe("");
    expect(result.hashtags.length).toBe(0);
  });
});
