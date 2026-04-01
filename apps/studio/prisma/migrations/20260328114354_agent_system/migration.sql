-- CreateTable
CREATE TABLE "brand_kits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Brand Kit',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "colorPrimary" TEXT NOT NULL DEFAULT '#6C5CE7',
    "colorAccent" TEXT NOT NULL DEFAULT '#10b981',
    "colorBgDark" TEXT NOT NULL DEFAULT '#0a0a0a',
    "colorBgLight" TEXT NOT NULL DEFAULT '#f8f9fa',
    "colorText" TEXT NOT NULL DEFAULT '#1a1a1a',
    "headingFont" TEXT NOT NULL DEFAULT 'Pretendard',
    "bodyFont" TEXT NOT NULL DEFAULT 'Noto Sans KR',
    "safeMargin" INTEGER NOT NULL DEFAULT 60,
    "borderRadius" INTEGER NOT NULL DEFAULT 16,
    "logoUrl" TEXT,
    "logomarkUrl" TEXT,
    "extendedJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_plans" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "strategyJson" JSONB NOT NULL,
    "statusJson" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefings" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weeklyPlanId" TEXT,
    "assignmentsJson" JSONB NOT NULL,
    "trendSummary" TEXT NOT NULL DEFAULT '',
    "statusJson" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_gates" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "articleSummary" TEXT NOT NULL DEFAULT '',
    "candidates" JSONB NOT NULL,
    "selectedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personaId" TEXT,
    "pipelineRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_kits_userId_idx" ON "brand_kits"("userId");

-- CreateIndex
CREATE INDEX "agent_runs_agentName_startedAt_idx" ON "agent_runs"("agentName", "startedAt");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_logs_agentRunId_idx" ON "agent_logs"("agentRunId");

-- CreateIndex
CREATE INDEX "weekly_plans_weekStart_idx" ON "weekly_plans"("weekStart");

-- CreateIndex
CREATE INDEX "daily_briefings_weeklyPlanId_idx" ON "daily_briefings"("weeklyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefings_date_key" ON "daily_briefings"("date");

-- CreateIndex
CREATE INDEX "image_gates_status_idx" ON "image_gates"("status");

-- CreateIndex
CREATE INDEX "image_gates_createdAt_idx" ON "image_gates"("createdAt");

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "weekly_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
