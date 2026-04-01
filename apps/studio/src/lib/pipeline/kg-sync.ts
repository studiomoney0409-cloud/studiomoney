/**
 * Knowledge Graph sync — populates MusicArtist/Album/Track/Relations from Spotify API.
 * Includes rate-limit detection and exponential backoff retry.
 */
import { prisma } from "@/lib/db";
import {
  searchArtist,
  getArtist,
  getArtistAlbums,
  getAlbumTracks,
  getAudioFeatures,
  getRelatedArtists,
} from "./spotify";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

/** Retry wrapper with exponential backoff for Spotify API rate limits. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") || err.message.toLowerCase().includes("rate limit"));
      const isTransient =
        err instanceof Error &&
        (err.message.includes("503") || err.message.includes("ECONNRESET"));

      if ((isRateLimit || isTransient) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[kg-sync] ${label}: retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[kg-sync] ${label}: max retries exceeded`);
}

export interface SyncResult {
  artist: { id: string; name: string; spotifyId: string };
  albumsSynced: number;
  tracksSynced: number;
  relationsSynced: number;
}

/**
 * Sync a single artist by name (searches Spotify, then syncs full data).
 */
export async function syncArtistByName(name: string): Promise<SyncResult | null> {
  const found = await withRetry(() => searchArtist(name), `searchArtist(${name})`);
  if (!found) return null;
  return syncArtistBySpotifyId(found.id);
}

/**
 * Sync a single artist by Spotify ID (full: artist + albums + tracks + relations).
 */
