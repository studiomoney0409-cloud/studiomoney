# Multi-Agent Autonomous System — 사용 가이드

## 개요

6개 AI 에이전트가 웹 매거진을 자율 운영합니다.
사장님은 대시보드(`/studio/agents`)에서 모니터링만 하면 됩니다.

---

## 1. 초기 설정

### 1.1 환경변수 (Vercel Dashboard)

```
# 필수
OPENAI_API_KEY=sk-...          # GPT-4o/mini (실행 에이전트)
DATABASE_URL=postgresql://...   # PostgreSQL (Neon 등)
ANTHROPIC_API_KEY=sk-ant-...   # Claude Sonnet (편집장 전략 판단)

# Inngest (프로덕션 필수)
INNGEST_SIGNING_KEY=signkey-... # Inngest 대시보드에서 발급
INNGEST_EVENT_KEY=...           # Inngest 대시보드에서 발급

# 선택
SLACK_WEBHOOK_URL=https://...   # 에이전트 실패 알림
```

### 1.2 DB 마이그레이션

```bash
cd apps/studio
npx prisma migrate dev --name agent_system   # 로컬
npx prisma migrate deploy                     # 프로덕션
```

4개 테이블 생성됨: `agent_runs`, `agent_logs`, `weekly_plans`, `daily_briefings`

### 1.3 Inngest 연결

