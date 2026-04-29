/**
 * Seed: NicheTemplate presets
 *
 * Five built-in templates that bootstrap a Workspace with sensible defaults
 * for trend sources, persona blueprint, and prompt context.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type NicheSeed = {
  niche: string;
  displayName: string;
  description: string;
  iconEmoji: string;
  defaultKeywords: string[];
  defaultSources: Record<string, unknown>;
  promptHints: string;
  defaultPersona: Record<string, unknown>;
  redditSubs: string[];
  categories: string[];
};

const NICHES: NicheSeed[] = [
  {
    niche: "music",
    displayName: "음악 매거진",
    description: "K-pop, indie, hip-hop, classical 등 음악 전반을 다루는 매체",
    iconEmoji: "🎵",
    defaultKeywords: ["K-pop", "신곡", "앨범 리뷰", "콘서트", "indie"],
    defaultSources: {
      google: true,
      youtube: true,
      reddit: true,
      naverDataLab: true,
      naverSearch: true,
      spotify: true,
      hackernews: false,
      instagramRef: true,
    },
    promptHints:
      "당신은 한국 음악·문화 매거진의 에디터입니다. K-pop, 인디, 힙합, 클래식 등 음악 전반을 분석적이면서도 따뜻한 톤으로 다룹니다. 음악 용어는 일상어로 풀어 쓰고, 출처를 명시합니다.",
    defaultPersona: {
      perspective: "1인칭 복수",
      expertiseAreas: ["K-pop", "indie", "음악 이론", "프로듀싱"],
      tone: { formality: 0.6, humor: 0.3, emotion: 0.7, energy: 0.6 },
      emotionalDrivers: ["curiosity", "nostalgia", "discovery"],
      contentRules: {
        always: ["출처 명시", "음악 용어 풀어쓰기"],
        never: ["비속어", "단정적 평가"],
      },
    },
    redditSubs: ["kpop", "khiphop", "koreanmusic", "indieheads", "hiphopheads"],
    categories: ["artist", "label", "venue", "media", "festival"],
  },
  {
    niche: "tech",
    displayName: "테크 트렌드",
    description: "개발, 스타트업, AI, 프로덕트 트렌드를 빠르게 전달하는 매체",
    iconEmoji: "💻",
    defaultKeywords: ["AI", "스타트업", "개발자", "오픈소스", "프로덕트"],
    defaultSources: {
      google: true,
      youtube: true,
      reddit: true,
      naverDataLab: false,
      naverSearch: true,
      spotify: false,
      hackernews: true,
      instagramRef: false,
    },
    promptHints:
      "당신은 한국 기술 매거진의 에디터입니다. 개발, 스타트업, AI, 프로덕트 트렌드를 다룹니다. 기술 용어는 정확하게 사용하되, 비전공자도 이해할 수 있게 설명합니다. 출처와 1차 자료를 우선합니다.",
    defaultPersona: {
      perspective: "1인칭 단수",
      expertiseAreas: ["AI", "프로덕트", "스타트업", "개발 문화"],
      tone: { formality: 0.5, humor: 0.4, emotion: 0.4, energy: 0.7 },
      emotionalDrivers: ["curiosity", "discovery", "insight"],
      contentRules: {
        always: ["1차 자료 인용", "기술 용어 정의"],
        never: ["과장된 marketing 톤", "검증 안 된 주장"],
      },
    },
    redditSubs: ["programming", "technology", "MachineLearning", "startups", "webdev"],
    categories: ["company", "developer", "vc", "newsletter", "podcast"],
  },
  {
    niche: "fashion",
    displayName: "패션·뷰티",
    description: "패션, 스타일, 뷰티 트렌드를 큐레이션하는 매체",
    iconEmoji: "👗",
    defaultKeywords: ["패션 트렌드", "스트릿 패션", "뷰티", "코디", "브랜드"],
    defaultSources: {
      google: true,
      youtube: true,
      reddit: true,
      naverDataLab: true,
      naverSearch: true,
      spotify: false,
      hackernews: false,
      instagramRef: true,
    },
    promptHints:
      "당신은 한국 패션·뷰티 매거진의 에디터입니다. 트렌드를 따라가되, 일시적 유행과 본질적 변화를 구분합니다. 시각적 묘사를 풍부하게 사용하고, 브랜드와 디자이너 출처를 명시합니다.",
    defaultPersona: {
      perspective: "1인칭 단수",
      expertiseAreas: ["패션", "스타일링", "뷰티", "브랜드"],
      tone: { formality: 0.4, humor: 0.5, emotion: 0.7, energy: 0.6 },
      emotionalDrivers: ["aspiration", "discovery", "self-expression"],
      contentRules: {
        always: ["브랜드/디자이너 출처", "시각적 묘사"],
        never: ["바디 셰이밍", "특정 체형 강요"],
      },
    },
    redditSubs: ["streetwear", "femalefashionadvice", "malefashionadvice", "beauty", "koreanbeauty"],
    categories: ["brand", "designer", "boutique", "media", "influencer"],
  },
  {
    niche: "lifestyle",
    displayName: "라이프스타일",
    description: "여행, 음식, 인테리어, 웰빙 등 일상의 영감을 전달하는 매체",
    iconEmoji: "🌿",
    defaultKeywords: ["여행", "맛집", "인테리어", "웰빙", "취미"],
    defaultSources: {
      google: true,
      youtube: true,
      reddit: true,
      naverDataLab: true,
      naverSearch: true,
      spotify: false,
      hackernews: false,
      instagramRef: true,
    },
    promptHints:
      "당신은 라이프스타일 매거진의 에디터입니다. 여행, 음식, 인테리어, 웰빙 등 일상의 작은 발견을 따뜻하고 진정성 있는 톤으로 다룹니다. 추천에는 항상 이유와 맥락을 곁들입니다.",
    defaultPersona: {
      perspective: "1인칭 단수",
      expertiseAreas: ["여행", "음식", "인테리어", "웰빙"],
      tone: { formality: 0.4, humor: 0.5, emotion: 0.8, energy: 0.5 },
      emotionalDrivers: ["comfort", "discovery", "nostalgia"],
      contentRules: {
        always: ["추천 이유 설명", "개인 경험 인용"],
        never: ["과도한 PPL", "검증 안 된 건강 정보"],
      },
    },
    redditSubs: ["lifestyle", "Cooking", "DesignPorn", "travel", "wellness"],
    categories: ["place", "brand", "creator", "media", "community"],
  },
  {
    niche: "custom",
    displayName: "빈 워크스페이스",
    description: "원하는 도메인을 직접 정의해서 사용하는 워크스페이스",
    iconEmoji: "✨",
    defaultKeywords: [],
    defaultSources: {
      google: true,
      youtube: false,
      reddit: false,
      naverDataLab: false,
      naverSearch: true,
      spotify: false,
      hackernews: false,
      instagramRef: false,
    },
    promptHints: "",
    defaultPersona: {
      perspective: "1인칭 단수",
      expertiseAreas: [],
      tone: { formality: 0.5, humor: 0.5, emotion: 0.5, energy: 0.5 },
      emotionalDrivers: [],
      contentRules: { always: [], never: [] },
    },
    redditSubs: [],
    categories: [],
  },
];

async function main() {
  console.log("Seeding NicheTemplates...");

  for (const seed of NICHES) {
    await prisma.nicheTemplate.upsert({
      where: { niche: seed.niche },
      update: {
        displayName: seed.displayName,
        description: seed.description,
        iconEmoji: seed.iconEmoji,
        defaultKeywords: seed.defaultKeywords,
        defaultSources: seed.defaultSources,
        promptHints: seed.promptHints,
        defaultPersona: seed.defaultPersona,
        redditSubs: seed.redditSubs,
        categories: seed.categories,
      },
      create: {
        niche: seed.niche,
        displayName: seed.displayName,
        description: seed.description,
        iconEmoji: seed.iconEmoji,
        defaultKeywords: seed.defaultKeywords,
        defaultSources: seed.defaultSources,
        promptHints: seed.promptHints,
        defaultPersona: seed.defaultPersona,
        redditSubs: seed.redditSubs,
        categories: seed.categories,
      },
    });
    console.log(`  ${seed.iconEmoji} ${seed.niche} — ${seed.displayName}`);
  }

  const count = await prisma.nicheTemplate.count();
  console.log(`\nDone. Total NicheTemplates: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
