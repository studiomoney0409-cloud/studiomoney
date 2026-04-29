/**
 * Style Performance Tracker — links visual design choices to engagement metrics.
 *
 * Dual storage: in-memory cache + Prisma DB.
 * Write: memory + DB in parallel.
 * Read: memory for fast queries, DB for full-history analytics.
 */

import type {
  DesignContentType,
  DesignFormat,
  DesignPlatform,
  TypographyMood,
  LayoutStyle,
  ColorMood,
} from "./types";

// ── Types ──────────────────────────────────────────────

export interface StylePerformanceRecord {
  id: string;
  /** Workspace owning this record. Optional for legacy callers; resolved to default workspace. */
  workspaceId?: string;
  createdAt: number;

  // Design metadata
  contentType: DesignContentType;
  format: DesignFormat;
  platform: DesignPlatform;
  templateId?: string;
  designPath: "template" | "generated" | "motion" | "data_viz";

  // Style attributes
  typographyMood?: TypographyMood;
  layoutStyle?: LayoutStyle;
  colorMood?: ColorMood;
  primaryColor?: string;
  accentColor?: string;
  hasImage: boolean;
  slideCount: number;

  // Engagement metrics (filled asynchronously after publishing)
  impressions?: number;
  engagements?: number;
  saves?: number;
  shares?: number;
  clicks?: number;
  engagementRate?: number; // engagements / impressions
}

export interface StyleInsight {
  attribute: string;
  value: string;
  avgEngagementRate: number;
  sampleSize: number;
  comparedToAvg: number; // percentage above/below overall average
}

export interface StyleRecommendation {
  contentType: DesignContentType;
  platform: DesignPlatform;
  recommendedStyles: {
    typographyMood?: TypographyMood;
    layoutStyle?: LayoutStyle;
    colorMood?: ColorMood;
    designPath?: string;
  };
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

// ── Prisma helper ───────────────────────────────────────

let _prisma: ReturnType<typeof getPrisma> | null = null;

function getPrisma() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require("@/lib/db") as { prisma: import("../../generated/prisma/client").PrismaClient };
    return prisma;
  } catch {
    return null;
  }
}

function db() {
  if (_prisma === null) _prisma = getPrisma();
  return _prisma;
}

// ── In-memory store ────────────────────────────────────

const performanceRecords: StylePerformanceRecord[] = [];
const MAX_RECORDS = 2000;

/**
 * Record a new design with its style attributes (engagement metrics added later).
 */
export function recordDesignStyle(record: StylePerformanceRecord): void {
  performanceRecords.push(record);
  if (performanceRecords.length > MAX_RECORDS) {
    performanceRecords.splice(0, performanceRecords.length - MAX_RECORDS);
  }

  // Persist to DB (fire-and-forget)
  const p = db();
  if (p) {
    void (async () => {
      const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
      const workspaceId = record.workspaceId ?? (await fallbackWorkspaceId());
      if (!workspaceId) return;
      await p.stylePerformanceEntry.upsert({
        where: { id: record.id },
        create: {
          id: record.id,
          workspaceId,
          contentType: record.contentType,
          format: record.format,
          platform: record.platform,
          templateId: record.templateId,
          designPath: record.designPath,
          typographyMood: record.typographyMood,
          layoutStyle: record.layoutStyle,
          colorMood: record.colorMood,
          primaryColor: record.primaryColor,
          accentColor: record.accentColor,
          hasImage: record.hasImage,
          slideCount: record.slideCount,
          createdAt: new Date(record.createdAt),
        },
        update: {},
      });
    })().catch(() => {});
  }
}

/**
 * Update engagement metrics for a design after publishing.
 */
export function updateEngagement(
  id: string,
  metrics: {
    impressions?: number;
    engagements?: number;
    saves?: number;
    shares?: number;
    clicks?: number;
  },
): boolean {
  const record = performanceRecords.find((r) => r.id === id);
  if (!record) return false;

  if (metrics.impressions !== undefined) record.impressions = metrics.impressions;
  if (metrics.engagements !== undefined) record.engagements = metrics.engagements;
  if (metrics.saves !== undefined) record.saves = metrics.saves;
  if (metrics.shares !== undefined) record.shares = metrics.shares;
  if (metrics.clicks !== undefined) record.clicks = metrics.clicks;

  // Compute engagement rate
  if (record.impressions && record.impressions > 0 && record.engagements !== undefined) {
    record.engagementRate = record.engagements / record.impressions;
  }

  // Persist to DB (fire-and-forget)
  const p = db();
  if (p) {
    void p.stylePerformanceEntry.update({
      where: { id },
      data: {
        impressions: record.impressions,
        engagements: record.engagements,
        saves: record.saves,
        shares: record.shares,
        clicks: record.clicks,
        engagementRate: record.engagementRate,
      },
    }).catch(() => {});
  }

  return true;
}

