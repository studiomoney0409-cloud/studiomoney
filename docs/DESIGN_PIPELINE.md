# 디자인 파이프라인

> 콘텐츠 완성 후 이미지 검색 → 디자인 초안 → 평가 → 최종 이미지 확정까지의 전체 흐름

**최종 업데이트**: 2026-04-09

---

## 1. 전체 흐름

```
콘텐츠 완성 (content-producer)
  │
  ▼
① 이미지 큐레이션 ─── 4개 소스 병렬 검색 → 12장 후보
  │
  ▼
② 이미지 게이트 ───── 사람이 이미지 선택/승인 (유일한 수동 단계)
  │
  ▼
③ 디자인 디렉터 ───── 콘텐츠 분석 → DesignBrief 생성
  │
  ▼
④ 비주얼 디자이너 ── 템플릿 or LLM → 슬라이드 HTML 생성
  │
  ▼
⑤ 렌더링 ──────────── Satori + Resvg → PNG
  │
  ▼
⑥ 디자인 크리틱 ───── Vision LLM이 5차원 채점
  │
  ├── 8.0+ → PASS ✓ → ⑧로
  ├── 6.0~7.9 → REFINE → ⑦로
  └── < 6.0 → REGENERATE → ④로 (1회)
  │
  ▼
⑦ 리파인먼트 루프 ── 수정 → 재렌더 → 재평가 (최대 3회)
  │
  ▼
⑧ 퍼블리싱 브릿지 ── 플랫폼별 포맷 변환 → SNS 발행
```

---

## 2. 진입점 (트리거)

| 트리거 | 경로 | 설명 |
|--------|------|------|
| Inngest 이벤트 | `agent/image-gate.selected` | 이미지 게이트 승인 후 자동 실행 (**메인 플로우**) |
| Inngest 이벤트 | `agent/monetization-manager.content-ready` | 수익화 게이트 통과 후 |
| HTTP API | `POST /api/design/generate` | UI에서 수동 호출 |
| UI 편집 | `/studio/design` | 디자인 에디터에서 직접 편집 |

**Inngest 오케스트레이션 함수**: `src/lib/inngest/functions/design-director.ts`

---

## 3. 단계별 상세

### ① 이미지 큐레이션

**파일**: `src/lib/agents/image-curator.ts`

콘텐츠 프로듀서 완료 시 자동 실행.

**처리 흐름**:
1. 토픽에서 LLM으로 검색 키워드 추출
2. 4개 소스 병렬 검색:

| 소스 | 용도 | 환경변수 |
|------|------|----------|
| Google CSE | 웹 이미지 전반 | `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` |
| Unsplash | 에디토리얼 사진 | `UNSPLASH_ACCESS_KEY` |
| Spotify | 앨범 아트 | `SPOTIFY_CLIENT_ID` + `SECRET` |
| Pexels | 무료 사진 (백업) | `PEXELS_API_KEY` |

3. 중복 제거 후 **12장 후보** 선정
4. DB `ImageGate` 레코드 생성 (status: `pending`)

**출력**: `ImageGate { candidateUrls: string[], status: "pending" }`

---

### ② 이미지 게이트

**파일**: `src/app/api/agents/image-gate/route.ts`

**파이프라인에서 사람이 개입하는 유일한 지점**.

| HTTP | 동작 |
|------|------|
| `GET` | 대기 중인 ImageGate 목록 조회 |
| `PATCH` | 이미지 선택 (`selectedUrls`) 또는 스킵 |

승인 시:
- `ImageGate.status` → `"selected"`
- Inngest 이벤트 발행: `agent/image-gate.selected`
- 디자인 디렉터가 선택된 이미지를 받아 작업 시작

---

### ③ 디자인 디렉터

**파일**: `src/lib/design/design-director.ts`

콘텐츠를 분석하여 **DesignBrief** (디자인 설계서)를 생성.

**입력**:
- topic, content, contentSlides (필수)
- referenceImageUrl, StyleToken (선택 — 레퍼런스 이미지 있을 때)
- sourceImages (이미지 게이트에서 선택된 이미지)
- 과거 성과 데이터 (style-performance)

**LLM**: gpt-4o-mini

**DesignBrief 주요 필드**:

```typescript
{
  contentType: "album_review" | "artist_spotlight" | "trending"
             | "data_insight" | "list_ranking" | "general",
  mood: string,           // "에너지틱하면서 세련된"
  keyMessage: string,     // 핵심 메시지
  visualConcept: string,  // "네온 글로우 + 미니멀"
  colorDirection: {
    primary: string,      // hex (#6C5CE7)
    mood: "warm" | "cool" | "vibrant" | "muted" | "dark" | "pastel"
  },
  layoutStyle: "editorial" | "bold" | "minimal" | "data-driven" | "immersive",
  typographyMood: "serif_classic" | "sans_modern" | "display_impact" | "handwritten",
  outputs: OutputPlan[],  // 생성할 포맷 목록
  styleToken?: StyleToken // 레퍼런스에서 추출된 스타일
}
```

