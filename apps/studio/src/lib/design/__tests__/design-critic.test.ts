/**
 * Design Critic Agent + Edit Interpreter + Refinement Loop — Integration Test.
 *
 * Tests:
 *   1. Critic evaluates a template-based card news design
 *   2. Critic evaluates a single SNS image
 *   3. Edit Interpreter parses instructions and applies to template slides
 *   4. Quality Store CRUD (no LLM)
 *
 * The LLM-dependent tests require a real OPENAI_API_KEY (uses gpt-4o for Vision).
 * Quality Store tests run without API access.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateDesignBrief } from "../design-director";
import { generateVisualDesign } from "../visual-designer";
import { critiqueDesign, critiqueSingleSlide } from "../design-critic";
import { parseEditInstructions, applyEdits } from "../edit-interpreter";
import {
  saveQualityRecord,
  getQualityStats,
  getRecentRecords,
  clearQualityRecords,
} from "../quality-store";
import type { DesignEngineInput, DesignQualityRecord } from "../types";

const HAS_REAL_LLM_KEY =
  !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("sk-test-dummy");

describe("Quality Store (no LLM)", () => {
  beforeAll(() => {
    clearQualityRecords();
  });

  it("CRUD operations work end-to-end", () => {
    const record: DesignQualityRecord = {
      designId: `design_${Date.now()}_test1`,
      contentType: "album_review",
      format: "card_news",
      platform: "instagram",
      scores: [
        { dimension: "VISUAL_HIERARCHY", score: 8, feedback: "Good" },
        { dimension: "BRAND_CONSISTENCY", score: 7, feedback: "OK" },
        { dimension: "READABILITY", score: 9, feedback: "Excellent" },
        { dimension: "AESTHETIC_QUALITY", score: 7, feedback: "OK" },
        { dimension: "PLATFORM_FIT", score: 8, feedback: "Good" },
      ],
      averageScore: 7.8,
      verdict: "refine",
      iterationCount: 2,
      designPath: "template",
      generationTimeMs: 5000,
    };

    saveQualityRecord(record);

    const recent = getRecentRecords(10);
    expect(recent.length).toBe(1);
    expect(recent[0]!.averageScore).toBe(7.8);

    const stats = getQualityStats();
    expect(stats.totalDesigns).toBe(1);
    expect(stats.averageScore).toBe(7.8);
    expect(stats.byVerdict.refine).toBe(1);

    clearQualityRecords();
  });
});

describe.skipIf(!HAS_REAL_LLM_KEY)("Design Critic + Edit Interpreter (LLM)", () => {
  it("Critic: Card news evaluation (3 slides)", async () => {
    const input: DesignEngineInput = {
      topic: "NewJeans 3rd Mini Album Review",
      content:
        "뉴진스의 세 번째 미니앨범은 레트로와 현대의 조화를 완벽히 구현했다. 타이틀곡 Supernatural은 90년대 유로비트를 현대적으로 재해석한 트랙이다.",
    };
    const brief = await generateDesignBrief(input);

    const contentSlides = [
      { title: "ALBUM REVIEW", body: "NewJeans 새 앨범 완벽 해부", footer: "Web Magazine" },
      { title: "프로듀서 분석", body: "250의 레트로 사운드스케이프", footer: "1/3" },
      { title: "더 알아보기", body: "매거진에서 전체 리뷰를 확인하세요", footer: "Web Magazine" },
    ];

    const design = await generateVisualDesign(
      { brief, contentSlides },
      "card_news",
      "instagram",
    );

    const critique = await critiqueDesign(design, brief);

    expect(critique.scores.length).toBe(5);
    expect(critique.averageScore).toBeGreaterThan(0);
    expect(["pass", "refine", "regenerate"]).toContain(critique.verdict);

    const dims = critique.scores.map((s) => s.dimension);
    expect(dims).toContain("VISUAL_HIERARCHY");
    expect(dims).toContain("BRAND_CONSISTENCY");
    expect(dims).toContain("READABILITY");
  }, 180_000);

  it("Critic: Single SNS image (Twitter)", async () => {
    const input: DesignEngineInput = {
      topic: "K-POP 트렌드",
      content: "2026 상반기 K-POP 트렌드를 분석합니다. AI 프로듀싱과 글로벌 확장이 키워드입니다.",
    };
    const brief = await generateDesignBrief(input);

    const design = await generateVisualDesign(
      {
        brief,
        contentSlides: [{ title: "K-POP 2026 트렌드", body: "올해의 5가지 키워드" }],
      },
      "sns_image",
      "twitter",
    );

    const critique = await critiqueSingleSlide(design.slides[0]!, brief);

    expect(critique.scores.length).toBe(5);
    expect(critique.averageScore).toBeGreaterThanOrEqual(1);
    expect(critique.averageScore).toBeLessThanOrEqual(10);
  }, 180_000);

  it("Edit Interpreter: Parse + apply edits", async () => {
    const input: DesignEngineInput = {
      topic: "BTS 컴백 분석",
      content:
        "BTS의 완전체 컴백에 대한 심층 분석입니다. 군 전역 후 첫 활동으로 전 세계적인 주목을 받고 있습니다.",
    };
    const brief = await generateDesignBrief(input);

    const design = await generateVisualDesign(
      {
        brief,
        contentSlides: [
          { title: "BTS COMEBACK", body: "완전체 컴백의 의미" },
          { title: "활동 계획", body: "월드투어와 새 앨범 동시 준비" },
        ],
      },
      "card_news",
      "instagram",
    );

    expect(design.slides[0]!.templateId).toBeTruthy();
    expect(design.slides[0]!.renderSpec).toBeTruthy();

    const editRequest = await parseEditInstructions(
      "1번 슬라이드 배경을 더 어둡게 바꾸고, 제목 크기를 키워주세요",
      design.slides,
    );

    expect(editRequest.actions.length).toBeGreaterThan(0);

    const edited = await applyEdits(
      design,
      "1번 슬라이드 배경을 더 어둡게 바꾸고, 제목 크기를 키워주세요",
      editRequest.actions,
    );

    expect(edited.slides.length).toBe(design.slides.length);
  }, 180_000);
});
