/**
 * Visual Designer Agent — Integration Test.
 *
 * Tests both Path A (template) and Path B (LLM-generated) for:
 *   - Card news generation
 *   - SNS image generation
 *   - Style overrides from DesignBrief
 *
 * Requires a real OPENAI_API_KEY. Skipped automatically when only the CI dummy key is available.
 */
import { describe, it, expect } from "vitest";
import { generateDesignBrief } from "../design-director";
import { generateVisualDesign } from "../visual-designer";
import type { DesignEngineInput } from "../types";

const HAS_REAL_LLM_KEY =
  !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("sk-test-dummy");

const SAMPLE_SLIDES = [
  { title: "ALBUM REVIEW", body: "NewJeans 새 앨범 완벽 해부", footer: "Web Magazine" },
  { title: "프로듀서 분석", body: "250의 레트로 사운드스케이프가 뉴진스의 세계관을 확장한다", footer: "1/5" },
  { title: "타이틀곡 해부", body: "Supernatural은 90년대 유로비트를 현대적으로 재해석한 트랙이다", footer: "2/5" },
  { title: "핵심 포인트", body: "하니의 보컬과 해린의 래핑이 절묘하게 어우러진다", footer: "3/5" },
  { title: "더 알아보기", body: "매거진에서 전체 리뷰를 확인하세요", footer: "Web Magazine" },
];

describe.skipIf(!HAS_REAL_LLM_KEY)("Visual Designer Agent (LLM)", () => {
  it("Path A: Card news (template-based, 5 slides)", async () => {
    const input: DesignEngineInput = {
      topic: "NewJeans 3rd Mini Album Review",
      content: "뉴진스의 세 번째 미니앨범 리뷰입니다.",
    };
    const brief = await generateDesignBrief(input);

    const result = await generateVisualDesign(
      { brief, contentSlides: SAMPLE_SLIDES },
      "card_news",
      "instagram",
    );

    expect(result.designPath).toBe("template");
    expect(result.slides.length).toBe(5);
    expect(result.slides[0]!.width).toBe(1080);
    expect(result.slides[0]!.height).toBe(1080);
    expect(result.slides[0]!.jsxCode).toContain("<div");
    expect(result.slides[0]!.jsxCode).toContain("style=");
  }, 90_000);

  it("Path A: SNS image (Twitter 1200x675)", async () => {
    const input: DesignEngineInput = {
      topic: "K-POP 트렌드",
      content: "2026 상반기 트렌드 분석",
    };
    const brief = await generateDesignBrief(input);

    const result = await generateVisualDesign(
      { brief, contentSlides: [{ title: "K-POP 2026 트렌드", body: "올해의 5가지 키워드" }] },
      "sns_image",
      "twitter",
    );

    expect(result.designPath).toBe("template");
    expect(result.slides.length).toBe(1);
    expect(result.slides[0]!.width).toBe(1200);
    expect(result.slides[0]!.height).toBe(675);
  }, 90_000);

  it("Path B: LLM-generated HTML (Instagram 1080x1080)", async () => {
    const input: DesignEngineInput = {
      topic: "BTS 컴백 분석",
      content: "BTS의 완전체 컴백에 대한 심층 분석입니다.",
    };
    const brief = await generateDesignBrief(input);

    const result = await generateVisualDesign(
      {
        brief,
        contentSlides: [
          { title: "BTS COMEBACK", body: "완전체 컴백의 의미", role: "cover" as const },
        ],
        preferGenerated: true,
      },
      "sns_image",
      "instagram",
    );

    expect(result.designPath).toBe("generated");
    expect(result.slides.length).toBe(1);
    expect(result.slides[0]!.jsxCode).toContain("<div");
    expect(result.slides[0]!.jsxCode).toContain("display");
  }, 120_000);
});
