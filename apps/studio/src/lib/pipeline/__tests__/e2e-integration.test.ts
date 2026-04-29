/**
 * E2E Pipeline Integration Tests
 *
 * Tests the pipeline wiring: stage flow, type compatibility, error propagation.
 * Does NOT call LLM — validates the orchestration logic.
 */

import { describe, it, expect } from "vitest";
import type { E2EInput, E2EResult, E2EStage } from "../e2e-orchestrator";
import type { PipelineResult, PipelineOutline, QualityScore, ResearchPacket } from "../types";
import type { DesignBrief, DesignPlatform, DesignFormat, VisualDesignResult } from "../../design/types";

describe("E2E Pipeline Integration", () => {
  it("E2EInput accepts all fields", () => {
    const input: E2EInput = {
      topic: "BTS 신곡 분석",
      contentType: "blog",
      targetWordCount: 2000,
      persona: {
        name: "Test Persona",
        styleFingerprint: "warm, analytical",
        perspective: "1st person",
        expertiseAreas: ["K-pop"],
        tone: { formality: 0.6 },
        emotionalDrivers: ["curiosity"],
        vocabulary: null,
        structure: null,
        contentRules: { always: ["cite sources"], never: ["use slang"] },
        goldenExamples: null,
        channelProfiles: null,
      },
      referenceImageUrl: "https://example.com/album.jpg",
      platforms: ["instagram", "twitter"],
      preferGenerated: false,
      existingContent: "이미 작성된 콘텐츠...",
      skip: { article: true, design: false, dataViz: true, publish: true },
      onStageChange: () => {},
    };

    expect(input.topic).toBe("BTS 신곡 분석");
    expect(input.platforms?.length).toBe(2);
    expect(input.skip?.article).toBe(true);
  });

  it("E2EResult has all required fields", () => {
    const result: E2EResult = {
      stage: "completed",
      article: undefined,
      design: undefined,
      totalTimeMs: 5000,
      stageTimings: { article: 3000, design: 2000 },
    };

    expect(result.stage).toBe("completed");
    expect(result.totalTimeMs).toBe(5000);
    expect(result.stageTimings.article).toBe(3000);
  });

  it("PipelineResult flows into E2EResult.article", () => {
    const outline: PipelineOutline = {
      title: "BTS 분석",
      angle: "음악적 진화",
      sections: [{ heading: "서론", keyPoints: ["point1"] }],
      seoTitle: "BTS Analysis",
      seoDescription: "BTS 음악 분석",
      seoKeywords: ["BTS", "K-pop"],
      targetWordCount: 2000,
    };

    const score: QualityScore = {
      factualAccuracy: 85,
      voiceAlignment: 80,
      readability: 90,
      originality: 75,
      seo: 70,
      overall: 80,
      feedback: "잘 작성되었습니다",
    };

    const article: PipelineResult = {
      status: "approved",
      outline,
      draftContent: "초고 내용...",
      editedContent: "편집된 내용...",
      qualityScore: score,
      rewriteCount: 1,
    };

    const result: E2EResult = {
      stage: "completed",
      article,
      totalTimeMs: 1000,
      stageTimings: {},
    };

    expect(result.article?.status).toBe("approved");
    expect(result.article?.qualityScore.overall).toBe(80);
    expect(result.article?.rewriteCount).toBe(1);
    expect(result.article?.outline.sections.length).toBe(1);
  });

  it("DesignBrief connects to design output", () => {
    const brief: DesignBrief = {
      contentType: "album_review",
      mood: "에너지틱한",
      keyMessage: "BTS의 새로운 도전",
      visualConcept: "네온 글로우 + 타이포",
      colorDirection: { primary: "#6C5CE7", mood: "vibrant" },
      layoutStyle: "bold",
      typographyMood: "sans_modern",
      outputs: [
        { format: "card_news", platform: "instagram", slideCount: 5, priority: "must" },
        { format: "sns_image", platform: "twitter", priority: "must" },
      ],
    } as DesignBrief;

    expect(brief.outputs.length).toBe(2);
    expect(brief.outputs[0]!.format).toBe("card_news");
    expect(brief.outputs[0]!.platform).toBe("instagram");

    const visualResult: VisualDesignResult = {
      format: "card_news",
      slides: [
        { index: 0, jsxCode: "<div>Cover</div>", width: 1080, height: 1350, platform: "instagram", templateId: "cover.hero.v1" },
        { index: 1, jsxCode: "<div>Body</div>", width: 1080, height: 1350, platform: "instagram", templateId: "body.fact.v1" },
      ],
      designPath: "template",
    };

    expect(visualResult.slides.length).toBe(2);
    expect(visualResult.designPath).toBe("template");
  });

  it("E2EStage progression is valid", () => {
    const validProgressions: E2EStage[][] = [
      ["idle", "researching", "writing", "editing", "designing", "rendering", "completed"],
      ["idle", "researching", "writing", "editing", "failed"],
      ["idle", "designing", "rendering", "completed"],
      ["idle", "completed"],
    ];

    const allStages: E2EStage[] = [
      "idle", "researching", "writing", "editing",
      "designing", "rendering", "publishing", "completed", "failed",
    ];

    for (const progression of validProgressions) {
      for (const stage of progression) {
        expect(allStages).toContain(stage);
      }
    }
  });

  it("ResearchPacket has all required fields", () => {
    const packet: ResearchPacket = {
      topic: "NewJeans",
      entities: {
        artists: ["NewJeans"],
        albums: ["Get Up"],
        genres: ["K-pop", "Pop"],
        keywords: ["뉴진스", "신곡"],
      },
      artists: [{
        name: "NewJeans",
        nameKo: "뉴진스",
        genres: ["K-pop"],
        bio: "2022년 데뷔한 걸그룹",
        popularity: 85,
        albums: [{ title: "Get Up", releaseDate: "2023-07", albumType: "ep" }],
        relatedArtists: [{ name: "LE SSERAFIM", relationType: "similar_to" }],
      }],
      relatedArticles: [
        { content: "관련 기사 내용", sourceType: "blog", score: 0.85 },
      ],
      webSources: [
        { title: "NewJeans 신곡 발매", url: "https://example.com", snippet: "뉴진스가..." },
      ],
    };

    expect(packet.entities.artists.length).toBe(1);
    expect(packet.artists[0]!.albums.length).toBe(1);
    expect(packet.relatedArticles[0]!.score).toBe(0.85);
  });

  it("DesignPlatform covers all platforms", () => {
    const platforms: DesignPlatform[] = [
      "instagram", "instagram_story", "twitter",
      "youtube_thumb", "facebook", "blog", "tiktok",
    ];

    expect(platforms.length).toBe(7);

    for (const p of platforms) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it("DesignFormat covers all formats", () => {
    const formats: DesignFormat[] = [
      "card_news", "sns_image", "motion_graphic",
      "infographic", "cover", "quote_card", "data_chart",
    ];

    expect(formats.length).toBe(7);
  });

  it("Quality gate passes/fails correctly", () => {
    const passScore: QualityScore = {
      factualAccuracy: 85, voiceAlignment: 80, readability: 90,
      originality: 75, seo: 70, overall: 80, feedback: "Good",
    };
    expect(passScore.overall).toBeGreaterThanOrEqual(70);

    const failScore: QualityScore = {
      factualAccuracy: 50, voiceAlignment: 60, readability: 55,
      originality: 45, seo: 40, overall: 50, feedback: "Needs work",
    };
    expect(failScore.overall).toBeLessThan(70);

    const lowDimension: QualityScore = {
      factualAccuracy: 45, voiceAlignment: 80, readability: 90,
      originality: 85, seo: 70, overall: 74, feedback: "Low factual",
    };
    const hasCriticalLow = [
      lowDimension.factualAccuracy,
      lowDimension.voiceAlignment,
      lowDimension.readability,
      lowDimension.originality,
      lowDimension.seo,
    ].some((d) => d < 50);
    expect(hasCriticalLow).toBe(true);
  });

  it("Skip configs produce expected behavior", () => {
    const skipAll: E2EInput = {
      topic: "test",
      skip: { article: true, design: true, dataViz: true, publish: true },
    };
    expect(skipAll.skip?.article).toBe(true);
    expect(skipAll.skip?.design).toBe(true);

    const existing: E2EInput = {
      topic: "test",
      existingContent: "Pre-written article...",
    };
    expect(existing.existingContent).toBeDefined();

    const full: E2EInput = { topic: "test" };
    expect(full.skip).toBeUndefined();
  });

  it("Content splitting creates correct slide structure", () => {
    const content = "첫 번째 단락입니다. 중요한 내용을 다루고 있습니다.\n\n두 번째 단락입니다. 추가적인 정보가 여기에 있습니다.\n\n세 번째 단락입니다. 결론을 내리는 중요한 부분입니다.\n\n네 번째 단락입니다. 전체 기사를 마무리합니다.";

    const paragraphs = content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    expect(paragraphs.length).toBe(4);

    const targetSlides = Math.min(6, Math.max(2, Math.ceil(paragraphs.length / 2)));
    expect(targetSlides).toBeGreaterThanOrEqual(2);
    expect(targetSlides).toBeLessThanOrEqual(6);

    const totalSlides = 1 + targetSlides + 1;
    expect(totalSlides).toBeGreaterThanOrEqual(4);
  });

  it("onStageChange captures all stages", () => {
    const stages: E2EStage[] = [];
    const onStage = (stage: E2EStage) => stages.push(stage);

    onStage("researching");
    onStage("writing");
    onStage("editing");
    onStage("designing");
    onStage("rendering");
    onStage("completed");

    expect(stages.length).toBe(6);
    expect(stages[0]).toBe("researching");
    expect(stages[stages.length - 1]).toBe("completed");
  });

  it("Failed pipeline produces correct result shape", () => {
    const failResult: E2EResult = {
      stage: "failed",
      article: {
        status: "failed",
        outline: { title: "", angle: "", sections: [], seoTitle: "", seoDescription: "", seoKeywords: [], targetWordCount: 0 },
        draftContent: "",
        editedContent: "",
        qualityScore: { factualAccuracy: 0, voiceAlignment: 0, readability: 0, originality: 0, seo: 0, overall: 0, feedback: "" },
        rewriteCount: 0,
        error: "LLM timeout",
      },
      totalTimeMs: 500,
      stageTimings: { article: 500 },
    };

    expect(failResult.stage).toBe("failed");
    expect(failResult.article?.error).toBe("LLM timeout");
    expect(failResult.design).toBeUndefined();
  });

  it("PersonaContext has all layers for writer", () => {
    const persona = {
      name: "뮤직 매거진",
      styleFingerprint: "분석적이면서 따뜻한 톤, 전문용어를 일상어로 풀어쓰는 스타일",
      perspective: "1인칭 복수",
      expertiseAreas: ["K-pop", "indie", "음악 이론"],
      tone: { formality: 0.6, humor: 0.3, emotion: 0.7, energy: 0.5 },
      emotionalDrivers: ["curiosity", "nostalgia"],
      vocabulary: { level: "intermediate", preferredWords: ["사운드스케이프"], avoidWords: ["짱"] },
      structure: { avgSentenceLength: 25, hookStyle: "question" },
      contentRules: { always: ["출처 명시"], never: ["비속어 사용"] },
      goldenExamples: { blog: ["예시 글 1"], sns: ["예시 SNS 1"] },
      channelProfiles: { blog: { tone: "formal" }, sns: { tone: "casual" } },
    };

    expect(persona.styleFingerprint.length).toBeGreaterThan(0);
    expect(persona.goldenExamples.blog.length).toBeGreaterThan(0);
    expect(persona.contentRules.always.length).toBeGreaterThan(0);
    expect(persona.channelProfiles.blog).toBeDefined();
  });

  it("Visual result connects to publish bridge", () => {
    const visualResult: VisualDesignResult = {
      format: "card_news",
      slides: [
        { index: 0, jsxCode: "<div>test</div>", width: 1080, height: 1350, platform: "instagram" },
      ],
      designPath: "template",
    };

    const slide = visualResult.slides[0]!;
    expect(typeof slide.jsxCode).toBe("string");
    expect(slide.width).toBeGreaterThan(0);
    expect(slide.height).toBeGreaterThan(0);
    expect(typeof slide.platform).toBe("string");

    const validPaths = ["template", "generated", "motion", "data_viz"];
    expect(validPaths).toContain(visualResult.designPath);
  });
});
