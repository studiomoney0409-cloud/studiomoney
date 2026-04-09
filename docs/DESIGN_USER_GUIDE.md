# 디자인 시스템 사용 설명서

웹 매거진 비주얼 디자인을 만드는 두 가지 방법을 안내합니다.

---

## 공통 사항

### 지원 포맷

| 포맷 | 캔버스 크기 | 기본 슬라이드 수 | 키워드 |
|------|------------|-----------------|--------|
| 카드뉴스 | 1080×1350 | 5 | 카드뉴스 |
| 인스타 피드 | 1080×1080 | 1 | 인스타, 피드 |
| 스토리/릴스 | 1080×1920 | 1 | 스토리, 릴스 |
| 트위터/X | 1200×675 | 1 | 트위터, X |
| 유튜브 썸네일 | 1280×720 | 1 | 유튜브, 썸네일 |
| 블로그 | 1200×630 | 1 | 블로그 |
| 인포그래픽 | 1080×1350 | 3-5 | 인포그래픽 |

### 브랜드 키트 (기본값)

| 항목 | 값 |
|------|-----|
| Primary | `#6C5CE7` (퍼플) |
| Secondary | `#2D3436` (차콜) |
| Accent | `#E17055` (코랄) |
| 헤딩 폰트 | Pretendard Bold (700-900) |
| 본문 폰트 | Pretendard Regular (400-600) |
| 여백 | 60px |
| 모서리 | 16px |
| 제목 글자 수 | 최대 22자 |
| 본문 글자 수 | 슬라이드당 최대 80자 |

브랜드 키트는 `/studio/design/brand-kit`에서 변경할 수 있습니다.

### 사용 가능한 Figma 템플릿 (24종)

**커버 (3)**
- `cover.hero.v1` — 히어로 이미지 + 제목 오버레이
- `cover.hero.v2` — 좌측 정렬, 넓은 스크림
- `cover.minimal.v1` — 이미지 없는 미니멀 커버

**본문 (8)**
- `body.fact.v1~v4` — 팩트/정보 카드 (4종)
- `body.quote.v1` — 인용문
- `body.stat.v1` — 통계 수치
- `body.list.v1` — 리스트
- `body.ranking.v1` — 순위
- `body.highlight.v1` — 하이라이트

**아웃트로 (2)**
- `end.outro.v1` — 마무리
- `end.cta.v1` — CTA (구독/팔로우 유도)

**SNS (5)**
- `sns.square.v1` — 인스타 피드 (1:1)
- `sns.story.v1` — 스토리 (9:16)
- `sns.twitter.v1` — 트위터 (16:9)
- `sns.youtube.v1` — 유튜브 썸네일 (16:9)
- `sns.quote.v1` — 소셜 인용 카드 (1:1)

**인포그래픽 (4)**
- `infographic.bar.v1` — 막대 차트
- `infographic.donut.v1` — 도넛 차트
- `infographic.comparison.v1` — 비교
- `infographic.timeline.v1` — 타임라인

### 카피 작성 규칙

- 제목: 한국어 **22자 이내**, 임팩트 있게
- 본문: 슬라이드당 **80자 이내**
- 음악 용어는 영어 유지 (comeback, album, tracklist 등)

### 이미지 활용

두 트랙 모두 동일한 이미지 검색 API를 사용합니다:
- **Unsplash** — 스톡 사진
- **Pexels** — 스톡 사진
- **Spotify** — 앨범 아트
- **Google** — 웹 이미지 검색

> 실무에서는 아티스트 사진, 프로모션 이미지 등 **직접 구한 이미지를 사용하는 것을 권장**합니다.
> 로컬 파일 경로를 전달하면 두 트랙 모두 바로 사용 가능합니다.

### 카드뉴스 기본 구성 (5장)