/**
 * Get performance insights — which style attributes correlate with higher engagement.
 */
export function getStyleInsights(
  filter?: { contentType?: DesignContentType; platform?: DesignPlatform },
): StyleInsight[] {
  // Only consider records with engagement data
  let records = performanceRecords.filter((r) => r.engagementRate !== undefined && r.engagementRate > 0);

  if (filter?.contentType) records = records.filter((r) => r.contentType === filter.contentType);
  if (filter?.platform) records = records.filter((r) => r.platform === filter.platform);

  if (records.length < 3) return [];

  const overallAvg = records.reduce((s, r) => s + (r.engagementRate ?? 0), 0) / records.length;
  const insights: StyleInsight[] = [];

  // Analyze each style attribute
  const attributeAnalyzers: Array<{
    attribute: string;
    getValue: (r: StylePerformanceRecord) => string | undefined;
  }> = [
    { attribute: "typographyMood", getValue: (r) => r.typographyMood },
    { attribute: "layoutStyle", getValue: (r) => r.layoutStyle },
    { attribute: "colorMood", getValue: (r) => r.colorMood },
    { attribute: "designPath", getValue: (r) => r.designPath },
    { attribute: "hasImage", getValue: (r) => String(r.hasImage) },
    { attribute: "templateId", getValue: (r) => r.templateId },
  ];

  for (const { attribute, getValue } of attributeAnalyzers) {
    const groups = new Map<string, number[]>();

    for (const r of records) {
      const val = getValue(r);
      if (!val) continue;
      const arr = groups.get(val) ?? [];
      arr.push(r.engagementRate ?? 0);
      groups.set(val, arr);
    }

    for (const [value, rates] of groups) {
      if (rates.length < 2) continue;
      const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
      insights.push({
        attribute,
        value,
        avgEngagementRate: Math.round(avg * 10000) / 10000,
        sampleSize: rates.length,
        comparedToAvg: overallAvg > 0
          ? Math.round(((avg - overallAvg) / overallAvg) * 100)
          : 0,
      });
    }
  }

  // Sort by engagement rate descending
  return insights.sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
}

/**
 * Get style recommendation for a given content type and platform.
 */
export function getStyleRecommendation(
  contentType: DesignContentType,
  platform: DesignPlatform,
): StyleRecommendation {
  const insights = getStyleInsights({ contentType, platform });

  const allInsights = insights.length >= 3
    ? insights
    : getStyleInsights({ contentType });

  const topByAttribute = new Map<string, StyleInsight>();
  for (const insight of allInsights) {
    if (insight.sampleSize < 2) continue;
    const existing = topByAttribute.get(insight.attribute);
    if (!existing || insight.avgEngagementRate > existing.avgEngagementRate) {
      topByAttribute.set(insight.attribute, insight);
    }
  }

  const typo = topByAttribute.get("typographyMood");
  const layout = topByAttribute.get("layoutStyle");
  const color = topByAttribute.get("colorMood");
  const path = topByAttribute.get("designPath");

  const totalSamples = allInsights.reduce((s, i) => s + i.sampleSize, 0);
  const confidence: "high" | "medium" | "low" =
    totalSamples >= 50 ? "high" : totalSamples >= 15 ? "medium" : "low";

  const reasoningParts: string[] = [];
  if (typo) reasoningParts.push(`${typo.value} 타이포: 참여율 ${typo.comparedToAvg >= 0 ? "+" : ""}${String(typo.comparedToAvg)}%`);
  if (layout) reasoningParts.push(`${layout.value} 레이아웃: 참여율 ${layout.comparedToAvg >= 0 ? "+" : ""}${String(layout.comparedToAvg)}%`);
  if (color) reasoningParts.push(`${color.value} 색상: 참여율 ${color.comparedToAvg >= 0 ? "+" : ""}${String(color.comparedToAvg)}%`);

  return {
    contentType,
    platform,
    recommendedStyles: {
      typographyMood: typo?.value as TypographyMood | undefined,
      layoutStyle: layout?.value as LayoutStyle | undefined,
      colorMood: color?.value as ColorMood | undefined,
      designPath: path?.value,
    },
    reasoning: reasoningParts.length > 0
      ? `과거 데이터 기반: ${reasoningParts.join(", ")}`
      : "충분한 성과 데이터가 없습니다. 기본 스타일을 사용합니다.",
    confidence,
  };
}

