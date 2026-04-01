/**
 * Multi-Agent System — Inngest Event Definitions
 *
 * All agent-to-agent communication goes through these typed events.
 */
import type {
  DailyAssignment,
  TrendBriefing,
  ContentProducerResult,
  GrowthReport,
  UrgentAlert,
  CopyEditorResult,
  SeoOptimizationResult,
  ContentCuratorResult,
  MonetizationResult,
  PartnershipResult,
  NewsletterResult,
} from "./types";

// ── Event Data Types ──────────────────────────────────────

export interface AgentEvents {
  // Trend Scout → Chief Editor
  "agent/trend-scout.briefing": {
    data: {
      briefing: TrendBriefing;
      agentRunId: string;
    };
  };

  // Trend Scout → Chief Editor (urgent)
  "agent/trend-scout.urgent-alert": {
    data: {
      alert: UrgentAlert;
      agentRunId: string;
    };
  };

  // Chief Editor → Content Producer (daily assignments)
  "agent/chief-editor.daily-briefing": {
    data: {
      date: string; // ISO date
      assignments: DailyAssignment[];
      briefingId: string;
      agentRunId: string;
    };
  };

  // Chief Editor → Content Producer (urgent content)
  "agent/chief-editor.urgent-content": {
    data: {
      assignment: DailyAssignment;
      reason: string;
      agentRunId: string;
    };
  };

  // Chief Editor → (broadcast) weekly plan created
  "agent/chief-editor.weekly-plan": {
    data: {
      weeklyPlanId: string;
      weekStart: string;
      agentRunId: string;
    };
  };

  // Content Producer → Design Director
  "agent/content-producer.complete": {
    data: {
      result: ContentProducerResult;
      articleContent: string;
      topic: string;
      platforms: string[];
      personaId?: string;
      agentRunId: string;
    };
  };

  // Design Director → (done)
  "agent/design-director.complete": {
    data: {
      topic: string;
      designAssets: Array<{ platform: string; imageUrl?: string }>;
      publicationIds: string[];
      agentRunId: string;
    };
  };

  // Growth Analyst → Chief Editor
  "agent/growth-analyst.report": {
    data: {
      report: GrowthReport;
      agentRunId: string;
    };
  };

  // Community Manager → Chief Editor (escalation)
  "agent/community-manager.escalation": {
    data: {
      type: "negative-surge" | "content-idea" | "crisis";
      details: string;
      agentRunId: string;
    };
  };

  // Image Gate — candidates ready for human review
  "agent/image-gate.candidates-ready": {
    data: {
      imageGateId: string;
      topic: string;
      candidateCount: number;
      agentRunId: string;
    };
  };

  // Image Gate — human selected images, trigger Design Director
  "agent/image-gate.selected": {
    data: {
      imageGateId: string;
      topic: string;
      selectedUrls: string[];
      platforms: string[];
      personaId?: string;
      pipelineRunId?: string;
      agentRunId: string;
    };
  };

  // ── Copy Editor Events ───────────────────────────────────

  // Copy Editor → SEO Strategist (passed QA gate)
  "agent/copy-editor.passed": {
    data: {
      articleContent: string;
      topic: string;
      platforms: string[];
      pipelineRunId?: string;
      personaId?: string;
      publicationIds: string[];
      blogPostId?: string;
      agentRunId: string;
    };
  };

  // Copy Editor → Chief Editor (blocked publication)
  "agent/copy-editor.blocked": {
    data: {
      topic: string;
      blockReasons: string[];
      publicationIds: string[];
      agentRunId: string;
    };
  };

  // ── SEO Strategist Events ────────────────────────────────

  // SEO Strategist → Monetization Manager (pre-publish optimization done)
  "agent/seo-strategist.optimized": {
    data: {
      articleContent: string;
      topic: string;
      platforms: string[];
      blogPostId?: string;
      pipelineRunId?: string;
      personaId?: string;
      publicationIds: string[];
      seoKeywords: string[];
      agentRunId: string;
    };
  };

  // SEO Strategist → Chief Editor + Content Curator (weekly audit)
  "agent/seo-strategist.audit-complete": {
    data: {
      issuesFound: number;
      highPriorityCount: number;
      auditResults: SeoOptimizationResult["auditResults"];
      agentRunId: string;
    };
  };

  // ── Monetization Manager Events ──────────────────────────

  // Monetization Manager → Design Director (affiliate links inserted)
  "agent/monetization-manager.content-ready": {
    data: {
      articleContent: string;
      topic: string;
      platforms: string[];
      blogPostId?: string;
      pipelineRunId?: string;
      personaId?: string;
      publicationIds: string[];
      affiliateLinksInserted: number;
      agentRunId: string;
    };
  };

  // Monetization Manager → Chief Editor (weekly revenue report)
  "agent/monetization-manager.report": {
    data: {
      report: MonetizationResult["weeklyReport"];
      agentRunId: string;
    };
  };

  // ── Newsletter Manager Events ────────────────────────────

  // Newsletter Manager → Growth Analyst (tracking)
  "agent/newsletter-manager.sent": {
    data: {
      issueId: string;
      recipientCount: number;
      agentRunId: string;
    };
  };

  // ── Content Curator Events ───────────────────────────────

  // Content Curator → Chief Editor (schedule refreshes)
  "agent/content-curator.refresh-needed": {
    data: {
      stalePostIds: string[];
      evergreenPostIds: string[];
      agentRunId: string;
    };
  };

  // Content Curator → SEO Strategist (internal linking)
  "agent/content-curator.series-found": {
    data: {
      series: Array<{ articleIds: string[]; theme: string }>;
      agentRunId: string;
    };
  };

  // Content Curator → Content Producer (SNS re-promotion)
  "agent/content-curator.re-promote": {
    data: {
      blogPostId: string;
      suggestedPlatforms: string[];
      suggestion: string;
      agentRunId: string;
    };
  };

  // ── Partnership Manager Events ───────────────────────────

  // Partnership Manager → Chief Editor (weekly review)
  "agent/partnership-manager.review": {
    data: {
      review: PartnershipResult["weeklyReview"];
      agentRunId: string;
    };
  };

  // Partnership Manager → Chief Editor (new opportunity)
  "agent/partnership-manager.opportunity": {
    data: {
      entityName: string;
      entityType: string;
      priority: string;
      suggestedApproach: string;
      agentRunId: string;
    };
  };
}

/** Helper type to extract event names */
export type AgentEventName = keyof AgentEvents;
