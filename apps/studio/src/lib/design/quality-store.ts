/**
 * Design Quality Store — persists and queries DesignQualityRecords.
 *
 * Dual storage: in-memory cache + Prisma DB.
 * Write: memory + DB in parallel.
 * Read: memory first, DB for analytics queries.
 */

import type {
  DesignContentType,
  DesignFormat,
  DesignPlatform,
  DesignQualityRecord,
  CriticVerdict,
} from "./types";

// ── Aggregate types ─────────────────────────────────────

export interface QualityStats {
  totalDesigns: number;
  averageScore: number;
  passRate: number;            // fraction 0-1
  averageIterations: number;
  averageTimeMs: number;
  byVerdict: Record<CriticVerdict, number>;
  byDesignPath: Record<string, { count: number; avgScore: number }>;
  byContentType: Record<string, { count: number; avgScore: number }>;
}

export interface QualityTrend {
  period: string;              // e.g., "2026-03-07"
  count: number;
  avgScore: number;
  passRate: number;
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

// ── In-memory store ─────────────────────────────────────

const records: DesignQualityRecord[] = [];
const MAX_RECORDS = 1000;

/**
 * Save a quality record to memory + DB.
 */
export function saveQualityRecord(record: DesignQualityRecord): void {
  records.push(record);
  // Evict oldest if over limit
  if (records.length > MAX_RECORDS) {
    records.splice(0, records.length - MAX_RECORDS);
  }

  // Persist to DB (fire-and-forget)
  const p = db();
  if (p) {
    void (async () => {
      const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
      const workspaceId = record.workspaceId ?? (await fallbackWorkspaceId());
      if (!workspaceId) return; // no workspace exists yet — skip persistence
      await p.designQualityEntry.upsert({
        where: { designId: record.designId },
        create: {
          workspaceId,
          designId: record.designId,
          contentType: record.contentType,
          format: record.format,
          platform: record.platform,
          scoresJson: JSON.parse(JSON.stringify(record.scores)),
          averageScore: record.averageScore,
          verdict: record.verdict,
          iterationCount: record.iterationCount,
          designPath: record.designPath,
          generationTimeMs: record.generationTimeMs,
          costUsd: record.costUsd,
        },
        update: {
          scoresJson: JSON.parse(JSON.stringify(record.scores)),
          averageScore: record.averageScore,
          verdict: record.verdict,
          iterationCount: record.iterationCount,
          generationTimeMs: record.generationTimeMs,
          costUsd: record.costUsd,
        },
      });
    })().catch((err) => {
      console.warn("[quality-store] DB write failed:", (err as Error).message);
    });
  }
}

/**
 * Get a record by design ID.
 */
export function getQualityRecord(designId: string): DesignQualityRecord | undefined {
  return records.find((r) => r.designId === designId);
}

/**
 * Get a record by design ID, with DB fallback.
 */
export async function getQualityRecordAsync(designId: string): Promise<DesignQualityRecord | undefined> {
  const mem = getQualityRecord(designId);
  if (mem) return mem;

  const p = db();
  if (!p) return undefined;

  try {
    const row = await p.designQualityEntry.findUnique({ where: { designId } });
    if (!row) return undefined;
    return rowToRecord(row);
  } catch {
    return undefined;
  }
}

/**
 * Get recent records, newest first.
 */
export function getRecentRecords(limit: number = 20): DesignQualityRecord[] {
  return records.slice(-limit).reverse();
}

/**
 * Compute aggregate quality statistics.
 */
export function getQualityStats(
  filter?: {
    contentType?: DesignContentType;
    format?: DesignFormat;
    platform?: DesignPlatform;
  },
): QualityStats {
  let filtered = records;

  if (filter?.contentType) {
    filtered = filtered.filter((r) => r.contentType === filter.contentType);
  }
  if (filter?.format) {
    filtered = filtered.filter((r) => r.format === filter.format);
  }
  if (filter?.platform) {
    filtered = filtered.filter((r) => r.platform === filter.platform);
  }

  if (filtered.length === 0) {
    return {
      totalDesigns: 0,
      averageScore: 0,
      passRate: 0,
      averageIterations: 0,
      averageTimeMs: 0,
      byVerdict: { pass: 0, refine: 0, regenerate: 0 },
      byDesignPath: {},
      byContentType: {},
    };
  }

  const totalDesigns = filtered.length;
  const averageScore = filtered.reduce((s, r) => s + r.averageScore, 0) / totalDesigns;
  const passCount = filtered.filter((r) => r.verdict === "pass").length;
  const passRate = passCount / totalDesigns;
  const averageIterations = filtered.reduce((s, r) => s + r.iterationCount, 0) / totalDesigns;
  const averageTimeMs = filtered.reduce((s, r) => s + r.generationTimeMs, 0) / totalDesigns;

  // By verdict
  const byVerdict: Record<CriticVerdict, number> = { pass: 0, refine: 0, regenerate: 0 };
  for (const r of filtered) {
    byVerdict[r.verdict]++;
  }

  // By design path
  const byDesignPath: Record<string, { count: number; avgScore: number }> = {};
  for (const r of filtered) {
    const entry = byDesignPath[r.designPath] ?? { count: 0, avgScore: 0 };
    entry.avgScore = (entry.avgScore * entry.count + r.averageScore) / (entry.count + 1);
    entry.count++;
    byDesignPath[r.designPath] = entry;
  }

  // By content type
  const byContentType: Record<string, { count: number; avgScore: number }> = {};
  for (const r of filtered) {
    const entry = byContentType[r.contentType] ?? { count: 0, avgScore: 0 };
    entry.avgScore = (entry.avgScore * entry.count + r.averageScore) / (entry.count + 1);
    entry.count++;
    byContentType[r.contentType] = entry;
  }

  return {
    totalDesigns,
    averageScore: Math.round(averageScore * 100) / 100,
    passRate: Math.round(passRate * 1000) / 1000,
    averageIterations: Math.round(averageIterations * 10) / 10,
    averageTimeMs: Math.round(averageTimeMs),
    byVerdict,
    byDesignPath,
    byContentType,
  };
}

/**
 * Get quality trends grouped by day. Uses DB for full history.
 */
export async function getQualityTrendsAsync(days: number = 30): Promise<QualityTrend[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const p = db();
  if (p) {
    try {
      const rows = await p.designQualityEntry.findMany({
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: "asc" },
      });

      const dayMap = new Map<string, { scores: number[]; verdicts: string[] }>();
      for (const row of rows) {
        const day = row.createdAt.toISOString().slice(0, 10);
        const entry = dayMap.get(day) ?? { scores: [], verdicts: [] };
        entry.scores.push(row.averageScore);
        entry.verdicts.push(row.verdict);
        dayMap.set(day, entry);
      }

      return Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, data]) => ({
          period,
          count: data.scores.length,
          avgScore: Math.round(
            (data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 100,
          ) / 100,
          passRate: Math.round(
            (data.verdicts.filter((v) => v === "pass").length / data.verdicts.length) * 1000,
          ) / 1000,
        }));
    } catch {
      // Fall through to memory-based
    }
  }

  return getQualityTrends(days);
}

