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
  | "community-manager"
  | "copy-editor"
  | "seo-strategist"
  | "newsletter-manager"
  | "content-curator"
  | "monetization-manager"
  | "partnership-manager";

export const AGENT_LABELS: Record<AgentName, string> = {
  "chief-editor": "편집장",
  "trend-scout": "트렌드 스카우트",
  "content-producer": "콘텐츠 프로듀서",
  "design-director": "디자인 디렉터",
  "growth-analyst": "성장 분석가",
  "community-manager": "커뮤니티 매니저",
  "copy-editor": "교정 에디터",
  "seo-strategist": "SEO 전략가",
  "newsletter-manager": "뉴스레터 매니저",
  "content-curator": "콘텐츠 큐레이터",
  "monetization-manager": "수익화 매니저",
  "partnership-manager": "제휴 매니저",
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
  blogPostId?: string;
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

// ── Copy Editor Outputs ──────────────────────────────────

export interface CopyEditorResult {
  crossArticleIssues: Array<{
    type: "contradiction" | "duplication" | "tone-drift";
    message: string;
    relatedArticleId?: string;
  }>;
  verdict: "passed" | "needs-review" | "blocked";
  blockReasons: string[];
  issueCount: number;
  publicationsUpdated: number;
}

// ── SEO Strategist Outputs ───────────────────────────────

export interface SeoOptimizationResult {
  mode: "pre-publish" | "audit";
  optimizedSeo?: {
    seoTitle: string;
    seoDescription: string;
    seoKeywords: string[];
    internalLinks: Array<{ slug: string; anchorText: string; relevanceScore: number }>;
    schemaOrg: Record<string, unknown>;
    keywordDensity: Record<string, number>;
  };
  auditResults?: Array<{
    blogPostId: string;
    slug: string;
    issues: Array<{ type: string; severity: "high" | "medium" | "low"; suggestion: string }>;
    estimatedImpact: "high" | "medium" | "low";
  }>;
  totalAudited?: number;
  issuesFound?: number;
}

// ── Newsletter Manager Outputs ───────────────────────────

export interface NewsletterResult {
  issueId: string;
  subject: string;
  subjectVariantB?: string;
  articleCount: number;
  recipientCount: number;
  segmentsSent: number;
  status: "sent" | "scheduled" | "failed";
}

// ── Content Curator Outputs ──────────────────────────────

export interface ContentCuratorResult {
  mode: "audit" | "link-new";
  staleContent: Array<{
    blogPostId: string;
    slug: string;
    daysSinceUpdate: number;
    currentTraffic: number;
    refreshPriority: "high" | "medium" | "low";
    suggestedUpdates: string[];
  }>;
  evergreenContent: Array<{
    blogPostId: string;
    slug: string;
    rePromotionSuggestion: string;
    suggestedPlatforms: string[];
  }>;
  seriesConnections: Array<{
    articles: Array<{ blogPostId: string; title: string }>;
    seriesTheme: string;
    similarityScore: number;
  }>;
  repurposingOpportunities: Array<{
    sourceBlogPostId: string;
    sourceFormat: string;
    targetFormat: string;
    reasoning: string;
  }>;
}

// ── Monetization Manager Outputs ─────────────────────────

export interface MonetizationResult {
  mode: "weekly-report" | "affiliate-insert" | "roi-update";
  weeklyReport?: {
    totalRevenue: number;
    bySource: Record<string, number>;
    activeDealCount: number;
    upcomingDeadlines: Array<{ dealId: string; sponsor: string; deadline: string }>;
    topRoiContent: Array<{ blogPostId: string; roi: number; revenue: number; cost: number }>;
    recommendations: string[];
  };
  affiliateInsert?: {
    linksInserted: number;
    affiliateIds: string[];
  };
}

// ── Partnership Manager Outputs ──────────────────────────

export interface PartnershipResult {
  mode: "weekly-review" | "opportunity-scan";
  weeklyReview?: {
    activePartners: number;
    inProgressCollabs: number;
    pendingOutreach: number;
    overdueTasks: Array<{ partnerId: string; task: string; daysOverdue: number }>;
    upcomingReleases: Array<{ artistName: string; albumTitle: string; releaseDate: string }>;
    recommendations: string[];
  };
  opportunities?: Array<{
    entityName: string;
    entityType: "artist" | "label" | "venue" | "festival";
    trendVelocity: number;
    existingRelationship: boolean;
    suggestedApproach: string;
    priority: "high" | "medium" | "low";
  }>;
}