1. [app.inngest.com](https://app.inngest.com) 에서 앱 생성
2. Signing Key / Event Key를 Vercel 환경변수에 설정
3. 배포 후 Inngest 대시보드에서 21개 함수 등록 확인

---

## 2. 에이전트 구성

### 편집장 (Chief Editor)

| 항목 | 내용 |
|------|------|
| 역할 | 주간 전략 수립, 일일 배정, 긴급 대응 |
| LLM | Claude Sonnet (전략적 판단) |
| 스케줄 | 월요일 09:00 (주간) / 매일 09:00 (일일) / 긴급 이벤트 |
| 출력 | `WeeklyPlan`, `DailyBriefing` |

**동작 흐름:**
```
Growth Analyst 리포트 + Trend Scout 브리핑
  → 편집장이 주간 테마 + 콘텐츠 슬롯 결정
  → 매일 아침 오늘의 배정 생성
  → Content Producer에 이벤트 전달
```

### 트렌드 스카우트 (Trend Scout)

| 항목 | 내용 |
|------|------|
| 역할 | 트렌드 스캔, 긴급 트렌드 감지, 토픽 우선순위화 |
| LLM | GPT-4o-mini |
| 스케줄 | 매 30분 |
| 출력 | `TrendBriefing` + 긴급 알림 |

**긴급 감지 기준:**
- velocity >= 80: 편집장에게 즉시 알림
- 편집장이 판단 후 Content Producer에 긴급 생산 지시

### 콘텐츠 프로듀서 (Content Producer)

| 항목 | 내용 |
|------|------|
| 역할 | 기사 생산 + 품질 게이트 + 플랫폼별 텍스트 변환 |
| LLM | GPT-4o (작성), GPT-4o-mini (변환) |
| 스케줄 | 이벤트 트리거 (편집장 배정 시) |
| 출력 | `AutopilotProposal`, `Publication` |

**품질 게이트:**
- 75점 이상: 자동 승인 → 스마트 스케줄링 → 발행
- 50~74점: 사람 검토 필요 (`/studio/autopilot`에서 확인)
- 50점 미만: 1회 재시도 후 검토 대기

### 디자인 디렉터 (Design Director)

| 항목 | 내용 |
|------|------|
| 역할 | 디자인 생성 + 성과 기반 스타일 선택 |
| LLM | GPT-4o-mini |
| 스케줄 | 이벤트 트리거 (콘텐츠 생산 완료 시) |
| 출력 | 플랫폼별 디자인 에셋 |

**자동 스타일 학습:**
- `StylePerformanceEntry` 참여율 데이터로 고성과 스타일 우선 선택

### 성장 분석가 (Growth Analyst)

| 항목 | 내용 |
|------|------|
| 역할 | 성과 분석, 비용 모니터링, 피드백 루프 |
| LLM | GPT-4o-mini (일일), Claude Sonnet (주간 전략) |
| 스케줄 | 매일 22:00 / 일요일 22:00 (주간) |
| 출력 | `GrowthReport` |

**모니터링 항목:**
- 게시물 참여율 + 팔로워 변화
- 에이전트별 LLM 비용 추적
- 예산 80% 초과 시 경고 (Setting `agent-budget-daily` 기준)

### 커뮤니티 매니저 (Community Manager)

| 항목 | 내용 |
|------|------|
| 역할 | 댓글/DM 대응, 감성 분석, 콘텐츠 아이디어 추출 |
| LLM | GPT-4o-mini |
| 스케줄 | 매 10분 |
| 출력 | `CommunityReport` |

**에스컬레이션:**
- 부정적 감성 30% 초과 시 편집장에게 알림
- 반복 질문 2건 이상 시 자동으로 `TopicDraft` 생성

---

## 3. 일일 자동 운영 타임라인

```
00:00 UTC (09:00 KST)
  ├─ Trend Scout: 최신 트렌드 브리핑 생성
  └─ Chief Editor: 오늘의 배정 생성 → Content Producer 트리거

09:00~22:00 KST (반복)
  ├─ Content Producer: 배정된 기사 생산 (품질 게이트)
  ├─ Design Director: 기사 완료 시 디자인 자동 생성
  ├─ Publisher: 스마트 스케줄링으로 SNS 발행
  ├─ Trend Scout: 30분마다 트렌드 스캔 (긴급 감지)
  └─ Community Manager: 10분마다 댓글 관리 + 감성 분석

13:00 UTC (22:00 KST)
  └─ Growth Analyst: 일일 성과 리포트 생성

매주 월요일 00:00 UTC (09:00 KST)
  └─ Chief Editor: 주간 콘텐츠 전략 수립

매주 일요일 13:00 UTC (22:00 KST)
  └─ Growth Analyst: 주간 종합 분석 + 전략 제안
```

---

## 4. 모니터링 대시보드

### `/studio/agents` 페이지

- **에이전트 카드 (6개)**: 상태(실행중/대기중/오류), 마지막 실행, 오늘 횟수, 요약
- **비용 요약**: 오늘/이번주/이번달 LLM 비용
- **주간 계획 진행률**: 이번주 콘텐츠 슬롯 완료 현황
- **알림 패널**: 에러/경고 로그, 에스컬레이션
- **활동 타임라인**: 오늘의 에이전트 실행 기록

30초마다 자동 새로고침.

### API 엔드포인트

```
GET /api/agents                  전체 대시보드 데이터
GET /api/agents/{agentName}      특정 에이전트 상세 (실행 이력 + 로그)
```

---

## 5. 사장님 일과

### 평소 (1일 2분)

1. 아침에 `/studio/agents` 확인 — 6개 에이전트 모두 녹색인지
2. 알림 있으면 확인 (협찬 문의, 에스컬레이션 등)
3. 끝

### 가끔 (주 1회 5분)

1. Growth Analyst 주간 리포트 읽기
2. 필요시 지시: "이번주 인디 음악 비중 좀 늘려" → 다음 주간 계획에 반영됨
3. `/studio/autopilot`에서 "검토 필요" 콘텐츠 승인/거절

### 비상 시

- Slack 알림 수신 → 대시보드 확인
- 에이전트 오류 시: Inngest 대시보드에서 재실행 가능

---

## 6. 비용 구조

| 에이전트 | 모델 | 월 예상 비용 |
|----------|------|-------------|
| Chief Editor | Claude Sonnet | ~$30 |
| Trend Scout | GPT-4o-mini | ~$15 |
| Content Producer | GPT-4o + mini | ~$120 |
| Design Director | GPT-4o-mini | ~$20 |
| Growth Analyst | mini + Sonnet | ~$25 |
| Community Manager | GPT-4o-mini | ~$15 |
| **합계** | | **~$225/월** |

예산 제어: `Setting` 테이블에 `agent-budget-daily` 키로 일일 예산 설정 (기본 $30).
Growth Analyst가 80% 초과 시 경고.

---

## 7. 기존 기능과의 관계

| 기존 기능 | 변경사항 |
|-----------|---------|
| Autopilot (`/studio/autopilot`) | 그대로 동작. 에이전트 시스템과 병렬 운영 |
| E2E Pipeline | Content Producer가 내부적으로 호출. 코드 변경 없음 |
| Design Engine | Design Director가 내부적으로 호출. 코드 변경 없음 |
| Comment System | Community Manager가 기존 핸들러를 래핑. 기존도 유지 |
| Analytics | Growth Analyst가 기존 feedback-analyzer 호출 |
| Smart Scheduling | Content Producer가 기존 scheduler 호출 |

모든 기존 기능은 그대로 동작합니다. 에이전트 시스템은 **위에 올라간 조율 레이어**입니다.

---

## 8. 파일 구조

```
src/lib/agents/
├── types.ts                  공유 타입 정의
├── agent-runner.ts           runAgent() 래퍼 (추적/비용/에러)
├── events.ts                 Inngest 이벤트 정의
├── chief-editor.ts           편집장 로직
├── trend-scout.ts            트렌드 스카우트 로직
├── content-producer.ts       콘텐츠 프로듀서 로직
├── design-director-agent.ts  디자인 디렉터 로직
├── growth-analyst.ts         성장 분석가 로직
└── community-manager.ts      커뮤니티 매니저 로직

src/lib/inngest/functions/
├── chief-editor.ts           3개 Inngest 함수
├── trend-scout.ts            1개 Inngest 함수
├── content-producer.ts       2개 Inngest 함수
├── growth-analyst.ts         2개 Inngest 함수
├── design-director.ts        1개 Inngest 함수
└── community-manager.ts      1개 Inngest 함수

src/app/studio/agents/        대시보드 UI
src/app/api/agents/            대시보드 API
```