**OutputPlan 예시**: card_news (Instagram), sns_image (Twitter), cover, motion

#### 스타일 참조 시스템

레퍼런스 이미지가 있으면 **Style Transfer** (`style-transfer.ts`)가 Vision LLM으로 StyleToken 추출:

```typescript
StyleToken {
  colors: { palette: hex[], ratios: number[], gradient?: string },
  typography: { mood: string, weight: string, style: string },
  layout: { density: string, alignment: string, whitespace: string },
  effects: string[],      // "grain", "blur", "glow" 등
  moodKeywords: string[]
}
```

추출된 StyleToken은 **Style Memory** (`style-memory.ts`)에 캐시 (LRU + DB).
키: `"artist:{spotifyId}"`, `"album:{spotifyId}"`

---

### ④ 비주얼 디자이너

**파일**: `src/lib/design/visual-designer.ts` (~513줄)

DesignBrief를 받아 실제 슬라이드 HTML을 생성. **두 가지 경로** 중 선택.

#### Path A: 템플릿 기반 (기본, 빠르고 안정적)

```
contentType에 맞는 템플릿 시퀀스 선택
  → LLM으로 스타일 오버라이드 생성 (색상, 폰트)
  → 슬라이드별 renderSpec 생성
  → 템플릿에 renderSpec 적용
```

**사용 가능한 템플릿** (25개+):

| 카테고리 | 템플릿 ID |
|----------|-----------|
| 커버 | `cover.hero.v1`, `cover.hero.v2`, `cover.minimal.v1`, `cover.photo.v1` |
| 본문 | `body.fact.v1`~`v4`, `body.quote.v1`, `body.stat.v1`, `body.list.v1`, `body.ranking.v1`, `body.highlight.v1` |
| SNS | `sns.square.v1`, `sns.story.v1`, `sns.twitter.v1`, `sns.youtube.v1` |
| 아웃트로 | `end.outro.v1`, `end.cta.v1` |

- 소스 이미지 있으면 photo-first 시퀀스 우선 선택
- Figma SVG 템플릿 (placeholder 치환) 또는 Satori HTML 방식

#### Path B: LLM 생성 (창의적, `preferGenerated: true` 시)

```
LLM이 인라인 스타일 HTML 직접 생성
  → Satori Sanitizer로 호환성 검증
  → 미지원 CSS 자동 제거
```

**Satori 제약사항** (`satori-sanitizer.ts`):
- Flexbox만 가능 (no grid)
- px 단위만
- transform, filter, animation, backdrop-filter 불가

#### 분기: 포맷별 추가 경로

| 포맷 | 모듈 | 설명 |
|------|------|------|
| **커버 이미지** | `pipeline/cover-image.ts` + `image-gen.ts` | LLM이 프롬프트 생성 → DALL-E 3 또는 Flux로 AI 이미지 생성 |
| **데이터 시각화** | `design/data-viz-agent.ts` | 데이터 추출 → 차트 자동 선택 (bar/donut/radar/treemap 등) → SVG 생성 |
| **모션 그래픽** | `design/motion-designer.ts` + `motion-render-pipeline.ts` | Remotion 컴포지션 선택 → Lambda 렌더링 → 비디오 |

##### 이미지 생성 라우팅 (`image-gen.ts`)

| 프로바이더 | 용도 | 비용 |
|-----------|------|------|
| DALL-E 3 | 텍스트 포함 이미지, 타이포그래피 | $0.04~0.08/장 |
| Flux Pro | 포토리얼리스틱, 에디토리얼 | $0.08/장 |
| Flux Schnell | 빠른 프리뷰, 썸네일 | $0.003/장 |

자동 라우팅: 텍스트 → DALL-E, 사진풍 → Flux Pro, 프리뷰 → Flux Schnell

---

### ⑤ 렌더링

**파일**: `src/app/api/design/render/route.ts` + `agents/shared/render.ts`

```
슬라이드 HTML
  → JSX style={{}} → CSS style="" 변환
  → Satori (HTML → SVG)
  → Resvg (SVG → PNG)
```

- LRU 캐시 100개 (동일 입력 재렌더 방지)
- Figma SVG 경로: placeholder 치환 → resvg 직접 렌더

---

### ⑥ 디자인 크리틱

