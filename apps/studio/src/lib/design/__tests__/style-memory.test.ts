/**
 * Style Memory — Unit Test (no LLM required).
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  saveStyleMemory,
  getStyleMemory,
  getStyleMemoryEntry,
  getArtistStyle,
  getArtistStyles,
  getRecentStyles,
  getStyleMemoryStats,
  clearStyleMemory,
  artistKey,
  albumKey,
} from "../style-memory";
import type { StyleToken } from "../types";

function makeToken(overrides: Partial<StyleToken> = {}): StyleToken {
  return {
    id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: "Test Style",
    colors: {
      palette: ["#6C5CE7", "#00CEC9", "#FD79A8"],
      ratios: [0.5, 0.3, 0.2],
      gradient: "linear-gradient(135deg, #6C5CE7, #00CEC9)",
    },
    typography: {
      mood: "sans_modern",
      weight: "bold",
      style: "sans",
    },
    layout: {
      density: "balanced",
      alignment: "center",
      whitespace: "moderate",
    },
    effects: ["gradient", "shadow"],
    moodKeywords: ["vibrant", "modern", "energetic"],
    ...overrides,
  };
}

const T_BASE = Date.now();

describe("Style Memory", () => {
  beforeAll(() => {
    clearStyleMemory();
  });

  it("save + get by key", () => {
    const token = makeToken({ name: "BTS Style" });
    saveStyleMemory({
      key: albumKey("album123"),
      token,
      source: "spotify_album_art",
      artistName: "BTS",
      albumName: "Proof",
      spotifyArtistId: "artist_bts",
      spotifyAlbumId: "album123",
      confidence: 0.9,
      extractedAt: new Date(T_BASE),
    });

    const got = getStyleMemory(albumKey("album123"));
    expect(got).toBeDefined();
    expect(got!.name).toBe("BTS Style");
  });

  it("get entry with metadata", () => {
    const entry = getStyleMemoryEntry(albumKey("album123"));
    expect(entry).toBeDefined();
    expect(entry!.artistName).toBe("BTS");
    expect(entry!.confidence).toBe(0.9);
    expect(entry!.accessCount).toBe(1);
  });

  it("artist key lookup", () => {
    const token = makeToken({ name: "NewJeans Style" });
    saveStyleMemory({
      key: artistKey("artist_nj"),
      token,
      source: "spotify_album_art",
      artistName: "NewJeans",
      spotifyArtistId: "artist_nj",
      confidence: 0.85,
      extractedAt: new Date(T_BASE + 1000),
    });

    const got = getArtistStyle("artist_nj");
    expect(got).toBeDefined();
    expect(got!.name).toBe("NewJeans Style");
  });

  it("artist fallback to album", () => {
    const got = getArtistStyle("artist_bts");
    expect(got).toBeDefined();
    expect(got!.name).toBe("BTS Style");
  });

  it("get all artist styles", () => {
    saveStyleMemory({
      key: albumKey("album_nj2"),
      token: makeToken({ name: "NJ Album 2" }),
      source: "spotify_album_art",
      artistName: "NewJeans",
      spotifyArtistId: "artist_nj",
      spotifyAlbumId: "album_nj2",
      confidence: 0.8,
      extractedAt: new Date(T_BASE + 2000),
    });

    const styles = getArtistStyles("artist_nj");
    expect(styles.length).toBe(2);
  });

  it("recent styles", () => {
    const recent = getRecentStyles(10);
    expect(recent.length).toBe(3);
    expect(recent[0]!.key).toBe(albumKey("album_nj2"));
  });

  it("stats", () => {
    const stats = getStyleMemoryStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.artistCount).toBe(1);
    expect(stats.albumCount).toBe(2);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it("cache miss returns undefined", () => {
    const got = getStyleMemory("album:nonexistent");
    expect(got).toBeUndefined();
  });

  it("clear memory", () => {
    clearStyleMemory();
    const stats = getStyleMemoryStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.hitRate).toBe(0);
  });
});
