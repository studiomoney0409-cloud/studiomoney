# Web Magazine Studio — 프로젝트 개요

> AI가 기획하고, 사람이 결정하는 음악/문화 웹 매거진 플랫폼

---

## 1. 철학

### 핵심 가치

**"End-to-End AI Automation with Human Oversight"**

Web Magazine Studio는 콘텐츠의 전 생애주기를 AI가 자율 운영하되, 핵심 의사결정에는 사람이 개입하는 구조를 추구한다.

| 원칙 | 설명 |
|------|------|
| **AI-First** | 트렌드 탐색 → 기획 → 작성 → 디자인 → 발행 → 분석까지 AI 에이전트가 수행 |
| **Human-in-the-Loop** | 콘텐츠 품질 게이트, 이미지 선택, 디자인 승인 등 핵심 지점에 사람 검수 |
| **Quality over Speed** | 4단계 파이프라인과 점수 기반 품질 게이트로 자동 발행 품질 보장 |
| **Data-Driven** | 게시물 성과 데이터가 다음 콘텐츠의 주제·스타일·발행 시간에 반영 |
| **Music Specialization** | K-pop/음악/문화에 특화된 Knowledge Graph와 PostType 분기 |

### 왜 이 프로젝트인가

1인 또는 소규모 팀이 **전문 매거진 수준의 콘텐츠를 지속적으로 생산**하기 위해 만들어졌다. 트렌드 감지부터 SNS 발행까지 수동 작업을 최소화하면서도, AI가 만든 결과물이 사람의 감수성과 브랜드 일관성을 유지하도록 설계되어 있다.

---

## 2. 핵심 기능

### 2.1 자율 멀티 에이전트 시스템 (6 Agents)

6개의 AI 에이전트가 각자의 도메인을 담당하며 자율적으로 운영된다.

```
┌─────────────────────────────────────────────────┐
│              Chief Editor (Claude Sonnet)        │
│         전략 기획 · 주간 테마 · 긴급 대응         │
└────────────┬────────────────────┬────────────────┘
             │                    │
     ┌───────▼──────┐    ┌───────▼──────┐
     │ Trend Scout  │    │ Growth       │
     │ 30분 주기    │    │ Analyst      │
     │ 트렌드 스캔  │    │ 일일 성과    │
     └───────┬──────┘    └───────┬──────┘
             │                    │
     ┌───────▼──────┐    ┌───────▼──────┐
     │ Content      │    │ Community    │
     │ Producer     │    │ Manager      │
     │ 기사/캡션    │    │ 댓글/DM      │
     └───────┬──────┘    │ 감성 분석    │
             │           └──────────────┘
     ┌───────▼──────┐
     │ Design       │
     │ Director     │
     │ 비주얼 자동  │
     └──────────────┘
```

- **Chief Editor**: Claude Sonnet 기반 전략 의사결정 (주간 테마, 일일 배정, 긴급 속보 대응)
- **Trend Scout**: 30분 주기로 Google Trends, Instagram, YouTube에서 실시간 트렌드 감지
- **Content Producer**: 기사·캡션 생성 + 품질 점수 게이트 (75점↑ 자동발행, 50~74점 수동검수)
- **Design Director**: 성과 높은 스타일을 학습하여 비주얼 자동 생성
- **Growth Analyst**: 일일 성과 모니터링, LLM 비용 추적, 예산 알림
- **Community Manager**: 댓글·DM 감성 분석, 자동 응답, 콘텐츠 아이디어 추출

**핵심 혁신**: 트렌드 속도(velocity) 기반 긴급 감지 — velocity ≥ 80이면 즉시 편집장에게 에스컬레이션

### 2.2 4단계 콘텐츠 파이프라인

```
Phase 1          Phase 2          Phase 3          Phase 4
PostType 분기    LLM 슬라이드     사람 검수         슬라이드별
+ Spotify        기획 + 스타일    + 수정           실시간 편집
체크포인트       분석                              + 덱 최종 리뷰
```

| 단계 | 핵심 기능 | 도구 |
|------|----------|------|
| **Phase 1** | PostType별 분기 (앨범, 아티스트, 콘서트, 밈 등) + Spotify 키워드 정합성 체크 | Spotify API |
| **Phase 2** | Claude API로 슬라이드 계획 생성 + 레퍼런스 이미지 스타일 분석 (Claude Vision) | Claude API |
| **Phase 3** | 사람이 LLM 생성 계획을 검토·수정 | Studio UI |
| **Phase 4** | 슬라이드별 실시간 PNG 미리보기 + 2컬럼 에디터 + 캡션/해시태그 최종 편집 | Design Engine |