**파일**: `src/lib/design/design-critic.ts`

**Vision LLM**이 렌더링된 PNG 이미지를 직접 보고 **5차원 평가** (각 1~10점):

| 차원 | 평가 내용 |
|------|----------|
| **VISUAL_HIERARCHY** | 시선 흐름, 대비, 포커스 포인트 |
| **BRAND_CONSISTENCY** | 색상/타이포/아이덴티티 일관성 |
| **READABILITY** | 텍스트 대비, 정보 밀도, 폰트 크기 |
| **AESTHETIC_QUALITY** | 여백, 정렬, 색상 조화, 균형 |
| **PLATFORM_FIT** | 비율, 세이프존, 썸네일 가독성 |
| (선택) COMPETITIVE_EDGE | 벤치마크 대비 경쟁력 |

**판정 기준**:

| 평균 점수 | 판정 | 다음 행동 |
|----------|------|----------|
| **≥ 8.0** | PASS | 완료 → ⑧ 퍼블리싱 브릿지로 |
| **6.0 ~ 7.9** | REFINE | ⑦ 리파인먼트 루프로 |
| **< 6.0** | REGENERATE | ④ 비주얼 디자이너부터 재시작 (1회만) |

벤치마크 데이터 (`benchmark.ts`): 과거 품질 기록 + 스타일별 성과를 기준선으로 사용.

---

### ⑦ 리파인먼트 루프

**파일**: `src/lib/design/refinement-loop.ts`

```
REFINE 판정 받은 디자인
  → Edit Interpreter가 크리틱 피드백 해석
  → 수정된 HTML 생성
  → 재렌더링
  → 재평가
  → PASS이면 완료, 아니면 반복
```

**Edit Interpreter** (`edit-interpreter.ts`):
- 템플릿 경로: 피드백 파싱 → renderSpec 수정 → 재렌더
- LLM 생성 경로: HTML + 피드백 → LLM이 수정된 HTML 생성

**종료 조건** (어느 하나라도 충족 시 중단):
1. 점수 ≥ 8.0 (PASS)
2. 최대 반복 횟수 도달 (기본: 3회)
3. 점수 하락 감지 (이전보다 나빠지면 최적 버전 반환)
4. REGENERATE 이미 1회 사용

**출력**: `RefinementResult` — 반복 이력 + 최종(최고 점수) 디자인

---

### ⑧ 퍼블리싱 브릿지

**파일**: `src/lib/design/publish-bridge.ts`

최종 승인된 디자인을 SNS 발행 형식으로 변환:

1. 모든 슬라이드 → PNG data URI로 렌더
2. 플랫폼별 캡션 생성 (글자 수 제한 적용)
3. 해시태그 포맷팅 (플랫폼별 규칙)
4. `Publication` 레코드 생성
5. SNS Publishing 시스템으로 전달 (`/api/agents/auto-publish`)

---

## 4. 보조 시스템

### 4.1 브랜드 킷 (`design/brand-kit.ts`)

디자인 전체의 단일 참조점 (Single Source of Truth):
- **기본 색상**: #6C5CE7 (퍼플) + #E17055 (코랄 액센트)
- 타이포그래피 규칙 (폰트, 크기, 무드)
- 레이아웃 규칙 (마진, 모서리 반경, 세이프 에어리어)
- 에셋 (로고, 워터마크)

### 4.2 폰트 시스템 (`design/fonts.ts`)

6가지 **FontMood**:

| Mood | 느낌 |
|------|------|
| bold-display | 임팩트, 헤드라인 |
| clean-sans | 깔끔, 모던 |
| editorial | 매거진, 클래식 |
| playful | 경쾌, 재미 |
| minimal | 절제, 여백 |
| impact | 강렬, 대비 |

웹 폰트: Black Han Sans, Noto Sans KR, Noto Serif KR (layout.tsx에서 로드)

### 4.3 스타일 퍼포먼스 추적 (`design/style-performance.ts`)

- 디자인 스타일별 참여율(engagement) 추적
- 기록 항목: templateId, platform, colorMood, layoutStyle, typographyMood
- 디자인 디렉터에게 "성과 좋은 스타일" 추천 제공
- DB: `StylePerformanceEntry` 모델

### 4.4 품질 저장소 (`design/quality-store.ts`)

- 이중 저장: 인메모리 LRU + Prisma DB
- 기록 항목: 점수(5차원), 판정, 반복 횟수, 비용
- 분석: 콘텐츠 유형별, 플랫폼별, 디자인 경로별 통계
- 시간에 따른 품질 트렌드 분석
- DB: `DesignQualityEntry` 모델

---