| 슬라이드 | 템플릿 | 내용 |
|----------|--------|------|
| 1 (커버) | `cover.hero.v1` | 히어로 이미지 + 임팩트 제목 |
| 2 (본문) | `body.fact.v1` | 핵심 정보 1 |
| 3 (인용) | `body.quote.v1` | 인용/하이라이트 |
| 4 (본문) | `body.fact.v1` | 핵심 정보 2 |
| 5 (아웃트로) | `end.outro.v1` | 마무리 + CTA |

---

## Track 1: SaaS UI (Studio 웹앱)

### 접속

```
http://localhost:3100/studio/design
```

### 3가지 모드

#### 1. 프로젝트 브라우저 (기본)

`/studio/design` 접속 시 기본 화면.

- 저장된 디자인 프로젝트 목록 확인
- 필터: 전체 / 초안 / 완료
- **새 프로젝트** — 빈 에디터로 시작
- **빠른 디자인** — 토픽만 입력하고 바로 에디터 진입
- **AI 생성** — 생성 위저드로 이동

#### 2. AI 생성 위저드

`/studio/design/generate` 또는 프로젝트 브라우저에서 "AI 생성" 클릭.

**Step 1 — 입력:**
- 토픽 입력 (예: "뉴진스 컴백")
- 콘텐츠 본문 (선택)
- 플랫폼 선택: Instagram, Story, Twitter, YouTube, Facebook, Blog, TikTok
- 무드 선택 (선택)
- 슬라이드 수 조정
- 이미지 첨부 (선택)

**Step 2 — 생성 중:**
- Director → Visual Designer → Renderer 진행 상황 표시
- 포맷별 렌더 상태 확인

**Step 3 — 결과:**
- 생성된 슬라이드 PNG 미리보기
- Critique 실행 → 5개 차원 점수 확인
- 점수 8.0 이상 = PASS, 6.0~7.9 = REFINE, 6.0 미만 = REGENERATE

#### 3. 디자인 에디터

`/studio/design?quick=1` 또는 프로젝트 클릭 시 진입.

**캔버스 영역:**
- 레이어 기반 편집 (드래그, 리사이즈, 텍스트 편집)
- Undo/Redo (최대 50단계)

**오른쪽 사이드바:**
- 슬라이드 네비게이션 (추가/복제/삭제)
- 스타일 컨트롤 (색상, 폰트, 그라디언트, 효과)
- 레이어 패널 (순서 변경, 그룹화)
- AI Polish (선택한 슬라이드를 AI가 개선)

**이미지 삽입:**
1. 왼쪽 패널에서 이미지 검색 탭 클릭
2. 키워드 입력 + 소스 필터 (전체/Unsplash/Pexels/앨범아트/웹검색)
3. 결과에서 클릭 → "레이어로 추가" 또는 "배경으로 설정"

**AI 채팅:**
- AiDesignChat 패널에서 자연어로 수정 요청
- 예: "제목 좀 더 크게", "배경 어둡게"

**레퍼런스 사이트:**
- 드롭다운에서 Instagram, Pinterest, Behance, Dribbble 등 바로 열기

**내보내기:**
- PNG 다운로드
- PDF 내보내기

### 브랜드 키트 편집

`/studio/design/brand-kit`

- 색상: Primary, Secondary, Accent, 배경, 텍스트 색상 편집
- 타이포: 폰트 선택 (Pretendard, Noto Sans KR, Montserrat 등 8종)
- 레이아웃: 여백, 모서리, 글자 수 제한 슬라이더로 조정
- 에셋: 로고, 워터마크 URL 설정

### 프로젝트 관리

- 자동 저장 (specJson을 DB에 저장)
- 상태: draft → completed
- 썸네일 자동 생성
- 콘텐츠 파이프라인의 planItem과 연결 가능

---

## Track 2: Claude Code `/design` 스킬

### 사전 준비

Studio 개발 서버가 실행 중이어야 합니다:

```bash
cd apps/studio && npm run dev
# http://localhost:3100 에서 실행 확인
```

### 기본 사용법

