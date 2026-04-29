/**
 * Feedback Analyzer — learns from published content performance.
 *
 * A) Topic Performance Learning — which topics/categories perform best
 * B) Golden Example Auto-Selection — top 20% articles become few-shot examples
 * C) Rubric Weight Calibration — correlate editor scores with real engagement
 * D) Anti-Clickbait Guardrails — monitor QCR and diversity
 *
 * Cold start thresholds:
 *   A) 20+ articles — begin tracking
 *   B) 50+ articles — enable auto golden example selection
 *   C) 100+ articles — enable rubric calibration
 *   D) Always active (monitoring)
 */
import { prisma } from "@/lib/db";

// ── A) Topic Performance Learning ──────────────────────

export interface TopicInsight {
  topic: string;
  category: string;
  articleCount: number;
  avgEngagement: number;
  trend: "rising" | "stable" | "declining";
}

export async function analyzeTopicPerformance(): Promise<{
  insights: TopicInsight[];
  totalArticles: number;
}> {
  const runs = await prisma.pipelineRun.findMany({
    where: {
      feedbackStatus: "complete",
      engagementRate: { not: null },
    },
    select: {
      topic: true,
      contentType: true,
      engagementRate: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  if (runs.length < 20) {
    return { insights: [], totalArticles: runs.length };
  }

  // Group by content type (category)
  const groups = new Map<string, { engagement: number[]; recent: number[]; older: number[] }>();
  const midpoint = new Date();
  midpoint.setDate(midpoint.getDate() - 30);

  for (const run of runs) {
    const key = run.contentType;
    if (!groups.has(key)) groups.set(key, { engagement: [], recent: [], older: [] });
    const g = groups.get(key)!;
    const rate = run.engagementRate ?? 0;
    g.engagement.push(rate);
    if (run.publishedAt && run.publishedAt > midpoint) {
      g.recent.push(rate);
    } else {
      g.older.push(rate);
    }
  }

  const insights: TopicInsight[] = [];
  for (const [category, data] of groups) {
    const avg = mean(data.engagement);
    const recentAvg = data.recent.length > 0 ? mean(data.recent) : avg;
    const olderAvg = data.older.length > 0 ? mean(data.older) : avg;

    let trend: TopicInsight["trend"] = "stable";
    if (recentAvg > olderAvg * 1.1) trend = "rising";
    if (recentAvg < olderAvg * 0.9) trend = "declining";

    insights.push({
      topic: category,
      category,
      articleCount: data.engagement.length,
      avgEngagement: avg,
      trend,
    });

    // Update TopicPerformance table (per workspace, derived from this run's workspace if available)
    const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
    const workspaceId = await fallbackWorkspaceId();
    if (workspaceId) {
      await prisma.topicPerformance.upsert({
        where: { workspaceId_topic_category: { workspaceId, topic: category, category } },
        create: { workspaceId, topic: category, category, articleCount: data.engagement.length, avgEngagement: avg },
        update: { articleCount: data.engagement.length, avgEngagement: avg },
      });
    }
  }

  return {
    insights: insights.sort((a, b) => b.avgEngagement - a.avgEngagement),
    totalArticles: runs.length,
  };
}

// ── B) Golden Example Auto-Selection ───────────────────

export interface GoldenExampleUpdate {
  personaId: string;
  personaName: string;
  contentType: string;
  selectedCount: number;
}

export async function autoSelectGoldenExamples(): Promise<{
  updates: GoldenExampleUpdate[];
  skipped: string;
}> {
  const completedRuns = await prisma.pipelineRun.count({
    where: { feedbackStatus: "complete" },
  });

  if (completedRuns < 50) {
    return { updates: [], skipped: `Need 50+ completed articles, have ${completedRuns}` };
  }

  // Get all active personas
  const personas = await prisma.writingPersona.findMany({
    where: { isActive: true },
    select: { id: true, name: true, goldenExamples: true },
  });

  const updates: GoldenExampleUpdate[] = [];

  for (const persona of personas) {
    // Find top 20% articles by engagement for this persona, grouped by content type
    for (const contentType of ["blog", "sns", "carousel", "review"]) {
      const runs = await prisma.pipelineRun.findMany({
        where: {
          personaId: persona.id,
          contentType,
          feedbackStatus: "complete",
          engagementRate: { not: null },
          editedContent: { not: null },
        },
        orderBy: { engagementRate: "desc" },
        select: { editedContent: true, engagementRate: true },
      });

      if (runs.length < 5) continue; // need minimum data

      // Select top 20% (min 3, max 15 for short-form / 5 for long-form)
      const topCount = contentType === "sns"
        ? Math.min(15, Math.max(3, Math.ceil(runs.length * 0.2)))
        : Math.min(5, Math.max(3, Math.ceil(runs.length * 0.2)));

      const topExamples = runs.slice(0, topCount).map((r) => {
        const content = r.editedContent ?? "";
        // For blog, take first 500 chars as example excerpt
        return contentType === "blog" ? content.slice(0, 500) : content.slice(0, 280);
      });

      // Merge with existing golden examples (preserve manual entries)
      const existing = (persona.goldenExamples ?? {}) as Record<string, string[]>;
      existing[contentType] = topExamples;

      await prisma.writingPersona.update({
        where: { id: persona.id },
        data: { goldenExamples: existing },
      });

      updates.push({
        personaId: persona.id,
        personaName: persona.name,
        contentType,
        selectedCount: topExamples.length,
      });
    }
  }

  return { updates, skipped: "" };
}

// ── C) Rubric Weight Calibration ───────────────────────

export interface RubricCalibration {
  dimension: string;
  currentWeight: number;
  correlation: number;
  suggestedWeight: number;
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  factualAccuracy: 0.25,
  voiceAlignment: 0.20,
  readability: 0.20,
  originality: 0.20,
  seo: 0.15,
};

const MIN_WEIGHT = 0.10;
const MAX_WEIGHT = 0.35;
const MAX_SHIFT = 0.02; // max 2% change per calibration

export async function calibrateRubricWeights(): Promise<{
  calibrations: RubricCalibration[];
  skipped: string;
}> {
  const completedRuns = await prisma.pipelineRun.count({
    where: { feedbackStatus: "complete" },
  });

  if (completedRuns < 100) {
    return {
      calibrations: [],
      skipped: `Need 100+ completed articles, have ${completedRuns}`,
    };
  }

  const runs = await prisma.pipelineRun.findMany({
    where: {
      feedbackStatus: "complete",
      engagementRate: { not: null },
      qualityScore: { not: { equals: null } },
    },
    select: { qualityScore: true, engagementRate: true },
  });

  // Calculate correlations between each dimension and engagement
  const dimensions = ["factualAccuracy", "voiceAlignment", "readability", "originality", "seo"];
  const engagements = runs.map((r) => r.engagementRate ?? 0);

  const calibrations: RubricCalibration[] = [];
  const correlations: Record<string, number> = {};

  for (const dim of dimensions) {
    const scores = runs.map((r) => {
      const qs = r.qualityScore as Record<string, number> | null;
      return qs?.[dim] ?? 0;
    });

    const corr = pearsonCorrelation(scores, engagements);
    correlations[dim] = corr;
  }

  // Normalize correlations to weights (positive correlations get more weight)
  const positiveCorrs = Object.values(correlations).map((c) => Math.max(0.01, c));
  const corrSum = positiveCorrs.reduce((s, v) => s + v, 0);

  for (const dim of dimensions) {
    const currentWeight = DEFAULT_WEIGHTS[dim] ?? 0.2;
    const rawCorr = correlations[dim] ?? 0;
    const normalizedWeight = Math.max(0.01, rawCorr) / corrSum;

    // Gradual shift: move toward suggested weight by MAX_SHIFT
    let suggested = normalizedWeight;
    const diff = suggested - currentWeight;
    if (Math.abs(diff) > MAX_SHIFT) {
      suggested = currentWeight + Math.sign(diff) * MAX_SHIFT;
    }
    suggested = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, suggested));

    calibrations.push({
      dimension: dim,
      currentWeight,
      correlation: rawCorr,
      suggestedWeight: Math.round(suggested * 100) / 100,
    });
  }

  return { calibrations, skipped: "" };
}

// ── D) Anti-Clickbait Guardrails ───────────────────────

export interface GuardrailReport {
  qcrStatus: "healthy" | "warning" | "critical";
  qcrCurrent: number;
  qcrBaseline: number;
  diversityIndex: number;
  diversityStatus: "healthy" | "warning";
  alerts: string[];
}

export async function checkGuardrails(): Promise<GuardrailReport> {
  const alerts: string[] = [];

  // QCR check — compare last 30d vs overall baseline
  const recent30d = await prisma.pipelineRun.findMany({
    where: {
      feedbackStatus: "complete",
      contentQualityRatio: { not: null },
      publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { contentQualityRatio: true },
  });

  const allTime = await prisma.pipelineRun.findMany({
    where: {
      feedbackStatus: "complete",
      contentQualityRatio: { not: null },
    },
    select: { contentQualityRatio: true },
  });

  const qcrCurrent = mean(recent30d.map((r) => r.contentQualityRatio ?? 0));
  const qcrBaseline = mean(allTime.map((r) => r.contentQualityRatio ?? 0));

  let qcrStatus: GuardrailReport["qcrStatus"] = "healthy";
  if (qcrBaseline > 0) {
    const drop = (qcrBaseline - qcrCurrent) / qcrBaseline;
    if (drop > 0.2) {
      qcrStatus = "critical";
      alerts.push(`QCR dropped ${Math.round(drop * 100)}% from baseline — possible clickbait trend`);
    } else if (drop > 0.1) {
      qcrStatus = "warning";
      alerts.push(`QCR dropped ${Math.round(drop * 100)}% — monitor closely`);
    }
  }

  // Diversity check — Shannon entropy of content types in last 30 days
  const recentTypes = await prisma.pipelineRun.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      status: { in: ["approved", "reviewed"] },
    },
    select: { contentType: true },
  });

  const typeCounts = new Map<string, number>();
  for (const r of recentTypes) {
    typeCounts.set(r.contentType, (typeCounts.get(r.contentType) ?? 0) + 1);
  }

  const diversityIndex = shannonEntropy(typeCounts);
  let diversityStatus: GuardrailReport["diversityStatus"] = "healthy";

  // For 4 content types, max entropy is ln(4) ≈ 1.39. Below 0.5 = low diversity
  if (diversityIndex < 0.5 && recentTypes.length > 10) {
    diversityStatus = "warning";
    alerts.push(`Low content diversity (entropy: ${diversityIndex.toFixed(2)}) — increase exploration budget`);
  }

  return {
    qcrStatus,
    qcrCurrent,
    qcrBaseline,
    diversityIndex,
    diversityStatus,
    alerts,
  };
}

// ── Full feedback analysis run ─────────────────────────

export interface FeedbackAnalysisResult {
  topicInsights: TopicInsight[];
  goldenExampleUpdates: GoldenExampleUpdate[];
  rubricCalibrations: RubricCalibration[];
  guardrails: GuardrailReport;
  totalArticles: number;
}

export async function runFeedbackAnalysis(): Promise<FeedbackAnalysisResult> {
  const [topicResult, goldenResult, rubricResult, guardrails] = await Promise.all([
    analyzeTopicPerformance(),
    autoSelectGoldenExamples(),
    calibrateRubricWeights(),
    checkGuardrails(),
  ]);

  return {
    topicInsights: topicResult.insights,
    goldenExampleUpdates: goldenResult.updates,
    rubricCalibrations: rubricResult.calibrations,
    guardrails,
    totalArticles: topicResult.totalArticles,
  };
}

// ── Math utilities ─────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));

  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = (x[i] ?? 0) - mx;
    const yi = (y[i] ?? 0) - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }

  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function shannonEntropy(counts: Map<string, number>): number {
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of counts.values()) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log(p);
  }
  return entropy;
}
