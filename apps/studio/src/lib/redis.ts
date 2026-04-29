/**
 * Redis client — shared singleton with graceful in-memory fallback.
 *
 * Env: REDIS_URL (e.g. "redis://localhost:6379" or "rediss://user:pass@host:port")
 * If REDIS_URL is not set or connection fails, all operations silently fall back
 * to an in-memory Map so the app works without Redis in dev/local.
 */

import Redis from "ioredis";

// ── Singleton client ────────────────────────────────────

let client: Redis | null = null;
let fallbackMode = false;

function getClient(): Redis | null {
  if (fallbackMode) return null;
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    fallbackMode = true;
    return null;
  }

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    client.on("error", () => {
      // Silently switch to fallback on persistent errors
      fallbackMode = true;
      client?.disconnect();
      client = null;
    });

    // Attempt connection (non-blocking)
    void client.connect().catch(() => {
      fallbackMode = true;
      client = null;
    });

    return client;
  } catch {
    fallbackMode = true;
    return null;
  }
}

// ── In-memory fallback ──────────────────────────────────

const memoryStore = new Map<string, { value: string; expiresAt: number | null }>();
const MEMORY_MAX = 500;

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSec?: number): void {
  // Evict oldest entries if over limit (batch evict 10% to avoid per-insert overhead)
  if (memoryStore.size >= MEMORY_MAX) {
    const evictCount = Math.max(1, Math.floor(MEMORY_MAX * 0.1));
    const keys = memoryStore.keys();
    for (let i = 0; i < evictCount; i++) {
      const { value, done } = keys.next();
      if (done) break;
      memoryStore.delete(value as string);
    }
  }
  memoryStore.set(key, {
    value,
    expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null,
  });
}

function memoryDel(key: string): void {
  memoryStore.delete(key);
}

// ── Public API ──────────────────────────────────────────

const KEY_PREFIX = "studio:";

/**
 * Get a cached value. Returns null on miss.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const redis = getClient();
  if (!redis) return memoryGet(KEY_PREFIX + key);

  try {
    return await redis.get(KEY_PREFIX + key);
  } catch {
    return memoryGet(KEY_PREFIX + key);
  }
}

/**
 * Set a cached value with optional TTL in seconds.
 */
export async function cacheSet(key: string, value: string, ttlSec?: number): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  memorySet(fullKey, value, ttlSec); // Always write to memory as L1

  const redis = getClient();
  if (!redis) return;

  try {
    if (ttlSec) {
      await redis.setex(fullKey, ttlSec, value);
    } else {
      await redis.set(fullKey, value);
    }
  } catch {
    // Silently fall back
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  const fullKey = KEY_PREFIX + key;
  memoryDel(fullKey);

  const redis = getClient();
  if (!redis) return;

  try {
    await redis.del(fullKey);
  } catch {
    // Silently fall back
  }
}

/**
 * Get a JSON-parsed value.
 */
export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value with optional TTL.
 */
export async function cacheSetJSON(key: string, value: unknown, ttlSec?: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSec);
}

/**
 * Check if Redis is connected (for health checks).
 */
export function isRedisConnected(): boolean {
  return !fallbackMode && client?.status === "ready";
}

/**
 * Build a workspace-scoped cache key. Use this for any cached data that depends
 * on a single workspace's content, configs, or analytics. Format: "ws:{workspaceId}:{...parts}".
 *
 * Example:
 *   wsKey(workspace.id, "trend-scout", "topics", keywords.join(","))
 *   // → "ws:cm9x...:trend-scout:topics:K-pop,indie"
 */
export function wsKey(workspaceId: string, ...parts: (string | number)[]): string {
  return ["ws", workspaceId, ...parts.map(String)].join(":");
}
