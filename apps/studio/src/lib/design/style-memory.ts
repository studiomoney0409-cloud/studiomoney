/**
 * Style Memory — caches extracted StyleTokens by artist/album.
 *
 * Two storage layers:
 *   1. In-memory LRU cache (fast, ephemeral)
 *   2. Prisma DB persistence (durable)
 *
 * Read: memory first → DB fallback → populate memory on hit.
 * Write: memory + DB in parallel.
 */

import type { StyleToken } from "./types";

// ── Types ───────────────────────────────────────────

export interface StyleMemoryEntry {
  /** Unique key: "artist:{spotifyId}" or "album:{spotifyId}" */
  key: string;
  /** Workspace owning this entry. Optional for legacy callers; resolved to default workspace. */
  workspaceId?: string;
  token: StyleToken;
  source: "spotify_album_art" | "user_upload" | "url_extraction";
  artistName?: string;
  albumName?: string;
  spotifyArtistId?: string;
  spotifyAlbumId?: string;
  confidence: number;       // 0-1, from extraction quality
  extractedAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface StyleMemoryStats {
  totalEntries: number;
  artistCount: number;
  albumCount: number;
  hitRate: number;          // cache hit ratio
}

// ── Prisma helper (lazy import to avoid circular deps) ──

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

// ── In-memory LRU store ─────────────────────────────

const MAX_ENTRIES = 500;
const store = new Map<string, StyleMemoryEntry>();
let queryCount = 0;
let hitCount = 0;

/** Build a cache key for an artist. */
export function artistKey(spotifyId: string): string {
  return `artist:${spotifyId}`;
}

/** Build a cache key for an album. */
export function albumKey(spotifyId: string): string {
  return `album:${spotifyId}`;
}

/**
 * Save a style token to memory + DB.
 */
export function saveStyleMemory(entry: Omit<StyleMemoryEntry, "accessCount" | "lastAccessedAt">): void {
  const full: StyleMemoryEntry = {
    ...entry,
    accessCount: 0,
    lastAccessedAt: new Date(),
  };

  // Evict oldest if over limit
  if (store.size >= MAX_ENTRIES && !store.has(entry.key)) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of store) {
      if (v.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = v.lastAccessedAt.getTime();
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  store.set(entry.key, full);

  // Persist to DB (fire-and-forget)
  const p = db();
  if (p) {
    void (async () => {
      const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
      const workspaceId = entry.workspaceId ?? (await fallbackWorkspaceId());
      if (!workspaceId) return;
      await p.styleMemoryEntry.upsert({
        where: { workspaceId_key: { workspaceId, key: entry.key } },
        create: {
          workspaceId,
          key: entry.key,
          tokenJson: JSON.parse(JSON.stringify(entry.token)),
          source: entry.source,
          artistName: entry.artistName ?? "",
          albumName: entry.albumName ?? "",
          spotifyArtistId: entry.spotifyArtistId ?? "",
          spotifyAlbumId: entry.spotifyAlbumId ?? "",
          confidence: entry.confidence,
          extractedAt: entry.extractedAt,
        },
        update: {
          tokenJson: JSON.parse(JSON.stringify(entry.token)),
          source: entry.source,
          artistName: entry.artistName ?? "",
          albumName: entry.albumName ?? "",
          confidence: entry.confidence,
          extractedAt: entry.extractedAt,
        },
      });
    })().catch(() => { /* DB unavailable — memory-only mode */ });
  }
}

/**
 * Get a cached style token by key. Returns undefined on miss.
 */
export function getStyleMemory(key: string): StyleToken | undefined {
  queryCount++;
  const entry = store.get(key);
  if (entry) {
    hitCount++;
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    touchDb(key);
    return entry.token;
  }
  return undefined;
}

/**
 * Get a cached style token, with async DB fallback.
 */
export async function getStyleMemoryAsync(key: string): Promise<StyleToken | undefined> {
  // Check memory first
  const memResult = getStyleMemory(key);
  if (memResult) return memResult;

  // DB fallback
  const p = db();
  if (!p) return undefined;

  try {
    const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
    const workspaceId = await fallbackWorkspaceId();
    if (!workspaceId) return undefined;
    const row = await p.styleMemoryEntry.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
    if (!row) return undefined;

    const token = row.tokenJson as unknown as StyleToken;
    // Populate memory cache
    store.set(key, {
      key,
      token,
      source: row.source as StyleMemoryEntry["source"],
      artistName: row.artistName || undefined,
      albumName: row.albumName || undefined,
      spotifyArtistId: row.spotifyArtistId || undefined,
      spotifyAlbumId: row.spotifyAlbumId || undefined,
      confidence: row.confidence,
      extractedAt: row.extractedAt,
      accessCount: row.accessCount + 1,
      lastAccessedAt: new Date(),
    });
    hitCount++;
    touchDb(key);
    return token;
  } catch {
    return undefined;
  }
}

/** Update access stats in DB (fire-and-forget). */
function touchDb(key: string): void {
  const p = db();
  if (!p) return;
  void (async () => {
    const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
    const workspaceId = await fallbackWorkspaceId();
    if (!workspaceId) return;
    await p.styleMemoryEntry.update({
      where: { workspaceId_key: { workspaceId, key } },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
  })().catch(() => {});
}

/**
 * Get the full entry (with metadata) by key.
 */
export function getStyleMemoryEntry(key: string): StyleMemoryEntry | undefined {
  return store.get(key);
}

/**
 * Look up a style token for an artist, falling back to their latest album.
 */
export function getArtistStyle(spotifyArtistId: string): StyleToken | undefined {
  // Try artist-level first
  const artistToken = getStyleMemory(artistKey(spotifyArtistId));
  if (artistToken) return artistToken;

  // Fall back to any album by this artist
  for (const entry of store.values()) {
    if (entry.spotifyArtistId === spotifyArtistId && entry.key.startsWith("album:")) {
      entry.accessCount++;
      entry.lastAccessedAt = new Date();
      hitCount++;
      return entry.token;
    }
  }

  return undefined;
}

/**
 * Get all cached tokens for an artist (artist-level + all albums).
 */
export function getArtistStyles(spotifyArtistId: string): StyleMemoryEntry[] {
  const results: StyleMemoryEntry[] = [];
  for (const entry of store.values()) {
    if (entry.spotifyArtistId === spotifyArtistId) {
      results.push(entry);
    }
  }
  return results.sort((a, b) => b.extractedAt.getTime() - a.extractedAt.getTime());
}

/**
 * Get recent entries.
 */
export function getRecentStyles(limit: number = 20): StyleMemoryEntry[] {
  return Array.from(store.values())
    .sort((a, b) => b.extractedAt.getTime() - a.extractedAt.getTime())
    .slice(0, limit);
}

/**
 * Get cache statistics.
 */
export function getStyleMemoryStats(): StyleMemoryStats {
  const artistIds = new Set<string>();
  const albumIds = new Set<string>();
  for (const entry of store.values()) {
    if (entry.key.startsWith("artist:")) artistIds.add(entry.key);
    if (entry.key.startsWith("album:")) albumIds.add(entry.key);
  }

  return {
    totalEntries: store.size,
    artistCount: artistIds.size,
    albumCount: albumIds.size,
    hitRate: queryCount > 0 ? Math.round((hitCount / queryCount) * 1000) / 1000 : 0,
  };
}

/**
 * Load entries from DB into memory cache (call on startup).
 */
export async function warmStyleMemoryCache(limit: number = 200): Promise<number> {
  const p = db();
  if (!p) return 0;

  try {
    const rows = await p.styleMemoryEntry.findMany({
      orderBy: { lastAccessedAt: "desc" },
      take: limit,
    });

    for (const row of rows) {
      if (store.has(row.key)) continue;
      store.set(row.key, {
        key: row.key,
        token: row.tokenJson as unknown as StyleToken,
        source: row.source as StyleMemoryEntry["source"],
        artistName: row.artistName || undefined,
        albumName: row.albumName || undefined,
        spotifyArtistId: row.spotifyArtistId || undefined,
        spotifyAlbumId: row.spotifyAlbumId || undefined,
        confidence: row.confidence,
        extractedAt: row.extractedAt,
        accessCount: row.accessCount,
        lastAccessedAt: row.lastAccessedAt,
      });
    }
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Clear all cached entries (for testing).
 */
export function clearStyleMemory(): void {
  store.clear();
  queryCount = 0;
  hitCount = 0;
}
