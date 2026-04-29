/**
 * Quality Store — Unit Test (no LLM required).
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  saveQualityRecord,
  getQualityRecord,
  getQualityStats,
  getRecentRecords,
  getQualityTrends,
  clearQualityRecords,
} from "../quality-store";
import type { DesignQualityRecord } from "../types";

function makeRecord(overrides: Partial<DesignQualityRecord> = {}): DesignQualityRecord {
  return {
    designId: `design_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    contentType: "album_review",
    format: "card_news",
    platform: "instagram",
    scores: [
      { dimension: "VISUAL_HIERARCHY", score: 8, feedback: "Good" },
      { dimension: "BRAND_CONSISTENCY", score: 7, feedback: "OK" },
      { dimension: "READABILITY", score: 9, feedback: "Great" },
      { dimension: "AESTHETIC_QUALITY", score: 8, feedback: "Nice" },
      { dimension: "PLATFORM_FIT", score: 7, feedback: "OK" },
    ],
    averageScore: 7.8,
    verdict: "refine",
    iterationCount: 2,
    designPath: "template",
    generationTimeMs: 5000,
    ...overrides,
  };
}

describe("Quality Store", () => {
  beforeAll(() => {
    clearQualityRecords();
  });

  it("save + getByDesignId", () => {
    const r = makeRecord({ designId: "design_1709000000000_abc" });
    saveQualityRecord(r);
    const got = getQualityRecord("design_1709000000000_abc");
    expect(got).toBeDefined();
    expect(got!.averageScore).toBe(7.8);
  });

  it("aggregate stats with 2 records", () => {
    saveQualityRecord(makeRecord({
      designId: "design_1709000001000_def",
      contentType: "trending",
      format: "sns_image",
      platform: "twitter",
      averageScore: 8.8,
      verdict: "pass",
      iterationCount: 1,
      designPath: "generated",
      generationTimeMs: 3000,
    }));

    const stats = getQualityStats();
    expect(stats.totalDesigns).toBe(2);
    expect(stats.passRate).toBe(0.5);
    expect(stats.byVerdict.pass).toBe(1);
    expect(stats.byVerdict.refine).toBe(1);
    expect(stats.byDesignPath["template"]!.count).toBe(1);
    expect(stats.byDesignPath["generated"]!.count).toBe(1);
  });

  it("filter by contentType", () => {
    const stats = getQualityStats({ contentType: "album_review" });
    expect(stats.totalDesigns).toBe(1);
    expect(stats.averageScore).toBe(7.8);
  });

  it("recent records (newest first)", () => {
    const recent = getRecentRecords(10);
    expect(recent.length).toBe(2);
    expect(recent[0]!.designId).toContain("def");
  });

  it("quality trends", () => {
    saveQualityRecord(makeRecord({
      designId: `design_${Date.now()}_trend`,
      averageScore: 9.0,
      verdict: "pass",
    }));
    const trends = getQualityTrends(30);
    expect(trends.length).toBeGreaterThanOrEqual(1);
  });

  it("empty stats", () => {
    const stats = getQualityStats({ contentType: "data_insight" });
    expect(stats.totalDesigns).toBe(0);
    expect(stats.averageScore).toBe(0);
  });

  it("clear records", () => {
    clearQualityRecords();
    expect(getRecentRecords(10).length).toBe(0);
  });
});
