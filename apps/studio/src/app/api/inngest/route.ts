// Vercel Pro: allow up to 300s for Inngest step.run() invocations
// Content production pipeline chains multiple LLM calls (research→outline→write→edit)
// which can take 60-120s total per step. Inngest manages retries externally.
export const maxDuration = 300;

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { analyticsCollect } from "@/lib/inngest/functions/analytics";
import { commentFetch } from "@/lib/inngest/functions/comments";
import { autopilotScan } from "@/lib/inngest/functions/autopilot";
import { publishContent } from "@/lib/inngest/functions/publish";
import { keywordScan, dailyReset } from "@/lib/inngest/functions/keywords";
import { personaLearn } from "@/lib/inngest/functions/persona";
import { replySend } from "@/lib/inngest/functions/reply";
import { keywordCommentPost } from "@/lib/inngest/functions/keyword-comment";
import { onboardAnalyze } from "@/lib/inngest/functions/onboard";
// Phase 1: Chief Editor
import {
  chiefEditorWeekly,
  chiefEditorDaily,
  chiefEditorEmergency,
} from "@/lib/inngest/functions/chief-editor";
// Phase 2: Trend Scout + Content Producer
import { trendScoutScan } from "@/lib/inngest/functions/trend-scout";
import {
  contentProducerRun,
  contentProducerUrgent,
} from "@/lib/inngest/functions/content-producer";
// Phase 3: Growth Analyst + Design Director
import {
  growthAnalystDaily,
  growthAnalystWeekly,
} from "@/lib/inngest/functions/growth-analyst";
import { designDirectorRun, designDirectorWithImages, designDirectorFromPipeline } from "@/lib/inngest/functions/design-director";
// Phase 4: Community Manager
import { communityManagerScan } from "@/lib/inngest/functions/community-manager";
// Phase 5: Auto-publish + Feedback Loop
import { autoPublishAfterDesign } from "@/lib/inngest/functions/auto-publish";
import { feedbackLoop } from "@/lib/inngest/functions/feedback-loop";
// Phase 6: Copy Editor → SEO → Monetization (publication pipeline gate)
import { copyEditorGate } from "@/lib/inngest/functions/copy-editor";
import { seoStrategistPrePublish, seoStrategistAudit } from "@/lib/inngest/functions/seo-strategist";
import { monetizationAffiliateInsert, monetizationWeeklyReport } from "@/lib/inngest/functions/monetization-manager";
// Phase 7: Content Curator + Newsletter + Partnership
import { contentCuratorAudit, contentCuratorLinkNew } from "@/lib/inngest/functions/content-curator";
import { newsletterWeeklyDigest } from "@/lib/inngest/functions/newsletter-manager";
import { partnershipWeeklyReview, partnershipOpportunityScan } from "@/lib/inngest/functions/partnership-manager";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Existing
    analyticsCollect,
    commentFetch,
    autopilotScan,
    publishContent,
    keywordScan,
    dailyReset,
    personaLearn,
    replySend,
    keywordCommentPost,
    onboardAnalyze,
    // Phase 1: Chief Editor Agent
    chiefEditorWeekly,
    chiefEditorDaily,
    chiefEditorEmergency,
    // Phase 2: Trend Scout + Content Producer
    trendScoutScan,
    contentProducerRun,
    contentProducerUrgent,
    // Phase 3: Growth Analyst + Design Director
    growthAnalystDaily,
    growthAnalystWeekly,
    designDirectorRun,
    designDirectorWithImages,
    designDirectorFromPipeline,
    // Phase 4: Community Manager
    communityManagerScan,
    // Phase 5: Auto-publish after design + Feedback learning loop
    autoPublishAfterDesign,
    feedbackLoop,
    // Phase 6: Copy Editor → SEO Strategist → Monetization Manager
    copyEditorGate,
    seoStrategistPrePublish,
    seoStrategistAudit,
    monetizationAffiliateInsert,
    monetizationWeeklyReport,
    // Phase 7: Content Curator + Newsletter + Partnership
    contentCuratorAudit,
    contentCuratorLinkNew,
    newsletterWeeklyDigest,
    partnershipWeeklyReview,
    partnershipOpportunityScan,
  ],
});
