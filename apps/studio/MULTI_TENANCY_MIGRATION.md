# Multi-Tenancy Migration

> 음악 매거진 단일 운영자 모델 → **사용자별 다중 워크스페이스 + 도메인 무관 콘텐츠 플랫폼**으로의 전환 기록.
>
> 시작: 2026-04-29 · 진행 상황: **작업 7/9 완료 (~78%)** · 회귀 통과 · 빌드 정상

---

## 1. 목표

한 사용자가 여러 **워크스페이스**를 가지며, 각 워크스페이스는:
- **niche**(도메인) — `music` / `tech` / `fashion` / `lifestyle` / `custom`
- 자체 페르소나, SNS 계정 풀, 트렌드 소스, 브랜드킷, 콘텐츠 보관함

음악 도메인 하드코딩을 모두 niche 컨텍스트로 추출. Spotify·KG sync 같은 음악 전용 자산은 `niche=music`에서만 활성.

## 2. 진행 상황

| # | 작업 | 상태 | 핵심 산출물 |
|---|---|---|---|
| 1 | 스키마 + 마이그레이션 + 시드 | ✅ | `User`/`Workspace`/`NicheTemplate` 신규 + 30+ 모델에 `workspaceId` cascade. NicheTemplate 5개 시드 |
| 2 | User/Workspace API + `requireWorkspace` 헬퍼 | ✅ | `src/lib/auth/{sync-user,workspace,workspace-create,route-guard}.ts`, `/api/workspaces`, `/api/niches` |
| 3 | NicheContext 추상화 + 음악 하드코딩 1차 제거 | ✅ | `src/lib/niche/context.ts`. outline/writer/editor/design-director 프롬프트 + Reddit subs + trends/index 작업 |
| 4a | 핵심 라우트 31개에 workspaceId 스코핑 | ✅ | blog, persona, sns/accounts, topics, autopilot, publish, agents, content/* 등 |
| 4b | 잔여 라우트 + lib 파일 ~22개 패치 | ✅ | DB admin, campaigns, inbox, reference-accounts, webhooks, lib/agents/*, lib/jobs/*, lib/design/store, lib/pipeline 등. 빌드 정상화 |
| 5 | Redis 캐시 키 격리 | ✅ | `wsKey()` 헬퍼 + chief-editor / trend-scout / research-agent / analytics-chat 적용 |
| 6+7 | 헤더 워크스페이스 스위처 + 온보딩/생성 UI | ✅ | `WorkspaceProvider`, `WorkspaceSwitcher`, `/onboarding`, `/workspaces/new` |
| 8 | 기존 화면들에 워크스페이스 전환 시 자동 재로딩 패턴 적용 | ⏳ 미완 | client-fetched 데이터 채널 일부 갱신 필요 |
| 9 | `/workspaces/[id]/settings` 편집 UI | ⏳ 미완 | 키워드/promptHints/trendSources 토글 |

### 후속 (Phase 3.5)
음악 결합 잔여 4영역 — 작업 9까지 완료 후 실제 niche=tech 워크스페이스로 검증해보고 우선순위 결정:
- `research-agent.ts` `ExtractedEntities` artists/albums/genres 강제 → 일반화
- `kg-sync.ts` Spotify→MusicArtist 동기화 → `niche=music` 가드
- `design-director.ts:54-106` `OUTPUT_PLANS` (album_review, artist_spotlight 등) → niche별 등록
- `style-memory.ts` `artist:{spotifyId}` 캐시 키 → 일반 entity 키

---

## 3. 핵심 결정 사항

| 결정 | 이유 |
|---|---|
| **사용자 인증**: Clerk 1:N Workspace (Clerk Org 미사용) | 단일 사용자가 여러 매체를 운영하는 시나리오. 팀 협업 필요해지면 Clerk Org로 확장 |
| **음악 카탈로그(MusicArtist 등) 글로벌 유지** | 객관적 사실 데이터. 모든 워크스페이스가 공유해도 됨. 단 UI는 niche=music에서만 노출 |
| **활성 워크스페이스 식별**: cookie `active_workspace_id` (httpOnly, 1년) | 서버/클라이언트 모두 접근 가능. Clerk session과 분리해서 워크스페이스 전환만 가볍게 처리 |
| **lib code path는 workspaceId optional + fallback** | 백그라운드 잡, fire-and-forget persist에서 workspace 모를 때 첫 워크스페이스 사용. 단일 운영자는 안전, multi-user 확장 시 호출자 patch 필요 |
| **첫 릴리스는 music + tech 두 niche 정식 지원** | fashion/lifestyle/custom은 베타. NicheTemplate 시드는 5개 모두 포함 |
| **DB 리셋 후 깨끗한 시작** | 기존 마이그레이션 11개 폐기. `init_workspaces` 단일 마이그레이션 + pgvector extension 활성화 SQL |

---

## 4. 신규/변경된 코드 패턴

### 4.1 라우트 가드 — `workspaceGuard()`

```typescript
// src/lib/auth/route-guard.ts
export async function workspaceGuard(): Promise<GuardResult>;

// 사용
export async function GET() {
  const guard = await workspaceGuard();
  if (!guard.ok) return guard.response; // 401 UNAUTHORIZED 또는 409 NO_WORKSPACE
  const { workspace, user } = guard.ctx;

  return prisma.blogPost.findMany({ where: { workspaceId: workspace.id } });
}
```

ID 기반 라우트는 `findFirst({ id, workspaceId })` 강제로 cross-workspace 접근 차단.

### 4.2 도메인 컨텍스트 — `NicheContext`

```typescript
// src/lib/niche/context.ts
export interface NicheContext {
  niche: string;
  promptHints: string;          // 시스템 프롬프트 prefix로 주입
  language: string;
  region: string;
  redditSubs: string[];
  trendSources: TrendSourcesConfig;
  categories: string[];
  defaultCategory: string;
}

export const DEFAULT_NICHE_CONTEXT: NicheContext = { /* legacy music 기본값 */ };