## 5. 모듈 파일 맵

### 핵심 디자인 엔진 (`src/lib/design/`)

| 파일 | 역할 | 파이프라인 단계 |
|------|------|---------------|
| `design-director.ts` | DesignBrief 생성 | ③ |
| `visual-designer.ts` | 슬라이드 HTML 생성 | ④ |
| `design-critic.ts` | Vision LLM 5차원 평가 | ⑥ |
| `refinement-loop.ts` | 반복 수정 오케스트레이션 | ⑦ |
| `edit-interpreter.ts` | 피드백 → 수정 적용 | ⑦ |
| `style-transfer.ts` | 레퍼런스 이미지 스타일 추출 | ③ 입력 |
| `style-memory.ts` | StyleToken 캐시 (LRU + DB) | ③ 입력 |
| `brand-kit.ts` | 브랜드 색상/타이포/레이아웃 | ③④ |
| `fonts.ts` | FontMood 정의 | ④ |
| `satori-sanitizer.ts` | 미지원 CSS 제거 | ④⑤ |
| `data-viz-agent.ts` | 데이터 차트 생성 | ④ 분기 |
| `motion-designer.ts` | 모션 그래픽 설계 | ④ 분기 |
| `motion-render-pipeline.ts` | Remotion 렌더 오케스트레이션 | ④ 분기 |
| `motion-skills.ts` | Remotion 컴포지션 라이브러리 | ④ 분기 |
| `motion-skill-detector.ts` | 콘텐츠→모션 기법 매핑 | ④ 분기 |
| `spotify-style-extractor.ts` | Spotify 앨범아트 스타일 추출 | ③ 입력 |
| `style-performance.ts` | 스타일별 참여율 추적 | ⑧ 이후 |
| `quality-store.ts` | 품질 기록 저장/분석 | ⑥⑦ 이후 |
| `benchmark.ts` | 과거 데이터 벤치마크 | ⑥ 입력 |
| `publish-bridge.ts` | SNS 발행 포맷 변환 | ⑧ |

### API 엔드포인트 (`src/app/api/design/`)

| 경로 | 메서드 | 역할 |
|------|--------|------|
| `/api/design/generate` | POST | 디자인 생성 메인 엔트리 |
| `/api/design/render` | POST | HTML → PNG 렌더링 |
| `/api/design/critique` | POST | 디자인 평가 요청 |
| `/api/design/images` | GET | 이미지 통합 검색 |
| `/api/design/performance` | GET | 스타일 성과 데이터 |
| `/api/design/brand-kit` | GET/PUT | 브랜드 킷 조회/수정 |
| `/api/design/chat` | POST | 디자인 AI 채팅 |
| `/api/agents/image-gate` | GET/PATCH | 이미지 게이트 관리 |

### 에이전트

| 파일 | 역할 |
|------|------|
| `src/lib/agents/design-director-agent.ts` | 디자인 디렉터 에이전트 (Inngest 연동) |
| `src/lib/agents/image-curator.ts` | 이미지 큐레이션 에이전트 |
| `src/lib/inngest/functions/design-director.ts` | Inngest 이벤트 핸들러 |

### 템플릿 (`agents/shared/templates/`)

- Figma SVG 파일: `agents/shared/templates/figma/*.svg`
- 레지스트리: `agents/shared/templates/figma/_registry.json`
- 템플릿 인덱스: `agents/shared/templates/index.ts`

### 독립 에이전트 (`agents/cardnews-composition/`)

단일 카드뉴스 슬라이드 생성 (1080x1350 Instagram 카드):
```
validated-post.json + topic.json
  → preflight (검증)
  → map (템플릿 선택 + 슬롯 매핑)
  → html (HTML 생성)
  → png (Satori+Resvg 또는 Playwright 렌더)
  → finalize (캡션 + manifest)
```

---

## 6. 관련 DB 모델

| 모델 | 용도 |
|------|------|
| `DesignEntry` | 완성된 디자인 저장 (HTML, imageDataUri, fontMood) |
| `DesignProject` | 디자인 프로젝트 단위 관리 |
| `ImageGate` | 이미지 선택 게이트 (후보 이미지, 선택 상태) |
| `ImageGenHistory` | AI 이미지 생성 기록 (비용, 소요시간, 프롬프트) |
| `StyleMemoryEntry` | 아티스트/앨범별 StyleToken 캐시 |
| `DesignQualityEntry` | 디자인 품질 평가 기록 |
| `StylePerformanceEntry` | 스타일별 참여율 성과 |
| `BenchmarkReport` | 벤치마크 집계 리포트 |
| `BrandKit` | 브랜드 색상/타이포/에셋 |
