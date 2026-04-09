# 서비스 실행 가이드

> Web Magazine Studio 로컬 실행 및 배포에 필요한 모든 것

**최종 업데이트**: 2026-04-09

---

## 1. 사전 요구사항

| 항목 | 최소 버전 | 비고 |
|------|----------|------|
| Node.js | 20+ | Next.js 16 기반 |
| npm | 10+ | 패키지 매니저 |
| PostgreSQL | - | Neon 클라우드 사용 중 (로컬 설치 불필요) |

---

## 2. 로컬 실행 (Quick Start)

```bash
# 1. 의존성 설치 (루트에서 실행 — postinstall이 prisma generate도 수행)
npm install

# 2. DB 마이그레이션 (최초 실행 또는 스키마 변경 시)
cd apps/studio
npx prisma migrate deploy

# 3. 개발 서버 시작
cd ../..
npm run studio:dev

# → http://localhost:3100 접속
# → 비밀번호: SITE_PASSWORD 환경변수 값
```

### 기타 스크립트

```bash
# Prisma 클라이언트 수동 재생성
cd apps/studio && npx prisma generate

# Remotion 번들링 (릴스 기능 사용 시)
cd apps/studio && npm run bundle:remotion

# 테스트 실행
cd apps/studio && npm test
```

---

## 3. 환경변수 전체 목록

`.env` 파일이 **두 곳**에 존재합니다:
- `/.env` (루트) — `next.config.ts`의 `loadEnvConfig(monorepoRoot)`로 로드
- `/apps/studio/.env` — Next.js 기본 로드

### 3.1 필수 (서비스 구동에 반드시 필요)

