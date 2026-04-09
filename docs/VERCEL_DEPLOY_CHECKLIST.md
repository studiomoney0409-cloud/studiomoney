# Vercel 배포 체크리스트

## 1. 환경변수 설정 (Vercel Dashboard → Settings → Environment Variables)

### 필수 (미설정 시 시스템 작동 불가)

| 변수명 | 용도 | 발급처 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 연결 | [Neon](https://neon.tech) |
| `INNGEST_EVENT_KEY` | Inngest 이벤트 전송 | [Inngest](https://app.inngest.com) → Settings → Keys |
| `INNGEST_SIGNING_KEY` | Inngest 웹훅 서명 검증 | 동일 |
| `OPENAI_API_KEY` | GPT-4o LLM 호출 | [OpenAI](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Claude Sonnet (주간 전략 등) | [Anthropic](https://console.anthropic.com) |
| `SNS_TOKEN_ENCRYPTION_KEY` | OAuth 토큰 암호화 (64자 hex) | 자체 생성: `openssl rand -hex 32` |
| `CRON_SECRET` | Vercel Cron Job 인증 | 자체 생성: `openssl rand -hex 24` |
| `SITE_PASSWORD` | 사이트 접근 비밀번호 | 자유 설정 |

### 권장 (미설정 시 기능 제한 또는 데이터 소실)

| 변수명 | 용도 | 미설정 시 |
|--------|------|-----------|
| `REDIS_URL` | 트렌드 캐시, 세션 | 인메모리 폴백 (배포마다 초기화) |
| `R2_ENDPOINT` | 영상/이미지 영구 저장 | `/tmp` 폴백 (함수 종료 시 소실) |
| `R2_ACCESS_KEY` | R2 인증 | 동일 |
| `R2_SECRET_KEY` | R2 인증 | 동일 |
| `R2_BUCKET` | R2 버킷명 | 동일 |
| `R2_PUBLIC_URL` | R2 퍼블릭 URL | 동일 |

> Redis: [Upstash](https://upstash.com) 권장 (Vercel 네이티브 통합 지원)
> R2: [Cloudflare R2](https://dash.cloudflare.com) 또는 AWS S3 호환

### 트렌드/검색 API (미설정 시 해당 소스 비활성화)

| 변수명 | 용도 |
|--------|------|
| `SPOTIFY_CLIENT_ID` | Spotify 앨범/아티스트 검색 |
| `SPOTIFY_CLIENT_SECRET` | 동일 |
| `GOOGLE_CSE_API_KEY` | Google 이미지 검색 |
| `GOOGLE_CSE_ID` | 동일 |
| `UNSPLASH_ACCESS_KEY` | Unsplash 스톡 이미지 |
| `NAVER_CLIENT_ID` | Naver 뉴스/블로그 검색 |
| `NAVER_CLIENT_SECRET` | 동일 |
| `YOUTUBE_API_KEY` | YouTube 트렌드 수집 |

### SNS 발행 OAuth (사용하는 플랫폼만 설정)

| 변수명 | 플랫폼 |
|--------|--------|
| `META_APP_ID` / `META_APP_SECRET` | Instagram, Threads |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | X (Twitter) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok |
| `WORDPRESS_COM_CLIENT_ID` / `WORDPRESS_COM_CLIENT_SECRET` | WordPress |

### 영상 렌더링 (선택)

| 변수명 | 용도 |
|--------|------|
| `REMOTION_AWS_REGION` | Remotion Lambda 리전 |
| `REMOTION_FUNCTION_NAME` | Lambda 함수명 |
| `REMOTION_SERVE_URL` | Remotion 사이트 URL |
| `FAL_KEY` | fal.ai 이미지 생성 |

---

## 2. Vercel 프로젝트 설정

### Framework & Build

| 항목 | 값 |
|------|-----|
| Framework | Next.js |
| Root Directory | `apps/studio` |
| Build Command | `npx prisma generate && next build` |
| Install Command | `cd ../.. && npm ci && cd apps/studio && npm ci` |
| Output Directory | (기본값) |
| Node.js Version | 20.x |

### Region

`vercel.json`에 `sin1` (싱가포르) 설정됨. Neon DB와 같은 리전 사용 권장.

### Function Duration

| Route | maxDuration | 이유 |
|-------|-------------|------|
| `/api/inngest` | 300s | 에이전트 파이프라인 (research→write→edit) 체인 |
| `/api/design/render` | 60s | Resvg SVG→PNG 렌더링 |
| 나머지 | 기본값 (10s/60s) | 일반 API |

> Vercel Pro 플랜 필요: maxDuration > 10s 사용 시

---

## 3. Inngest 연동

1. [Inngest Dashboard](https://app.inngest.com) 에서 앱 생성
2. **Signing Key** → Vercel 환경변수 `INNGEST_SIGNING_KEY`에 설정
3. **Event Key** → Vercel 환경변수 `INNGEST_EVENT_KEY`에 설정
4. **Serve URL 등록**: 배포 후 Inngest에 `https://{your-domain}/api/inngest` 등록
5. Inngest Dev Server (로컬): `npx inngest-cli@latest dev`

### 등록된 Inngest 크론 스케줄

| 함수 | 스케줄 (UTC) | 한국시간 |
|------|-------------|----------|
| Trend Scout | `*/30 * * * *` | 30분마다 |
| Chief Editor Daily | `0 0 * * *` | 매일 09:00 |
| Chief Editor Weekly | `0 0 * * 1` | 월요일 09:00 |
| Growth Analyst Daily | `0 13 * * *` | 매일 22:00 |
| Growth Analyst Weekly | `0 13 * * 0` | 일요일 22:00 |
| Community Manager | `*/10 * * * *` | 10분마다 |
| Keyword Scan | `*/15 9-22 * * *` | 09~22시 15분마다 |
| Daily Reset | `0 15 * * *` | 매일 00:00 |
| Analytics Collect | `0 16 * * *` | 매일 01:00 |

---

## 4. 배포 전 확인 사항

- [ ] Vercel 환경변수에 필수 항목 모두 설정
- [ ] Neon DB에 최신 마이그레이션 적용: `npx prisma migrate deploy`
- [ ] Inngest Dashboard에서 Serve URL 등록 확인
- [ ] R2 버킷 생성 및 CORS 설정 (영상 업로드 사용 시)
- [ ] OAuth 콜백 URL을 프로덕션 도메인으로 변경: `OAUTH_CALLBACK_BASE_URL=https://your-domain.com`
- [ ] Vercel Pro 플랜 확인 (maxDuration 300s 필요)

---

## 5. 배포 후 확인 사항

- [ ] `https://{domain}/api/inngest` 접속 → Inngest UI 확인
- [ ] Inngest Dashboard에서 함수 목록 33개 등록 확인
- [ ] Trend Scout 30분 크론 정상 실행 확인
- [ ] `/api/design/render` POST 테스트 → PNG 반환 확인
- [ ] `/api/pipeline/e2e` POST 테스트 → SSE 스트리밍 정상 확인

---

## 6. 알려진 제약사항

| 제약 | 영향 | 대응 |
|------|------|------|
| Vercel 서버리스 read-only 파일시스템 | 영상 로컬 저장 불가 | R2 설정 필수, 미설정 시 `/tmp` (임시) |
| Vercel 콜드 스타트 2~3초 | 첫 요청 느림 | Resvg warmUp + Prisma 커넥션 풀 |
| Inngest step.run() 당 1 서버리스 호출 | 비용 증가 가능 | step 수 최소화 완료 |
| Vercel Cron은 1개만 등록 | 나머지는 Inngest가 관리 | Inngest 크론으로 대체 완료 |