### 2.3 디자인 시스템 (24 Figma SVG 템플릿)

듀얼 트랙 디자인 전략으로 운영된다.

- **Track 1 — SaaS UI**: Studio 웹앱에서 드래그앤드롭 편집
- **Track 2 — Claude Code `/design` 스킬**: 개발자용 CLI 디자인 생성

**템플릿 카테고리**:
- Cover (3): 히어로 이미지, 미니멀 디자인
- Body (8): 팩트, 인용, 통계, 리스트, 랭킹
- Outro (2): 마무리, CTA
- SNS (5): Instagram, Stories, Twitter, YouTube, 인용구
- Infographic (4): 바 차트, 도넛, 비교, 타임라인

**렌더링**: Figma SVG → 플레이스홀더 치환 → resvg → PNG

**Brand Kit**: Primary #6C5CE7 (퍼플) / Secondary #2D3436 (차콜) / Accent #E17055 (코랄) / 서체 Pretendard

### 2.4 트렌드 인텔리전스

실시간 트렌드 수집 + 점수화 시스템:

- **Google Trends** — 글로벌 트렌드 시그널
- **Instagram 레퍼런스 계정** — 경쟁사 콘텐츠 모니터링
- **YouTube Analytics** — 영상 성과 시그널
- **Spotify API** — 음악 특화 트렌드 (앨범, 아티스트, 장르)

**점수 산출**: 기본 0~100점 + 트래픽 보너스 (log10 × 8) + 카테고리 보너스 (음악/라이프스타일 +10) + 일반 키워드 패널티 (-30)

### 2.5 멀티 플랫폼 퍼블리싱

10개 이상 플랫폼 동시 배포:

Threads · Instagram · X/Twitter · YouTube · TikTok · LinkedIn · WordPress · Facebook · Pinterest · Telegram

- 플랫폼별 텍스트 자동 변환 (캡션 길이, 해시태그 규칙)
- 분석 기반 최적 발행 시간 자동 스케줄링
- 게시물별 성과 추적 (조회수, 좋아요, 댓글, 공유, 참여율)

### 2.6 음악 Knowledge Graph

음악 도메인 전문성을 위한 관계형 지식 그래프:

- `MusicArtist` — Spotify/MusicBrainz ID, 장르, 인기도
- `MusicAlbum` — 발매일, 트랙 수, 아트워크
- `MusicTrack` — 트랙 메타데이터
- `ArtistRelation` — 아티스트 간 관계 (콜라보, 피처링, 영향)
- `MusicGenre` — 장르 분류 체계

### 2.7 커뮤니티 관리 자동화

- 댓글/DM 감성 분류 (긍정/중립/부정)
- 우선순위 태깅 (일반/높음/긴급)
- LLM 기반 맥락적 자동 응답
- "골든 타임" 응답 최적화
- 키워드 캠페인 관리 (일일 한도, 스케줄링)

---

## 3. 기술 스택

### 코어

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16, React 19, TypeScript 5.9 |
| 데이터베이스 | PostgreSQL (Neon) + Prisma 7.4 |
| 캐시 | Redis (ioredis) |
| 인증 | Clerk |

### AI / LLM

| 모델 | 용도 |
|------|------|
| Claude Sonnet (Anthropic) | 전략 의사결정, 슬라이드 기획, 디자인 비전 평가 |
| GPT-4o / GPT-4o-mini (OpenAI) | 콘텐츠 생성, 점수 산출, 일반 태스크 |
| Gemini (Google) | 보조 LLM |
| FAL AI | 이미지 생성 |

### 디자인 / 렌더링

| 도구 | 용도 |
|------|------|
| Satori | HTML → SVG/PNG |
| Sharp | 이미지 처리 |
| Remotion | 영상 렌더링 |
| resvg | SVG → PNG |
| jsPDF | PDF 생성 |

### 인프라

| 도구 | 용도 |
|------|------|
| Inngest | 이벤트 드리븐 비동기 잡 오케스트레이션 |
| Pino | 구조화된 로깅 |
| Sentry | 에러 추적 |

---

