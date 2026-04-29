/**
 * Design Director Agent — Integration Test.
 *
 * Tests the Design Director's ability to:
 *   - Generate a valid DesignBrief from content input
 *   - Correctly classify content types
 *   - Plan appropriate outputs per content type
 *   - Apply skip filters
 *
 * Requires a real OPENAI_API_KEY. Skipped automatically when only the CI dummy key is available.
 */
import { describe, it, expect } from "vitest";
import { generateDesignBrief } from "../design-director";
import type { DesignEngineInput } from "../types";

const HAS_REAL_LLM_KEY =
  !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("sk-test-dummy");

describe.skipIf(!HAS_REAL_LLM_KEY)("Design Director Agent (LLM)", () => {
  it("Album review → DesignBrief", async () => {
    const input: DesignEngineInput = {
      topic: "NewJeans 3rd Mini Album 'Supernatural' 리뷰",
      content: `뉴진스의 세 번째 미니앨범 'Supernatural'이 드디어 베일을 벗었다.
타이틀곡 'Supernatural'은 90년대 유로비트를 현대적으로 재해석한 트랙으로,
하니의 몽환적인 보컬과 해린의 래핑이 절묘하게 어우러진다.
프로듀서 250은 이번 앨범에서 레트로 사운드스케이프를 극대화하며
뉴진스만의 독특한 음악 세계관을 한층 더 확장시켰다.
수록곡 'Right Now'는 기존 뉴진스 스타일과 달리 록 기타 리프가 가미된
실험적인 시도로, 그룹의 음악적 성장을 보여준다.`,
    };

    const brief = await generateDesignBrief(input);

    expect(typeof brief.contentType).toBe("string");
    expect(typeof brief.mood).toBe("string");
    expect(brief.mood.length).toBeGreaterThan(0);
    expect(typeof brief.keyMessage).toBe("string");
    expect(brief.keyMessage.length).toBeGreaterThan(0);
    expect(typeof brief.visualConcept).toBe("string");
    expect(brief.colorDirection.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(["warm", "cool", "vibrant", "muted", "dark", "pastel"]).toContain(
      brief.colorDirection.mood,
    );
    expect(["editorial", "bold", "minimal", "data-driven", "immersive"]).toContain(
      brief.layoutStyle,
    );
    expect(["serif_classic", "sans_modern", "display_impact", "handwritten"]).toContain(
      brief.typographyMood,
    );
    expect(brief.outputs.length).toBeGreaterThan(0);
  }, 60_000);

  it("Trending topic → DesignBrief includes card_news", async () => {
    const input: DesignEngineInput = {
      topic: "2026 상반기 K-POP 트렌드 키워드 5",
      content: `2026년 상반기 K-POP 씬을 관통하는 5가지 핵심 트렌드를 정리했다.
첫째, AI 프로듀싱의 대중화. Suno AI와 Udio 같은 AI 작곡 도구가 인디 씬에서
활발하게 활용되고 있다. 둘째, 글로벌 콜라보의 일상화. 셋째, 숏폼 최적화
음악의 부상. 넷째, Y2K 리바이벌의 진화. 다섯째, 팬덤 경제의 디지털화.`,
    };

    const brief = await generateDesignBrief(input);

    expect(brief.outputs.length).toBeGreaterThanOrEqual(3);
    expect(brief.outputs.some((o) => o.format === "card_news")).toBe(true);
  }, 60_000);

  it("Skip filter removes card_news + sns", async () => {
    const input: DesignEngineInput = {
      topic: "테스트 토픽",
      content: "테스트 콘텐츠입니다. 이것은 스킵 필터 테스트를 위한 더미 텍스트입니다.",
      skip: {
        cardNews: true,
        snsImages: true,
      },
    };

    const brief = await generateDesignBrief(input);

    expect(brief.outputs.some((o) => o.format === "card_news")).toBe(false);
    expect(brief.outputs.some((o) => o.format === "sns_image")).toBe(false);
    expect(brief.outputs.some((o) => o.format === "cover")).toBe(true);
  }, 60_000);

  it("Data insight content produces valid brief", async () => {
    const input: DesignEngineInput = {
      topic: "Spotify 스트리밍 데이터로 본 K-POP 글로벌 성장",
      content: `2025년 Spotify 연간 스트리밍 데이터를 분석한 결과,
K-POP 장르의 글로벌 스트리밍 점유율이 전년 대비 23% 성장했다.
특히 동남아시아(+45%)와 남미(+38%) 시장에서의 성장이 두드러졌다.
BTS, BLACKPINK, Stray Kids가 상위 3개 아티스트를 차지했으며,
4세대 그룹의 약진도 눈에 띈다.`,
    };

    const brief = await generateDesignBrief(input);

    expect(brief.contentType).toBeDefined();
    expect(brief.layoutStyle).toBeDefined();
    expect(brief.outputs.length).toBeGreaterThan(0);
  }, 60_000);
});
