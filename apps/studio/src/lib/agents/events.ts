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
}

/** Helper type to extract event names */
export type AgentEventName = keyof AgentEvents;