```
/design [토픽] [포맷] [무드]
```

**예시:**
```
/design 뉴진스 컴백
/design BTS 컴백 인스타
/design 에스파 데이터 인포그래픽
/design IU 콘서트 유튜브 썸네일
/design aespa 스토리 미니멀
```

### 이미지 전달

**로컬 파일 사용 (권장):**
```
/design 뉴진스 컴백
```
→ Phase 3에서 이미지 소싱 시, 로컬 파일 경로를 직접 알려주세요:
```
이 이미지 써줘: C:\Users\pjhic\Pictures\newjeans-promo.jpg
```

**자동 검색:**
- 토픽에서 검색어를 자동 추출하여 API 검색
- 후보 2-3개를 보여주고 사용자가 선택

### 실행 흐름

```
Phase 1  요청 분석 — 토픽, 포맷, 무드, 슬라이드 수 결정
   ↓
Phase 2  레퍼런스 로드 — Brand Kit, 템플릿 레지스트리 확인
   ↓
Phase 3  이미지 소싱 — 후보 수집 → 사용자 선택
   ↓
Phase 4  디자인 생성 — 카피 작성 + DesignSpec JSON 생성
   ↓
Phase 5  렌더링 + 리뷰 — Figma SVG → PNG, Vision LLM 품질 체크
   ↓                     (슬라이드당 최대 2회 재렌더링)
Phase 6  결과 제시 — 전체 슬라이드 PNG 표시 + 피드백 요청
   ↓
Phase 7  저장 — output/designs/YYYY-MM-DD_topic-slug/ 에 저장
```

### 수정 모드

생성 후 수정이 필요할 때:

```
/design 수정 — 제목 더 크게
/design 바꿔 — 2번 슬라이드 배경 어둡게
/design 다시 — 전체적으로 색감 차갑게
```

키워드: `수정`, `refine`, `다시`, `바꿔`, `변경`

→ 가장 최근 `output/designs/` 의 spec.json을 로드하여 수정합니다.

### 출력 구조

```
output/designs/2026-03-17_newjeans-comeback/
├── spec.json          # 전체 DesignSpec (재편집 가능)
├── slide-01.png       # 커버
├── slide-02.png       # 본문 1
├── slide-03.png       # 인용
├── slide-04.png       # 본문 2
├── slide-05.png       # 아웃트로
└── metadata.json      # 토픽, 포맷, 이미지 출처, 템플릿 목록
```

### 품질 검증

Vision LLM이 렌더링된 PNG를 5가지 기준으로 평가합니다:

| 기준 | 설명 |
|------|------|
| Visual Hierarchy | 시선 흐름, 크기/색상 대비 |
| Brand Consistency | 브랜드 색상, 타이포 일관성 |
| Readability | 텍스트 대비, 폰트 크기, 밀도 |
| Aesthetic Quality | 여백, 정렬, 조화 |
| Platform Fit | 비율, 안전 영역, 썸네일 가독성 |

- **8.0 이상** → PASS (그대로 사용)
- **6.0~7.9** → REFINE (자동 수정 후 재렌더링)
- **6.0 미만** → REGENERATE (처음부터 다시 생성)

---

## 어떤 트랙을 쓸까?

| 상황 | 추천 |
|------|------|
| "주제만 주고 빠르게 완성하고 싶다" | **Track 2** (`/design`) |
| "레이어 위치를 1px 단위로 조정하고 싶다" | **Track 1** (에디터) |
| "생성 후 세밀하게 수정하고 싶다" | **Track 2로 생성** → spec.json을 **Track 1 에디터**에서 편집 |
| "AI가 알아서 품질 관리해줬으면" | **Track 2** (자동 Critic 루프) |
| "여러 포맷을 한번에 만들고 싶다" | **Track 1** (생성 위저드에서 다중 플랫폼 선택) |
| "프로젝트를 저장하고 나중에 이어서" | **Track 1** (DB 저장) |