/**
 * Get top performing templates by engagement rate.
 */
export function getTopTemplates(
  limit: number = 10,
  filter?: { contentType?: DesignContentType; platform?: DesignPlatform },
): Array<{ templateId: string; avgEngagementRate: number; sampleSize: number }> {
  let records = performanceRecords.filter((r) => r.engagementRate !== undefined && r.templateId);
  if (filter?.contentType) records = records.filter((r) => r.contentType === filter.contentType);
  if (filter?.platform) records = records.filter((r) => r.platform === filter.platform);

  const groups = new Map<string, number[]>();
  for (const r of records) {
    if (!r.templateId) continue;
    const arr = groups.get(r.templateId) ?? [];
    arr.push(r.engagementRate ?? 0);
    groups.set(r.templateId, arr);
  }

  return Array.from(groups.entries())
    .map(([templateId, rates]) => ({
      templateId,
      avgEngagementRate: Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 10000) / 10000,
      sampleSize: rates.length,
    }))
    .filter((t) => t.sampleSize >= 2)
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
    .slice(0, limit);
}

/**
 * Get all performance records (for export/debugging).
 */
export function getPerformanceRecords(limit: number = 50): StylePerformanceRecord[] {
  return performanceRecords.slice(-limit).reverse();
}

/**
 * Get summary statistics.
 */
export function getPerformanceSummary(): {
  totalRecords: number;
  withEngagement: number;
  avgEngagementRate: number;
  topContentType: string | null;
  topPlatform: string | null;
} {
  const withEngagement = performanceRecords.filter((r) => r.engagementRate !== undefined);
  const avgRate = withEngagement.length > 0
    ? withEngagement.reduce((s, r) => s + (r.engagementRate ?? 0), 0) / withEngagement.length
    : 0;

  // Find top content type and platform by average engagement rate
  const ctGroups = new Map<string, number[]>();
  const platGroups = new Map<string, number[]>();
  for (const r of withEngagement) {
    const ctArr = ctGroups.get(r.contentType) ?? [];
    ctArr.push(r.engagementRate ?? 0);
    ctGroups.set(r.contentType, ctArr);
    const platArr = platGroups.get(r.platform) ?? [];
    platArr.push(r.engagementRate ?? 0);
    platGroups.set(r.platform, platArr);
  }

  let topCt: string | null = null;
  let topCtRate = 0;
  for (const [ct, rates] of ctGroups) {
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    if (avg > topCtRate) { topCt = ct; topCtRate = avg; }
  }

  let topPlat: string | null = null;
  let topPlatRate = 0;
  for (const [p, rates] of platGroups) {
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    if (avg > topPlatRate) { topPlat = p; topPlatRate = avg; }
  }

  return {
    totalRecords: performanceRecords.length,
    withEngagement: withEngagement.length,
    avgEngagementRate: Math.round(avgRate * 10000) / 10000,
    topContentType: topCt,
    topPlatform: topPlat,
  };
}

/**
 * Load records from DB into memory (call on startup).
 */
export async function warmPerformanceCache(limit: number = 500): Promise<number> {
  const p = db();
  if (!p) return 0;

  try {
    const rows = await p.stylePerformanceEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const existing = new Set(performanceRecords.map((r) => r.id));
    let loaded = 0;
    for (const row of rows) {
      if (existing.has(row.id)) continue;
      performanceRecords.push({
        id: row.id,
        createdAt: row.createdAt.getTime(),
        contentType: row.contentType as DesignContentType,
        format: row.format as DesignFormat,
        platform: row.platform as DesignPlatform,
        templateId: row.templateId ?? undefined,
        designPath: row.designPath as StylePerformanceRecord["designPath"],
        typographyMood: (row.typographyMood as TypographyMood) ?? undefined,
        layoutStyle: (row.layoutStyle as LayoutStyle) ?? undefined,
        colorMood: (row.colorMood as ColorMood) ?? undefined,
        primaryColor: row.primaryColor ?? undefined,
        accentColor: row.accentColor ?? undefined,
        hasImage: row.hasImage,
        slideCount: row.slideCount,
        impressions: row.impressions ?? undefined,
        engagements: row.engagements ?? undefined,
        saves: row.saves ?? undefined,
        shares: row.shares ?? undefined,
        clicks: row.clicks ?? undefined,
        engagementRate: row.engagementRate ?? undefined,
      });
      loaded++;
    }
    return loaded;
  } catch {
    return 0;
  }
}

/**
 * Clear all records (for testing).
 */
export function clearPerformanceRecords(): void {
  performanceRecords.length = 0;
}