| 변수 | 용도 | 발급처 |
|------|------|--------|
| `DATABASE_URL` | Neon PostgreSQL 연결 | [neon.tech](https://neon.tech) |
| `OPENAI_API_KEY` | LLM 호출 (gpt-4o-mini) | [platform.openai.com](https://platform.openai.com/api-keys) |
| `SITE_PASSWORD` | 로그인 비밀번호 | 직접 설정 |

### 3.2 핵심 기능 (대부분 기능에 필요)

| 변수 | 용도 | 발급처 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Claude (Chief Editor 에이전트) | [console.anthropic.com](https://console.anthropic.com/) |
| `UNSPLASH_ACCESS_KEY` | 스톡 이미지 검색 | [unsplash.com/developers](https://unsplash.com/developers) |
| `GOOGLE_CSE_API_KEY` | 웹 이미지 검색 (무료 100회/일) | [Google Cloud Console](https://console.cloud.google.com) |
| `GOOGLE_CSE_ID` | 검색 엔진 ID | [Programmable Search Engine](https://programmablesearchengine.google.com) |
| `SPOTIFY_CLIENT_ID` | 음악 데이터 (앨범아트, 검색) | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | 위와 동일 | 위와 동일 |
| `NAVER_CLIENT_ID` | 네이버 뉴스/블로그 검색 | [developers.naver.com](https://developers.naver.com/) |
| `NAVER_CLIENT_SECRET` | 위와 동일 | 위와 동일 |

### 3.3 자동화 파이프라인 (에이전트 시스템)

| 변수 | 용도 | 미설정 시 | 발급처 |
|------|------|----------|--------|
| `INNGEST_EVENT_KEY` | 에이전트 이벤트 발행 | 에이전트 자동 실행 불가 | [app.inngest.com](https://app.inngest.com/) |
| `INNGEST_SIGNING_KEY` | Inngest 웹훅 검증 | 위와 동일 | 위와 동일 |
| `REDIS_URL` | 트렌드 캐시, 세션 | 인메모리 폴백 (재시작 시 초기화) | [upstash.com](https://upstash.com/) |
| `CRON_SECRET` | Cron Job 인증 | Cron 미인증 | 직접 생성 (랜덤 hex) |

### 3.4 이미지 생성

| 변수 | 용도 | 미설정 시 | 발급처 |
|------|------|----------|--------|
| `FAL_KEY` | fal.ai Flux 이미지 생성 | DALL-E만 사용 | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |
| `PEXELS_API_KEY` | Pexels 스톡 이미지 (백업) | Unsplash만 사용 | [pexels.com/api](https://www.pexels.com/api/) |

### 3.5 SNS 발행 (OAuth 2.0)

| 변수 | 용도 | 발급처 |
|------|------|--------|
| `META_APP_ID` / `META_APP_SECRET` | Threads + Instagram | [developers.facebook.com](https://developers.facebook.com/) |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X (Twitter) | [developer.x.com](https://developer.x.com/) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube | [Google Cloud Console](https://console.cloud.google.com/) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn | [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok | [developers.tiktok.com](https://developers.tiktok.com/) |
| `WORDPRESS_COM_CLIENT_ID` / `WORDPRESS_COM_CLIENT_SECRET` | WordPress | [developer.wordpress.com](https://developer.wordpress.com/apps/) |
| `SNS_TOKEN_ENCRYPTION_KEY` | OAuth 토큰 암호화 (64자 hex) | 직접 생성 |
| `OAUTH_CALLBACK_BASE_URL` | OAuth 콜백 URL | 로컬: `http://localhost:3100` |

### 3.6 영상 (Remotion Lambda)

| 변수 | 용도 | 사전 작업 |
|------|------|----------|
| `REMOTION_AWS_REGION` | AWS 리전 | `npx remotion lambda functions deploy` |
| `REMOTION_FUNCTION_NAME` | Lambda 함수명 | 위 명령 실행 시 출력 |
| `REMOTION_SERVE_URL` | 사이트 URL | `npx remotion lambda sites create src/remotion/index.ts` |

### 3.7 스토리지 (Cloudflare R2)

| 변수 | 용도 | 미설정 시 |
|------|------|----------|
| `R2_ENDPOINT` | R2 엔드포인트 | `/tmp` 폴백 (배포 간 소실) |
| `R2_ACCESS_KEY` | 접근 키 | 위와 동일 |
| `R2_SECRET_KEY` | 시크릿 키 | 위와 동일 |
| `R2_BUCKET` | 버킷명 | 위와 동일 |
| `R2_PUBLIC_URL` | 퍼블릭 URL | 위와 동일 |

### 3.8 기타

| 변수 | 용도 | 비고 |
|------|------|------|
| `OPENAI_BASE_URL` | OpenAI 엔드포인트 | 기본: `https://api.openai.com/v1` |
| `ANTHROPIC_BASE_URL` | Anthropic 엔드포인트 | 기본: `https://api.anthropic.com/v1` |
| `YOUTUBE_API_KEY` | YouTube 트렌드 수집 | 실험 단계 |
| `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_USER_ID` | Instagram 해시태그 분석 | 실험 단계 |
| `SLACK_WEBHOOK_URL` | 에이전트 실패 알림 | 선택 |

---

## 4. Vercel 배포

### 배포 구성 (`apps/studio/vercel.json`)

```json
{
  "framework": "nextjs",
  "regions": ["sin1"],
  "installCommand": "cd ../.. && npm ci && cd apps/studio && npm ci",
  "crons": [
    { "path": "/api/jobs/daily-reset", "schedule": "0 15 * * *" }
  ]
}
```

- **리전**: sin1 (싱가포르)
- **빌드 명령**: `npx prisma generate && next build`
- **Cron**: 매일 UTC 15:00 (KST 00:00) — daily-reset

### Vercel 환경변수 설정

Vercel Dashboard → Settings → Environment Variables에 위 3.1~3.6 변수 등록 필요.
Vercel이 자동 설정하는 변수 (`VERCEL`, `VERCEL_URL`, `VERCEL_ENV`)는 수동 설정 불필요.

---

## 5. 프로젝트 구조

```
Web_magazine/
├── apps/studio/              # 메인 Next.js 앱 (포트 3100)
│   ├── prisma/               #   DB 스키마 + 마이그레이션
│   ├── src/
│   │   ├── app/              #   페이지 + API 라우트
│   │   │   ├── api/          #     25+ API 엔드포인트
│   │   │   ├── studio/       #     20+ UI 섹션
│   │   │   └── login/        #     비밀번호 로그인
│   │   ├── lib/              #   핵심 비즈니스 로직
│   │   │   ├── agents/       #     12 AI 에이전트
│   │   │   ├── design/       #     디자인 엔진 (22 모듈)
│   │   │   ├── trends/       #     트렌드 수집
│   │   │   ├── pipeline/     #     콘텐츠 파이프라인
│   │   │   ├── autopilot/    #     자동화
│   │   │   ├── sns/          #     SNS 발행
│   │   │   ├── inngest/      #     이벤트 큐 함수
│   │   │   └── ...
│   │   └── remotion/         #   비디오 컴포지션
│   └── .env                  #   환경변수 (studio)
├── agents/                   # 독립 에이전트 모듈
│   ├── shared/templates/     #   디자인 템플릿 (Figma SVG)
│   ├── cardnews-composition/ #   카드뉴스 에이전트
│   └── ...
├── .env                      # 환경변수 (루트, next.config.ts에서 로드)
└── package.json              # 루트 패키지
```

---

## 6. 기능별 필요 환경변수 체크리스트

최소한으로 시작하고 싶다면, 기능별로 필요한 키만 설정:

### 기본 서비스만 띄우기
- [x] `DATABASE_URL`
- [x] `OPENAI_API_KEY`
- [x] `SITE_PASSWORD`

### + 디자인 기능
- [ ] `UNSPLASH_ACCESS_KEY` (이미지 검색)
- [ ] `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` (웹 이미지)
- [ ] `FAL_KEY` (Flux 이미지 생성) 또는 OPENAI_API_KEY로 DALL-E 사용

### + 트렌드 수집
- [ ] `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET`
- [ ] `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`

### + 에이전트 자동화
- [ ] `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`
- [ ] `REDIS_URL`

### + SNS 발행
- [ ] `META_APP_ID` + `META_APP_SECRET` (Threads/Instagram)
- [ ] `X_CLIENT_ID` + `X_CLIENT_SECRET` (Twitter)
- [ ] `SNS_TOKEN_ENCRYPTION_KEY`

### + 영상 (릴스)
- [ ] `REMOTION_AWS_REGION` + `REMOTION_FUNCTION_NAME` + `REMOTION_SERVE_URL`

---

## 7. 트러블슈팅

### Prisma 관련
```bash
# "Cannot find module '.prisma/client'" 에러
cd apps/studio && npx prisma generate

# 마이그레이션 드리프트 에러
cd apps/studio && npx prisma migrate reset  # 주의: DB 초기화
```

### 포트 충돌
```bash
# 3100 포트 사용 중일 때
npm run studio:dev -- --port 3200
```

### 환경변수 로드 안 됨
- `next.config.ts`에서 루트 `.env`를 `loadEnvConfig(monorepoRoot)`로 로드
- 루트와 `apps/studio/` 양쪽 `.env`에 변수가 있으면 studio 쪽이 우선
