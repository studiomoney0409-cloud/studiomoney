# Claude Code Skill 마이그레이션 계획

> 기존 Next.js + Vercel + 12-Agent 시스템을 Claude Code Skill 기반 로컬 워크플로우로 전환하는 전체 계획

**작성일**: 2026-04-08
**현재 상태**: 계획 수립 완료, 구현 전

---

## 1. 전환 개요

### AS-IS (현재)
- Next.js + Prisma + PostgreSQL + Redis + Vercel
- 12개 TypeScript 에이전트 (OpenAI gpt-4o-mini 기반)
- Inngest 큐 + Vercel Cron 스케줄링
- 인프라 비용: Vercel + DB + Redis + OpenAI API

### TO-BE (목표)
- Claude Code Skills + Schedule (로컬 실행)
- 마크다운 파일 기반 데이터 (Git 관리)
- Claude 자체가 모든 에이전트 역할 수행
- 인프라 비용: Claude API만 (이미 구독에 포함)

### 제거 대상
| 현재 구성 | 대체 |
|-----------|------|
| Vercel 서버 | 불필요 (로컬) |
| PostgreSQL + Prisma | 마크다운 파일 + Git |
| Redis 캐시 | 파일 시스템 |
| Inngest 큐 | Claude /schedule |
| OpenAI API | Claude API (내장) |
| 12개 에이전트 코드 | Claude Skill |
| Next.js 대시보드 | 터미널 기반 |

### 유지 대상
- SNS API 연동 (Threads, Instagram, X) — 발행에 필수
- 이미지 생성 API (fal.ai / Replicate)
- Spotify API (음악 데이터)

---

## 2. 데이터 디렉토리 구조

```
data/
├── trends/              # 일일 트렌드 스캔 결과
│   └── 2026-04-08.md
├── plans/               # 주간 전략 + 일일 브리핑
│   ├── week-2026-W15.md
│   └── daily-2026-04-08.md
├── reports/             # 성과 리포트
│   ├── weekly-2026-W15.md
│   └── revenue-2026-04.md
├── community/           # 댓글 분석, 답글 초안
│   └── 2026-04-08.md
├── publish/             # 발행 로그
│   └── 2026-04-08.md
├── partnerships/        # 제휴 기회 스캔
│   └── scan-2026-04-08.md
├── personas/            # 글쓰기 페르소나
│   └── persona-name.md
└── designs/             # 디자인 에셋 메타데이터
    └── 2026-04-08-slug.md

content/
├── posts/               # 완성 기사
│   └── 2026-04-08-slug.md
├── newsletters/         # 뉴스레터 HTML
│   └── 2026-W15.html
└── images/              # 커버 이미지
    └── 2026-04-08-slug.png
```

---

## 3. 스킬 전체 목록 (20개)

### 범례
- **◎ 외부 설치**: 기존 스킬로 충분
- **○ 외부 기반 + 커스텀**: 외부 스킬을 래핑/확장
- **● 직접 제작**: 도메인 특화로 직접 작성

---

### 3.1 ◎ 외부 설치 스킬 (5개)

#### `/publish` — SNS 멀티플랫폼 발행

