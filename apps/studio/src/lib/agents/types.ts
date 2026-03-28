/**
 * Multi-Agent System — Shared Types
 */
import type { PrismaClient } from "../../generated/prisma/client";

// ── Agent Names ───────────────────────────────────────────

export type AgentName =
  | "chief-editor"
  | "trend-scout"
  | "content-producer"
  | "design-director"
  | "growth-analyst"
  | "community-manager";

export const AGENT_LABELS: Record<AgentName, string> = {
  "chief-editor": "편집장",
  "trend-scout": "트렌드 스카우트",
  "content-producer": "콘텐츠 프로듀서",
  "design-director": "디자인 디렉터",
  "growth-analyst": "성장 분석가",
  "community-manager": "커뮤니티 매니저",
};

// ── Agent Context ─────────────────────────────────────────

export interface AgentContext {
  runId: string;
  agentName: AgentName;
  prisma: PrismaClient;
  /** Write a log entry to AgentLog */
  log: (level: "debug" | "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) => Promise<void>;
}

// ── Agent Result ──────────────────────────────────────────

export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  costUsd: number;
  durationMs: number;
  runId: string;
}

// ── Chief Editor Outputs ──────────────────────────────────

export interface WeeklyStrategy {
  theme: string;
  goals: string[];
  contentSlots: ContentSlot[];
  contentMix: { blog: number; sns: number; carousel: number };
}

export interface ContentSlot {
  day: string; // "monday" | "tuesday" | ...
  topic: string;
  angle: string;
  contentType: string;
  priority: "urgent" | "high" | "normal";
  personaId?: string;
  platforms: string[];
}

export interface DailyAssignment {
  topic: string;
  angle: string;
  contentType: string;
  priority: "urgent" | "high" | "normal";
  personaId?: string;
  platforms: string[];
  deadline?: string;
}

// ── Trend Scout Outputs ───────────────────────────────────

export interface TrendBriefing {
  topics: ScoredTopic[];
  urgentAlerts: UrgentAlert[];
  scanTimestamp: string;
}

export interface ScoredTopic {
  topic: string;
  angle: string;
  contentType: string;
  score: number;
  velocity: number;
  sources: string[];
  reasoning: string;
  isExploration: boolean;
}

export interface UrgentAlert {
  topic: string;
  velocity: number;
  sources: string[];
  detectedAt: string;
}

// ── Content Producer Outputs ──────────────────────────────

export interface ContentProducerResult {
  pipelineRunId?: string;
  topic: string;
  qualityScore: number;
  autoApproved: boolean;
  platformVariants: PlatformVariant[];
  publicationIds: string[];
}

export interface PlatformVariant {
  platform: string;
  text: string;
  hashtags: string[];
}

// ── Growth Analyst Outputs ────────────────────────────────

export interface GrowthReport {
  period: "daily" | "weekly";
  date: string;
  performance: {
    totalPosts: number;
    avgEngagement: number;
    topPerformingTopics: string[];
    underperformingTopics: string[];
    engagementTrend: string;
  };
  cost: {
    totalUsd: number;
    byAgent: Record<string, number>;
    budgetUsedPercent: number;
  };
  followers: {
    total: number;
    change: number;
    changePercent: number;
  };
  recommendations: string[];
}

// ── Community Manager Outputs ─────────────────────────────

export interface CommunityReport {
  repliesSent: number;
  sentimentSummary: {
    positive: number;
    neutral: number;
    negative: number;
    negativeRatio: number;
  };
  contentIdeas: string[];
  escalations: string[];
}