export function nicheContextFromWorkspace(workspace, template?): NicheContext;
export async function getNicheContext(workspaceId: string): Promise<NicheContext>;
```

agent 함수 시그니처에 `nicheContext?: NicheContext` 옵셔널 추가. 미주입 시 `DEFAULT_NICHE_CONTEXT`로 backward compat.

### 4.3 백그라운드 fallback — `fallbackWorkspaceId()`

```typescript
// src/lib/auth/workspace-fallback.ts
export async function fallbackWorkspaceId(): Promise<string | null>;
// 첫 워크스페이스(isDefault 우선) 캐시된 lookup
```

호출자가 workspaceId를 모를 때 (백그라운드 잡, fire-and-forget persist 등) 사용. 캐시되어 첫 호출 후 무료.

```typescript
// 사용 예 — quality-store.ts
void (async () => {
  const workspaceId = record.workspaceId ?? (await fallbackWorkspaceId());
  if (!workspaceId) return; // 워크스페이스 0개면 skip
  await prisma.designQualityEntry.upsert({ /* with workspaceId */ });
})().catch(...);
```

### 4.4 Redis 키 — `wsKey()`

```typescript
// src/lib/redis.ts
export function wsKey(workspaceId: string, ...parts: (string | number)[]): string;
// → "ws:{workspaceId}:{...}"
```

워크스페이스 종속 캐시는 모두 `wsKey` 사용. 외부 데이터(트렌드 enrichment 등)는 글로벌 키 그대로.

### 4.5 Agent runner 컨텍스트

```typescript
// src/lib/agents/types.ts
export interface AgentContext {
  runId: string;
  agentName: AgentName;
  workspaceId: string;  // ← 추가
  prisma: PrismaClient;
  log: (level, message, metadata?) => Promise<void>;
}
```

각 agent는 `ctx.workspaceId`로 prisma create. `runAgent()`는 `opts.workspaceId` 옵셔널 받고 미지정 시 fallback.

### 4.6 클라이언트 워크스페이스 컨텍스트

```typescript
// src/app/studio/_components/workspace/WorkspaceProvider.tsx
export function WorkspaceProvider({ children }): JSX.Element;
export const useWorkspace: () => {
  active: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  loading: boolean;
  switchTo: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};