| 항목 | 내용 |
|------|------|
| 대체 대상 | publisher, sns/publish/*, community-manager (발행 부분) |
| 외부 스킬 | **typefully** (typefully/agent-skills) |
| 설치 | `npx skills add typefully/agent-skills --skill typefully` |
| 지원 플랫폼 | X, LinkedIn, Threads, Bluesky, Mastodon |
| 핵심 기능 | 크로스 플랫폼 발행, 자동 스케줄링, 발행 분석, 이미지 첨부 |
| 추가 작업 | Instagram, YouTube는 별도 API 래퍼 필요 |

#### `/cover` — 커버 이미지 생성

| 항목 | 내용 |
|------|------|
| 대체 대상 | pipeline/cover-image, image-gen.ts |
| 외부 스킬 | **replicate** (replicate/skills) |
| 설치 | `npx skills add replicate/skills --skill replicate` |
| 핵심 기능 | Flux/SD 기반 이미지 생성, 모델 선택, 배치 처리 |
| 추가 작업 | 음악 매거진 프롬프트 템플릿 |

#### (리서치 엔진) — 웹 검색 + 스크래핑

| 항목 | 내용 |
|------|------|
| 대체 대상 | pipeline/web-search.ts, fetch-utils.ts |
| 외부 스킬 | **firecrawl-search** + **firecrawl-scrape** (firecrawl/cli) |
| 설치 | `npx skills add firecrawl/cli --skill firecrawl-search` |
| 핵심 기능 | 웹 검색 + 풀페이지 마크다운 추출, JS 렌더링 지원, 뉴스/이미지 필터 |
| 추가 작업 | /trend-scan 에서 내부 도구로 활용 |

#### (비디오) — 프로그래매틱 비디오

| 항목 | 내용 |
|------|------|
| 대체 대상 | pipeline/article-reels.ts, remotion/* |
| 외부 스킬 | **remotion** (remotion-dev/skills) |
| 설치 | `npx skills add remotion-dev/skills --skill remotion` |
| 핵심 기능 | React 기반 비디오, 자막, 애니메이션, 오디오, 3D |
| 추가 작업 | 매거진 릴스 템플릿 |

#### (메타 스킬) — 스킬 제작 도구

| 항목 | 내용 |
|------|------|
| 외부 스킬 | **skill-creator** (anthropics/skills) |
| 설치 | `npx skills add anthropics/skills --skill skill-creator` |
| 핵심 기능 | 스킬 생성/수정/평가/최적화. 블라인드 비교 테스트 |
| 용도 | 아래 커스텀 스킬 제작 시 활용 |

---

### 3.2 ○ 외부 기반 + 커스텀 래핑 (7개)

#### `/write-article` — 콘텐츠 프로듀서

| 항목 | 내용 |
|------|------|
| 대체 대상 | content-producer, pipeline/orchestrator 전체 (research → outline → writer → editor) |
| 기반 스킬 | alirezarezvani **content-production** + **content-humanizer** |
| 커스텀 | 음악 매거진 도메인 특화, 페르소나 3레이어 연동, 한국어 최적화 |
| 파이프라인 | 리서치(firecrawl) → 아웃라인 → 작성 → 인간화 → 품질 게이트 |
| 출력 | `content/posts/YYYY-MM-DD-slug.md` (frontmatter 포함) |
| 트리거 | "기사 작성", "블로그 작성", "/write-article" |

#### `/edit` — 에디터 / 교정

| 항목 | 내용 |
|------|------|
| 대체 대상 | editor-agent, copy-editor agent |
| 기반 스킬 | alirezarezvani **copy-editing** (7단계 교정) + daymade **fact-checker** (5단계 팩트체크) |
| 커스텀 | 한국어 문법/맞춤법, 음악 용어 일관성, 5차원 품질 루브릭 |
| 7 Sweeps | 명확성 → 톤&보이스 → So What → 근거 → 구체성 → 감정 → 리스크 |
| 출력 | 수정된 마크다운 + 품질 리포트 (점수, 피드백) |
| 트리거 | "교정", "검수", "편집", "/edit" |

#### `/seo` — SEO 전략가

| 항목 | 내용 |
|------|------|
| 대체 대상 | seo-strategist agent |
| 기반 스킬 | sanity **seo-aeo-best-practices** + alirezarezvani **ai-seo** + **schema-markup** + **seo-audit** |
| 커스텀 | Article/Person/MusicGroup JSON-LD, 한국 검색엔진(네이버) 최적화 |
| 3 모드 | pre-publish (메타 태그 생성), audit (사이트 전체 감사), aeo (AI 검색 최적화) |
| 출력 | frontmatter SEO 필드 업데이트, 감사 리포트 |
| 트리거 | "SEO", "검색 최적화", "/seo" |

#### `/analytics` — 성장 분석가

| 항목 | 내용 |
|------|------|
| 대체 대상 | growth-analyst agent |
| 기반 스킬 | alirezarezvani **social-media-analyzer** + **analytics-tracking** |
| 커스텀 | 우리 데이터 구조 (마크다운 기반), 플랫폼별 벤치마크 한국 시장 보정 |
| 지표 | 참여율, 팔로워 변화, 토픽별 성과, 에이전트별 비용, ROI |
| 출력 | `data/reports/weekly-YYYY-WNN.md` |
| 트리거 | "분석", "성과", "리포트", "/analytics" |

#### `/community` — 커뮤니티 매니저

| 항목 | 내용 |
|------|------|
| 대체 대상 | community-manager agent |
| 기반 스킬 | alirezarezvani **social-media-manager** + **x-twitter-growth** |
| 커스텀 | SNS API 댓글 수집, 한국어 감정 분석, 자동 답글 생성, 에스컬레이션 |
| X 특화 | 링크 본문 금지 (첫 답글에), 답글 우선 알고리즘 반영 |
| 출력 | `data/community/YYYY-MM-DD.md` |
| 트리거 | "댓글", "커뮤니티", "/community" |

#### `/newsletter` — 뉴스레터 매니저

| 항목 | 내용 |
|------|------|
| 대체 대상 | newsletter-manager agent |
| 기반 스킬 | alirezarezvani **email-sequence** + anthropics **internal-comms** (newsletter 템플릿) |
| 커스텀 | 주간 베스트 콘텐츠 자동 큐레이션, 음악 뉴스 섹션, 독자 세그먼트 |
| 출력 | `content/newsletters/YYYY-WNN.html` |
| 트리거 | "뉴스레터", "/newsletter" |

#### `/design` — 비주얼 디자인 (기존 확장)

| 항목 | 내용 |
|------|------|
| 현재 상태 | **이미 존재** (`.claude/skills/design/SKILL.md`) |
| 보강 스킬 | anthropics **canvas-design** + **theme-factory** |
| 추가 작업 | 캔버스 디자인 모드 추가, 10개 테마 프리셋 통합 |
| 트리거 | "디자인", "카드뉴스", "인스타", "/design" |

---

### 3.3 ● 완전 직접 제작 (5개)

#### `/trend-scan` — 트렌드 스카우트

| 항목 | 내용 |
|------|------|
| 대체 대상 | trend-scout agent, topic-intelligence, fetchTrends() |
| 내부 도구 | firecrawl (웹 검색), /deep-research (빌트인) |
| 소스 | Google Trends, Naver DataLab, Naver Search, YouTube KR, Spotify, Melon |
| 로직 | 소스별 수집 → 속도 감지 → 교차 검증 → 점수화 → 긴급 알림 |
| 출력 | `data/trends/YYYY-MM-DD.md` |
| 트리거 | "트렌드", "스캔", "/trend-scan" |

```markdown
# 출력 형식 예시
---
date: 2026-04-08
scan_time: "09:00 KST"
---

## 긴급 알림
- [velocity: 95] 아이유 신보 발매 — Melon, Naver, YouTube 동시 급상승

## 상위 토픽 (점수순)
1. [85] 아이유 신보 — 앨범 리뷰 + 음악적 변화 분석
2. [72] 인디씬 봄 페스티벌 — 라인업 분석, 추천 아티스트
3. [68] 한국 재즈 씬 — 신예 아티스트 특집
...
```

#### `/briefing` — 편집장 브리핑

| 항목 | 내용 |
|------|------|
| 대체 대상 | chief-editor agent (weekly strategy + daily briefing) |
| 입력 | `data/trends/` + `data/reports/` + `data/plans/week-*.md` |
| 주간 모드 | 성과 기반 주간 전략 수립, 콘텐츠 믹스 (blog/sns/carousel), 일별 슬롯 배정 |
| 일일 모드 | 주간 전략에서 오늘 할 작업 추출, 새 트렌드 반영, 우선순위 조정 |
| 긴급 모드 | velocity 80+ 토픽 감지 시 즉시 콘텐츠 생산 지시 |
| 출력 | `data/plans/week-YYYY-WNN.md`, `data/plans/daily-YYYY-MM-DD.md` |
| 트리거 | "브리핑", "오늘 할일", "/briefing" |

```markdown
# 출력 형식 예시 (일일)
---
date: 2026-04-08
based_on: week-2026-W15.md
---

## 오늘의 콘텐츠 할당

### 1순위 (긴급)
- **토픽**: 아이유 신보 리뷰
- **유형**: blog + sns carousel
- **페르소나**: 감성-비평가
- **플랫폼**: 블로그 → Threads + Instagram
- **마감**: 14:00

### 2순위
- **토픽**: 봄 페스티벌 가이드
- **유형**: sns carousel
- **플랫폼**: Instagram
- **마감**: 18:00
```

#### `/persona` — 페르소나 관리

| 항목 | 내용 |
|------|------|
| 대체 대상 | WritingPersona 모델, persona analyze API |
| 3 레이어 | StyleFingerprint + Golden Examples + RAG 컨텍스트 |
| 모드 | analyze (샘플 텍스트 → 스타일 추출), create (새 페르소나), apply (기사에 적용) |
| 출력 | `data/personas/persona-name.md` |
| 트리거 | "페르소나", "문체", "/persona" |

```markdown
# 페르소나 파일 형식
---
name: 감성-비평가
active: true
---

## StyleFingerprint
"서정적이면서도 날카로운 비평. 음악의 감정적 경험을 문학적으로 풀어내되,
기술적 분석을 놓치지 않는다."

## Tone
- warmth: 7/10
- formality: 5/10
- humor: 3/10

## Vocabulary
- preferred: ["여운", "결", "울림", "서사", "질감"]
- avoided: ["대박", "미쳤다", "레전드"]

## Golden Examples
- [example-1.md](examples/감성-비평가-1.md)
- [example-2.md](examples/감성-비평가-2.md)

## Content Rules
- always: ["감상 경험 서술로 시작", "최소 1개 음악 이론 용어 포함"]
- never: ["순위/차트 성적으로 가치 판단", "팬덤 용어 사용"]
```

#### `/monetize` — 수익화 매니저

| 항목 | 내용 |
|------|------|
| 대체 대상 | monetization-manager agent |
| 모드 | weekly-report (수익 리포트), affiliate (링크 삽입), roi (콘텐츠별 ROI) |
| 출력 | `data/reports/revenue-YYYY-MM.md` |
| 트리거 | "수익", "광고", "제휴수익", "/monetize" |

#### `/partnership` — 제휴 매니저

| 항목 | 내용 |
|------|------|
| 대체 대상 | partnership-manager agent |
| 모드 | scan (제휴 기회 탐색), review (기존 제휴 현황), outreach (접근 초안) |
| 소스 | Spotify 신보, 공연 정보, 레이블 뉴스 (firecrawl 활용) |
| 출력 | `data/partnerships/scan-YYYY-MM-DD.md` |
| 트리거 | "제휴", "파트너십", "/partnership" |

---

## 4. Schedule 크론 설정

### 일일 크론

| 이름 | 시간 (KST) | 실행 스킬 | 설명 |
|------|-----------|----------|------|
| trend-daily | 09:00 | `/trend-scan` | 6개 소스 트렌드 스캔 |
| briefing-daily | 09:30 | `/briefing` | 오늘의 콘텐츠 할당 |
| auto-produce | 10:00 | `/write-article` | 최우선 1건 자동 생산 |
| design-daily | 11:00 | `/design` | 승인 콘텐츠 디자인 생성 |
| publish-noon | 12:00 | `/publish` | SNS 발행 (점심 슬롯) |
| community-pm | 14:00 | `/community` | 댓글 수집 + 답글 |
| publish-evening | 18:00 | `/publish` | SNS 발행 (저녁 슬롯) |
| community-night | 20:00 | `/community` | 댓글 수집 + 답글 |

### 주간 크론

| 이름 | 시간 | 실행 스킬 | 설명 |
|------|------|----------|------|
| weekly-strategy | 월 08:00 | `/briefing --weekly` | 주간 콘텐츠 전략 수립 |
| analytics-weekly | 월 08:30 | `/analytics` | 지난주 성과 분석 |
| partnership-scan | 화 09:00 | `/partnership` | 제휴 기회 스캔 |
| seo-audit | 수 09:00 | `/seo --audit` | 사이트 SEO 감사 |
| newsletter | 목 15:00 | `/newsletter` | 주간 뉴스레터 발행 |
| revenue-report | 금 09:00 | `/monetize` | 수익 리포트 |

---

## 5. 워크플로우 다이어그램

```
  매일 자동 파이프라인
  ════════════════════════════════════════════════

  09:00  /trend-scan
           │ data/trends/YYYY-MM-DD.md
           ▼
  09:30  /briefing
           │ data/plans/daily-YYYY-MM-DD.md
           ▼
  10:00  /write-article  ←── /persona (스타일 적용)
           │                    │
           ├── /deep-research   │
           ├── firecrawl        │
           │                    │
           ▼                    │
         [초안] ──→ /edit ──→ [승인/검토 대기]
                                │
                                ▼
  11:00  /design ←── content/posts/slug.md
           │ 카드뉴스, 썸네일, 커버
           ▼
  12:00  /publish ──→ Threads, X, Instagram
           │
  14:00  /community ──→ 댓글 수집/답글
           │
  18:00  /publish ──→ 저녁 슬롯 발행
           │
  20:00  /community ──→ 댓글 수집/답글


  주간 보조 파이프라인
  ════════════════════════════════════════════════

  월  /briefing --weekly + /analytics
  화  /partnership
  수  /seo --audit
  목  /newsletter
  금  /monetize
```

---

## 6. 현재 에이전트 → 스킬 매핑

| 현재 에이전트 | 새 스킬 | 유형 |
|---|---|---|
| chief-editor | `/briefing` | ● 직접 제작 |
| trend-scout | `/trend-scan` | ● 직접 제작 |
| content-producer | `/write-article` | ○ 외부 기반 |
| design-director | `/design` (기존) | ○ 보강 |
| growth-analyst | `/analytics` | ○ 외부 기반 |
| community-manager | `/community` | ○ 외부 기반 |
| copy-editor | `/edit` | ○ 외부 기반 |
| seo-strategist | `/seo` | ○ 외부 기반 |
| newsletter-manager | `/newsletter` | ○ 외부 기반 |
| content-curator | `/briefing` (통합) | ● 직접 제작 |
| monetization-manager | `/monetize` | ● 직접 제작 |
| partnership-manager | `/partnership` | ● 직접 제작 |
| image-curator | `/cover` | ◎ 외부 설치 |
| (SNS 발행) | `/publish` | ◎ 외부 설치 |
| (페르소나) | `/persona` | ● 직접 제작 |

---

## 7. 외부 스킬 소스 레퍼런스

| 소스 | URL | 용도 |
|------|-----|------|
| Anthropic 공식 | github.com/anthropics/skills | skill-creator, canvas-design, theme-factory, internal-comms |
| Typefully | github.com/typefully/agent-skills | SNS 멀티플랫폼 발행 |
| Firecrawl | github.com/firecrawl/cli | 웹 검색 + 스크래핑 |
| Replicate | github.com/replicate/skills | 이미지 생성 (Flux/SD) |
| Remotion | github.com/remotion-dev/skills | 프로그래매틱 비디오 |
| Sanity | github.com/sanity-io/agent-toolkit | SEO + AEO + 구조화 데이터 |
| alirezarezvani | github.com/alirezarezvani/claude-skills | 마케팅 46개 (content, SEO, social, analytics) |
| daymade | github.com/daymade/claude-code-skills | deep-research V6, fact-checker |
| Corey Haines | github.com/coreyhaines31/marketingskills | 마케팅 39개 (content-strategy, social-content 등) |
| VoltAgent | github.com/VoltAgent/awesome-agent-skills | 1,060+ 큐레이션 목록 |
| awesome-claude-code | github.com/hesreallyhim/awesome-claude-code | 스킬/훅/명령어 큐레이션 |

---

## 8. 구현 우선순위

### Phase 1: 핵심 파이프라인 (1주차)
1. 데이터 디렉토리 구조 생성
2. `/trend-scan` 직접 제작 (firecrawl 활용)
3. `/briefing` 직접 제작
4. `/write-article` 제작 (content-production 기반)
5. `/edit` 제작 (copy-editing + fact-checker 기반)

### Phase 2: 디자인 + 발행 (2주차)
6. `/design` 보강 (canvas-design, theme-factory 통합)
7. `/cover` 설치 (replicate)
8. `/publish` 설치 (typefully)
9. `/persona` 직접 제작

### Phase 3: 분석 + 커뮤니티 (3주차)
10. `/seo` 제작 (sanity seo-aeo 기반)
11. `/analytics` 제작 (social-media-analyzer 기반)
12. `/community` 제작 (social-media-manager 기반)

### Phase 4: 비즈니스 + 자동화 (4주차)
13. `/newsletter` 제작 (email-sequence + internal-comms 기반)
14. `/monetize` 직접 제작
15. `/partnership` 직접 제작
16. Schedule 크론 전체 설정

---

## 9. 빌트인 스킬 활용

Claude Code에 이미 포함된 빌트인 스킬:

| 스킬 | 활용처 |
|------|--------|
| `/deep-research` | /trend-scan, /write-article 내부에서 심층 리서치 |
| `/market-research` | /partnership 제휴 기회 분석 |
| `/schedule` | 전체 크론 스케줄링 |
| `/design` | 이미 커스텀 존재, 보강 예정 |
| `/ppt` | 리포트 프레젠테이션 |
| `/handwrite` | 감성 콘텐츠 (선택) |
