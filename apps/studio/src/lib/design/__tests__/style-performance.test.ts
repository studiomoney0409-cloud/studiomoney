/**
 * Style Performance Tracker — Unit Tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  recordDesignStyle,
  updateEngagement,
  getStyleInsights,
  getStyleRecommendation,
  getTopTemplates,
  getPerformanceSummary,
  getPerformanceRecords,
  clearPerformanceRecords,
} from "../style-performance";
import type { StylePerformanceRecord } from "../style-performance";

function makeRecord(overrides: Partial<StylePerformanceRecord> = {}): StylePerformanceRecord {
  return {
    id: `design_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    contentType: "album_review",
    format: "card_news",
    platform: "instagram",
    templateId: "cover.hero.v1",
    designPath: "template",
    typographyMood: "sans_modern",
    layoutStyle: "editorial",
    colorMood: "vibrant",
    primaryColor: "#6C5CE7",
    hasImage: true,
    slideCount: 5,
    ...overrides,
  };
}

describe("Style Performance Tracker", () => {
  beforeAll(() => {
    clearPerformanceRecords();
  });

  it("record + get", () => {
    const rec = makeRecord({ id: "test1" });
    recordDesignStyle(rec);
    const records = getPerformanceRecords(10);
    expect(records.length).toBe(1);
    expect(records[0]!.id).toBe("test1");
  });

  it("update engagement", () => {
    const updated = updateEngagement("test1", {
      impressions: 1000,
      engagements: 50,
      saves: 10,
      shares: 5,
      clicks: 20,
    });
    expect(updated).toBe(true);
    const records = getPerformanceRecords(10);
    expect(records[0]!.engagementRate).toBe(0.05);
  });

  it("update engagement — nonexistent", () => {
    const updated = updateEngagement("nonexistent", { impressions: 100 });
    expect(updated).toBe(false);
  });

  it("insights — not enough data", () => {
    const insights = getStyleInsights();
    expect(insights.length).toBe(0);
  });

  it("insights — with enough data", () => {
    for (let i = 0; i < 5; i++) {
      const rec = makeRecord({
        id: `batch_a_${i}`,
        typographyMood: "sans_modern",
        layoutStyle: "editorial",
        colorMood: "vibrant",
      });
      recordDesignStyle(rec);
      updateEngagement(`batch_a_${i}`, { impressions: 1000, engagements: 50 + i * 10 });
    }

    for (let i = 0; i < 3; i++) {
      const rec = makeRecord({
        id: `batch_b_${i}`,
        typographyMood: "display_impact",
        layoutStyle: "bold",
        colorMood: "dark",
      });
      recordDesignStyle(rec);
      updateEngagement(`batch_b_${i}`, { impressions: 1000, engagements: 20 + i * 5 });
    }

    const insights = getStyleInsights();
    expect(insights.length).toBeGreaterThan(0);
    const sansMod = insights.find((i) => i.attribute === "typographyMood" && i.value === "sans_modern");
    const dispImp = insights.find((i) => i.attribute === "typographyMood" && i.value === "display_impact");
    expect(sansMod).toBeDefined();
    expect(dispImp).toBeDefined();
    expect(sansMod!.avgEngagementRate).toBeGreaterThan(dispImp!.avgEngagementRate);
  });

  it("recommendation", () => {
    const rec = getStyleRecommendation("album_review", "instagram");
    expect(rec.contentType).toBe("album_review");
    expect(rec.platform).toBe("instagram");
    expect(rec.reasoning.length).toBeGreaterThan(0);
    expect(rec.recommendedStyles.typographyMood).toBe("sans_modern");
  });

  it("top templates", () => {
    const top = getTopTemplates(5);
    expect(top.length).toBeGreaterThanOrEqual(1);
    expect(top[0]!.templateId).toBe("cover.hero.v1");
    expect(top[0]!.sampleSize).toBeGreaterThanOrEqual(2);
  });

  it("summary", () => {
    const summary = getPerformanceSummary();
    expect(summary.totalRecords).toBe(9);
    expect(summary.withEngagement).toBe(9);
    expect(summary.avgEngagementRate).toBeGreaterThan(0);
  });

  it("filter by platform", () => {
    const rec = makeRecord({ id: "twitter1", platform: "twitter", typographyMood: "serif_classic" });
    recordDesignStyle(rec);
    updateEngagement("twitter1", { impressions: 500, engagements: 100 });

    const rec2 = makeRecord({ id: "twitter2", platform: "twitter", typographyMood: "serif_classic" });
    recordDesignStyle(rec2);
    updateEngagement("twitter2", { impressions: 500, engagements: 80 });

    const rec3 = makeRecord({ id: "twitter3", platform: "twitter", typographyMood: "serif_classic" });
    recordDesignStyle(rec3);
    updateEngagement("twitter3", { impressions: 500, engagements: 90 });

    const insights = getStyleInsights({ platform: "twitter" });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every((i) => i.sampleSize >= 2)).toBe(true);
  });

  it("clear records", () => {
    clearPerformanceRecords();
    const summary = getPerformanceSummary();
    expect(summary.totalRecords).toBe(0);
  });
});