/**
 * Get quality trends from in-memory store (fallback).
 */
export function getQualityTrends(days: number = 30): QualityTrend[] {
  const dayMap = new Map<string, { scores: number[]; verdicts: CriticVerdict[] }>();

  for (const r of records) {
    const tsMatch = r.designId.match(/design_(\d+)/);
    if (!tsMatch) continue;
    const date = new Date(parseInt(tsMatch[1]!, 10));
    const day = date.toISOString().slice(0, 10);

    const entry = dayMap.get(day) ?? { scores: [], verdicts: [] };
    entry.scores.push(r.averageScore);
    entry.verdicts.push(r.verdict);
    dayMap.set(day, entry);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return Array.from(dayMap.entries())
    .filter(([day]) => day >= cutoffStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      count: data.scores.length,
      avgScore: Math.round(
        (data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 100,
      ) / 100,
      passRate: Math.round(
        (data.verdicts.filter((v) => v === "pass").length / data.verdicts.length) * 1000,
      ) / 1000,
    }));
}

/**
 * Load recent records from DB into memory (call on startup).
 */
export async function warmQualityCache(limit: number = 200): Promise<number> {
  const p = db();
  if (!p) return 0;

  try {
    const rows = await p.designQualityEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const existing = new Set(records.map((r) => r.designId));
    let loaded = 0;
    for (const row of rows) {
      if (existing.has(row.designId)) continue;
      records.push(rowToRecord(row));
      loaded++;
    }
    return loaded;
  } catch {
    return 0;
  }
}

// ── Helpers ──────────────────────────────────────────────

function rowToRecord(row: {
  designId: string;
  contentType: string;
  format: string;
  platform: string;
  scoresJson: unknown;
  averageScore: number;
  verdict: string;
  iterationCount: number;
  designPath: string;
  generationTimeMs: number;
  costUsd: number | null;
}): DesignQualityRecord {
  return {
    designId: row.designId,
    contentType: row.contentType as DesignContentType,
    format: row.format as DesignFormat,
    platform: row.platform as DesignPlatform,
    scores: row.scoresJson as DesignQualityRecord["scores"],
    averageScore: row.averageScore,
    verdict: row.verdict as CriticVerdict,
    iterationCount: row.iterationCount,
    designPath: row.designPath as DesignQualityRecord["designPath"],
    generationTimeMs: row.generationTimeMs,
    costUsd: row.costUsd ?? undefined,
  };
}

/**
 * Clear all records (for testing).
 */
export function clearQualityRecords(): void {
  records.length = 0;
}