## 4. 아키텍처

```
┌─────────────────────────────────────────────────────┐
│               Studio UI (Next.js)                    │
│   대시보드 · 에디터 · 디자인 · 분석 · 에이전트 모니터  │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   API Routes     Inngest         Webhooks
        │         Event Bus          │
        └──────────────┼──────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
  6 AI Agents    Content Pipeline    Design Engine
  (자율 운영)    (4단계 품질 게이트)   (24 SVG 템플릿)
     │                 │                 │
     └─────────────────┼─────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   PostgreSQL       Redis          Storage
   (Neon)         (Cache/Queue)    (Local)
```

### 핵심 데이터 흐름

**콘텐츠 생성**:
```
트렌드 감지 → 토픽 선정 → Phase 1~4 파이프라인 → 디자인 렌더링 → 캡션 생성 → 번들
```

**발행**:
```
품질 게이트 (75점↑ 자동/50~74 수동) → 플랫폼별 변환 → 최적 시간 스케줄링 → 발행 → 성과 추적 → 피드백 루프
```

**에이전트 사이클**:
```
Trend Scout (30분) → Chief Editor (매일 09:00) → Content Producer → Design Director → 발행 → Growth Analyst (22:00) → Community Manager (10분) → 피드백 → Editor
```

---

## 5. 이미지 소싱 전략

안전하고 합법적인 이미지 사용을 위한 캐스케이딩 폴백:

```
로컬 파일 → Spotify API → Unsplash → Google Images → DALL-E (AI 생성)
```

- 리스크 점수 기반 사용권 위반 방지
- 출처 추적 및 크레딧 자동 기록
- Image Gate: 사람이 최종 이미지를 선택하는 휴먼 게이트

---

## 6. 품질 보증 체계

### 다층 품질 게이트

1. **콘텐츠 품질 점수**: 관련성, 정확성, 문체, 구조, 가독성 5개 차원 평가
2. **자동 발행 기준**: 75점↑ 자동, 50~74점 수동 검수, 50점↓ 반려
3. **디자인 QA**: Claude Vision으로 텍스트 가독성, 레이아웃, 브랜드 일관성, 이미지 품질 평가
4. **자동 수정 루프**: 슬라이드당 최대 2회 자동 재시도 (텍스트 잘림, 폰트 크기, 세이프 영역)
5. **결정론적 필터**: 저작권 체크, 출처 표기 요건, 하드 필터

---

## 7. 프로젝트 구조

```
Web_magazine/
├── apps/studio/                 # 메인 Next.js 앱
│   ├── src/app/                 # 라우트 핸들러 + 페이지
│   ├── src/lib/
│   │   ├── agents/              # 6개 AI 에이전트
│   │   ├── design/              # 디자인 엔진 (18개 모듈)
│   │   ├── pipeline/            # 콘텐츠 파이프라인
│   │   ├── trends/              # 트렌드 수집
│   │   ├── inngest/             # 비동기 잡 함수
│   │   └── llm.ts               # LLM 호출 헬퍼
│   └── prisma/schema.prisma     # 데이터 모델
├── agents/                      # 에이전트 모듈별 디렉터리
│   ├── cardnews-composition/    # 비주얼 디자인 렌더링
│   ├── topic-intelligence/      # 토픽 발굴·보강
│   ├── content-structuring/     # 기사 생성·리라이트
│   ├── trend-signals/           # 트렌드 감지
│   ├── safe-image-acquisition/  # 이미지 소싱
│   └── publish-bundle/          # 발행 준비
└── docs/                        # 문서
```

---

## 8. 차별화 포인트

1. **전략 AI + 전술 AI 분리**: Chief Editor(Claude)가 전략, 나머지 에이전트(GPT)가 실행
2. **속도 기반 긴급 감지**: 트렌드 velocity 지표로 속보 자동 대응
3. **음악 특화 Knowledge Graph**: Spotify 연동 아티스트/앨범/장르 관계망
4. **스타일 자동 학습**: 게시물 성과 데이터로 디자인 스타일 자동 진화
5. **Vision AI 디자인 리뷰**: Claude Vision이 렌더링 결과를 평가하고 자동 수정
6. **이미지 안전 게이트**: AI 추천 + 사람 최종 선택의 하이브리드 구조
7. **이벤트 드리븐 오케스트레이션**: Inngest로 장애 내성 있는 비동기 실행