export async function syncArtistBySpotifyId(spotifyId: string): Promise<SyncResult> {
  // 1. Upsert artist
  const sp = await withRetry(() => getArtist(spotifyId), `getArtist(${spotifyId})`);
  const artist = await prisma.musicArtist.upsert({
    where: { spotifyId },
    create: {
      name: sp.name,
      spotifyId,
      genres: sp.genres,
      popularity: sp.popularity,
      followers: sp.followers.total,
      imageUrl: sp.images[0]?.url ?? "",
      type: "person", // will be refined manually if needed
      lastSyncedAt: new Date(),
    },
    update: {
      name: sp.name,
      genres: sp.genres,
      popularity: sp.popularity,
      followers: sp.followers.total,
      imageUrl: sp.images[0]?.url ?? "",
      lastSyncedAt: new Date(),
    },
  });

  // 2. Sync albums
  const spAlbums = await withRetry(() => getArtistAlbums(spotifyId), `getArtistAlbums(${spotifyId})`);
  let albumsSynced = 0;

  for (const spAlbum of spAlbums) {
    await prisma.musicAlbum.upsert({
      where: { spotifyId: spAlbum.id },
      create: {
        title: spAlbum.name,
        artistId: artist.id,
        spotifyId: spAlbum.id,
        releaseDate: spAlbum.release_date,
        albumType: spAlbum.album_type,
        totalTracks: spAlbum.total_tracks,
        label: spAlbum.label ?? "",
        genres: spAlbum.genres ?? [],
        imageUrl: spAlbum.images[0]?.url ?? "",
        popularity: spAlbum.popularity ?? 0,
        lastSyncedAt: new Date(),
      },
      update: {
        title: spAlbum.name,
        releaseDate: spAlbum.release_date,
        albumType: spAlbum.album_type,
        totalTracks: spAlbum.total_tracks,
        label: spAlbum.label ?? "",
        popularity: spAlbum.popularity ?? 0,
        imageUrl: spAlbum.images[0]?.url ?? "",
        lastSyncedAt: new Date(),
      },
    });
    albumsSynced++;
  }

  // 3. Sync tracks + audio features per album
  let tracksSynced = 0;

  for (const spAlbum of spAlbums) {
    const dbAlbum = await prisma.musicAlbum.findUnique({
      where: { spotifyId: spAlbum.id },
    });
    if (!dbAlbum) continue;

    const tracks = await withRetry(() => getAlbumTracks(spAlbum.id), `getAlbumTracks(${spAlbum.id})`);
    const trackIds = tracks.map((t) => t.id);

    // Batch audio features
    let featuresMap: Map<string, { danceability: number; energy: number; valence: number; tempo: number; acousticness: number; instrumentalness: number }> = new Map();
    try {
      const features = await withRetry(() => getAudioFeatures(trackIds), `getAudioFeatures(${spAlbum.id})`);
      featuresMap = new Map(features.map((f) => [f.id, f]));
    } catch {
      // audio features endpoint may fail for some tracks — non-fatal
    }

    for (const track of tracks) {
      const af = featuresMap.get(track.id);
      await prisma.musicTrack.upsert({
        where: { spotifyId: track.id },
        create: {
          title: track.name,
          albumId: dbAlbum.id,
          spotifyId: track.id,
          trackNumber: track.track_number,
          durationMs: track.duration_ms,
          popularity: track.popularity ?? 0,
          previewUrl: track.preview_url,
          danceability: af?.danceability ?? null,
          energy: af?.energy ?? null,
          valence: af?.valence ?? null,
          tempo: af?.tempo ?? null,
          acousticness: af?.acousticness ?? null,
          instrumentalness: af?.instrumentalness ?? null,
        },
        update: {
          title: track.name,
          trackNumber: track.track_number,
          durationMs: track.duration_ms,
          popularity: track.popularity ?? 0,
          previewUrl: track.preview_url,
          danceability: af?.danceability ?? null,
          energy: af?.energy ?? null,
          valence: af?.valence ?? null,
          tempo: af?.tempo ?? null,
          acousticness: af?.acousticness ?? null,
          instrumentalness: af?.instrumentalness ?? null,
        },
      });
      tracksSynced++;
    }

    // Update album avg audio features
    if (featuresMap.size > 0) {
      const vals = [...featuresMap.values()];
      const avg = (fn: (v: typeof vals[0]) => number) =>
        vals.reduce((s, v) => s + fn(v), 0) / vals.length;

      await prisma.musicAlbum.update({
        where: { id: dbAlbum.id },
        data: {
          avgDanceability: avg((v) => v.danceability),
          avgEnergy: avg((v) => v.energy),
          avgValence: avg((v) => v.valence),
          avgTempo: avg((v) => v.tempo),
        },
      });
    }
  }

  // 4. Sync related artists (create shell records + relations)
  let relationsSynced = 0;
  try {
    const related = await withRetry(() => getRelatedArtists(spotifyId), `getRelatedArtists(${spotifyId})`);
    for (const rel of related.slice(0, 10)) {
      // Upsert related artist as shell (minimal data)
      const relArtist = await prisma.musicArtist.upsert({
        where: { spotifyId: rel.id },
        create: {
          name: rel.name,
          spotifyId: rel.id,
          genres: rel.genres,
          popularity: rel.popularity,
          followers: rel.followers.total,
          imageUrl: rel.images[0]?.url ?? "",
        },
        update: {
          popularity: rel.popularity,
          followers: rel.followers.total,
        },
      });

      // Create relation
      await prisma.artistRelation.upsert({
        where: {
          fromArtistId_toArtistId_relationType: {
            fromArtistId: artist.id,
            toArtistId: relArtist.id,
            relationType: "similar_to",
          },
        },
        create: {
          fromArtistId: artist.id,
          toArtistId: relArtist.id,
          relationType: "similar_to",
          source: "spotify",
          strength: rel.popularity / 100,
        },
        update: {
          strength: rel.popularity / 100,
        },
      });
      relationsSynced++;
    }
  } catch {
    // related artists may fail for some artists
  }

  return {
    artist: { id: artist.id, name: artist.name, spotifyId },
    albumsSynced,
    tracksSynced,
    relationsSynced,
  };
}

/**
 * Sync multiple artists by name. Returns results for each.
 */
export async function syncArtistsBatch(names: string[]): Promise<(SyncResult | null)[]> {
  const results: (SyncResult | null)[] = [];
  for (const name of names) {
    try {
      results.push(await syncArtistByName(name));
    } catch (e) {
      console.error(`Failed to sync artist "${name}":`, e);
      results.push(null);
    }
  }
  return results;
}
