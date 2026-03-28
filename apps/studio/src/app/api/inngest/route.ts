// Vercel Pro: allow up to 60s per step.run() invocation (LLM calls can take 10-30s)
export const maxDuration = 60;

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
import { designDirectorRun, designDirectorWithImages } from "@/lib/inngest/functions/design-director";
// Phase 4: Community Manager
import { communityManagerScan } from "@/lib/inngest/functions/community-manager";

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
    // Phase 4: Community Manager
    communityManagerScan,
  ],
});