```

mount 시 `/api/workspaces` fetch. 전환은 `POST /api/workspaces/[id]/activate` + cookie 갱신 + `router.refresh()`.

---

## 5. 데이터 격리 정책

### 워크스페이스 종속 (cascade on delete)
WritingPersona, BrandKit, SnsAccount, Publication, PostPerformance, BlogPost, PipelineRun, TopicDraft / TopicMessage, AutopilotConfig / AutopilotProposal, IncomingMessage, AutoReplyRule, KeywordCampaign / KeywordCommentLog, AnalyticsSnapshot, ReferenceAccount / ReferenceFeed, AgentRun / AgentLog, WeeklyPlan, DailyBriefing, ImageGate, ContentPlan / PlanItem, CalendarEvent, DesignEntry, DesignProject, MoodSearch, StyleMemoryEntry, DesignQualityEntry, StylePerformanceEntry, ImageGenHistory, LinkImport, ArticleChunk, TrendSnapshot, TopicPerformance, Subscriber, NewsletterIssue / NewsletterCampaign, SponsorDeal, AffiliateLink, RevenueEvent, Partner, Collaboration, OutreachCampaign

### 글로벌 (workspace에 묶지 않음)
- **음악 카탈로그**: MusicArtist, MusicAlbum, MusicTrack, ArtistRelation, MusicGenre
- **시스템**: LlmUsageLog (workspaceId 옵셔널), Job, CronSchedule, WebhookEvent, Setting, BenchmarkReport

### Unique 키 변경
- `SnsAccount`: `[platform, platformUserId]` → `[workspaceId, platform, platformUserId]`
- `WritingPersona`: 추가 `[workspaceId, name]`
- `BlogPost.slug`: `unique` → `[workspaceId, slug]`
- `TopicPerformance`: `[topic, category]` → `[workspaceId, topic, category]`
- `DailyBriefing`: `[date]` → `[workspaceId, date]`
- `Subscriber`: `email` → `[workspaceId, email]`
- `ReferenceAccount`: `[platform, username]` → `[workspaceId, platform, username]`
- `StyleMemoryEntry.key`: `unique` → `[workspaceId, key]`
- `BrandKit.userId` → `workspaceId`로 교체

---

## 6. 알려진 제약 / 미해결 이슈

### 6.1 Clerk 환경변수 필수
멀티테넌시 핵심은 사용자 인증 → 워크스페이스 소유 매핑. **Clerk 키 없으면 실 사용 불가**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

미설정 시 `syncCurrentUser()`는 graceful null 반환 (try/catch). `/onboarding`은 안내 메시지 표시. `/studio`는 워크스페이스 가드 skip해 그대로 동작 (legacy 단일 운영자 호환).

### 6.2 백그라운드 잡 multi-user 정확성
inngest cron / job handler들이 `runAgent()` 호출 시 workspaceId를 명시 전달하지 않으면 fallback (첫 워크스페이스) 사용. **단일 사용자 운영에서는 안전, 다중 사용자 확장 시 호출자 패치 필요**:
- `src/lib/inngest/functions/*` 12개 파일 — 각 cron/event 트리거가 모든 워크스페이스를 순회하도록 변경
- 또는 워크스페이스별 cron 등록 패턴 도입

### 6.3 음악 결합 잔여 (Phase 3.5)
앞서 표 참조. 코드에서 일반화 안 된 부분:
- `outline-agent.ts:84-91` `buildResearchSection`의 artists/albums 섹션 (research.artists 비어있으면 자동으로 안 표시되긴 하지만 schema는 강제)
- `research-agent.ts:108-112` `ExtractedEntities` 인터페이스
- `design-director.ts:54-106` `OUTPUT_PLANS`
- `style-memory.ts:65-71` `artistKey/albumKey`

### 6.4 작업 8 미완 — 워크스페이스 전환 시 client refresh
WorkspaceSwitcher의 `switchTo()`가 `router.refresh()`만 호출. server 컴포넌트는 자동 갱신되지만 **client useEffect로 fetch한 데이터는 stale 상태로 남을 수 있음**. 각 client 페이지가 `useWorkspace().active.id`를 useEffect 의존성에 추가하거나, swr/react-query 도입 필요.

### 6.5 트렌드 fetcher의 워크스페이스 컨텍스트
`fetchTrends(keywords, ctx)` 시그니처는 마련됐지만 호출자 일부가 `ctx`를 안 넘김 → `DEFAULT_NICHE_CONTEXT` 사용. `getNicheContext(workspace.id)`를 라우트 레이어에서 호출 후 전달하도록 일괄 패치 필요 (작업 8 영역).

---

## 7. 다음 단계 (재개 가이드)

### 7.1 즉시 가능한 작업

**작업 8 (~0.5d)** — client refresh 일관성
1. 각 `/studio/*` client 페이지의 fetch useEffect에 `useWorkspace().active?.id` 의존성 추가
2. 또는 WorkspaceProvider 안에 `activeId` 변경 감지 → 모든 fetch 무효화 패턴
3. 추천: SWR 도입해 `useSWR(["blog", workspaceId], ...)` 형태로 자동 무효화

**작업 9 (~0.5d)** — `/workspaces/[id]/settings`
- 이름/키워드/promptHints 편집
- trendSources 토글 (8개 boolean: google, youtube, reddit, naverDataLab, naverSearch, spotify, hackernews, instagramRef)
- 워크스페이스 삭제 (cascade 경고)
- API는 이미 있음 (`PATCH /api/workspaces/[id]`, `DELETE`)

**Phase 3.5 (~0.5~1d)** — 작업 9 후 실 사용 검증 + 거슬리는 영역만 우선 패치

### 7.2 검증 절차

1. Clerk dev 키 발급 (10분, clerk.com)
2. `.env`에 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` 추가
3. `npm run dev` → 회원가입 → `/onboarding` 자동 진입 확인
4. niche=music 워크스페이스 생성 → /studio 진입 확인
5. 헤더 스위처에서 "+ 새 워크스페이스" → niche=tech 생성
6. 헤더에서 두 워크스페이스 전환하며 데이터 격리 확인 (블로그/페르소나/계정 따로 보임)
7. 같은 토픽으로 양쪽에서 콘텐츠 생성 → 결과물 차이 확인 (Phase 3.5 우선순위 결정)

---

## 8. 핵심 파일 인덱스

### 인증 / 워크스페이스 코어
| 파일 | 역할 |
|---|---|
| `src/lib/auth/sync-user.ts` | Clerk → DB User lazy upsert (graceful) |
| `src/lib/auth/workspace.ts` | `requireWorkspace()`, `getActiveWorkspaceId()`, `setActiveWorkspaceId()` |
| `src/lib/auth/workspace-create.ts` | `createWorkspaceFromNiche()` + `normalizeSlug()` |
| `src/lib/auth/workspace-fallback.ts` | `fallbackWorkspaceId()` 캐시된 lookup |
| `src/lib/auth/route-guard.ts` | `workspaceGuard()` discriminated union |
| `src/lib/niche/context.ts` | `NicheContext` 타입 + `nicheContextFromWorkspace()` + `DEFAULT_NICHE_CONTEXT` |

### API
| 라우트 | 역할 |
|---|---|
| `/api/workspaces` (GET/POST) | 목록 / 생성 (NicheTemplate에서 시드) |
| `/api/workspaces/[id]` (GET/PATCH/DELETE) | 단건 |
| `/api/workspaces/[id]/activate` (POST) | 활성 워크스페이스 cookie 설정 |
| `/api/niches` (GET) | NicheTemplate 5개 목록 |

### UI
| 파일 | 역할 |
|---|---|
| `src/app/studio/_components/workspace/WorkspaceProvider.tsx` | `useWorkspace()` context |
| `src/app/studio/_components/workspace/WorkspaceSwitcher.tsx` | 헤더 드롭다운 |
| `src/app/studio/layout.tsx` | Provider 감싸기 + 헤더 통합 |
| `src/app/studio/page.tsx` | 워크스페이스 0개면 `/onboarding` redirect |
| `src/app/onboarding/page.tsx` | 환영 + Clerk 미설정 안내 |
| `src/app/workspaces/new/page.tsx` + `NewWorkspaceForm.tsx` | niche 카드 + 폼 |

### Schema / 시드
- `prisma/schema.prisma` — 신규 `User` / `Workspace` / `NicheTemplate` + 30+ 모델 cascade
- `prisma/migrations/20260429041156_init_workspaces/migration.sql` — pgvector extension 포함
- `prisma/seed.ts` — NicheTemplate 5개 idempotent upsert

### 테스트
- `src/lib/auth/__tests__/workspace-create.test.ts` (7) — `normalizeSlug`
- `src/lib/niche/__tests__/context.test.ts` (9) — `nicheContextFromWorkspace`

---

## 9. 회귀 / 빌드 상태

| 항목 | 마지막 확인 | 결과 |
|---|---|---|
| `npx tsc --noEmit` | 작업 7 직후 | 0 errors |
| `npm test` (vitest) | 작업 7 직후 | 124 passed / 10 skipped (134) |
| `npm run build` | 작업 7 직후 | 성공 (모든 라우트 + middleware 등록) |
| dev server HTTP 검증 | 작업 7 직후 | `/api/niches` 200, `/onboarding` 200, `/workspaces/new` 200, `/studio` 200, `/api/workspaces` 401 (Clerk 없을 때 정상) |
