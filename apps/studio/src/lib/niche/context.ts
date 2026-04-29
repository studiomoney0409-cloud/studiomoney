import { prisma } from "../db";
import type { NicheTemplate, Workspace } from "../../generated/prisma/client";

/**
 * Per-niche flag map for which trend providers are active.
 * Mirrors Workspace.trendSources JSON column.
 */
export type TrendSourcesConfig = {
  google: boolean;
  youtube: boolean;
  reddit: boolean;
  naverDataLab: boolean;
  naverSearch: boolean;
  spotify: boolean;
  hackernews: boolean;
  instagramRef: boolean;
};

/**
 * NicheContext is the runtime view of a workspace's domain configuration.
 * It is what agents (outline / writer / editor / design / trends) consume to
 * produce niche-appropriate output without hard-coding "Korean music magazine".
 */
export type NicheContext = {
  niche: string;
  /** Used as system prompt prefix — e.g. "당신은 한국 음악 매거진의 에디터입니다." */
  promptHints: string;
  language: string;
  region: string;
  /** Subreddits the Reddit trend provider should pull from. */
  redditSubs: string[];
  /** Which trend providers are enabled for this niche. */
  trendSources: TrendSourcesConfig;
  /** Allowed ReferenceAccount/Partner category values. */
  categories: string[];
  /** Default ReferenceAccount.category when user does not specify one. */
  defaultCategory: string;
};

const ALL_SOURCES_OFF: TrendSourcesConfig = {
  google: false,
  youtube: false,
  reddit: false,
  naverDataLab: false,
  naverSearch: false,
  spotify: false,
  hackernews: false,
  instagramRef: false,
};

/**
 * Backward-compatible default — matches the legacy single-tenant music magazine.
 * Used as a safety net by code that has not yet been wired through workspace.
 */
export const DEFAULT_NICHE_CONTEXT: NicheContext = {
  niche: "music",
  promptHints:
    "당신은 한국 음악·문화 매거진의 에디터입니다. K-pop, 인디, 힙합, 클래식 등 음악 전반을 분석적이면서도 따뜻한 톤으로 다룹니다.",
  language: "ko",
  region: "KR",
  redditSubs: ["kpop", "khiphop", "koreanmusic", "indieheads", "hiphopheads"],
  trendSources: {
    google: true,
    youtube: true,
    reddit: true,
    naverDataLab: true,
    naverSearch: true,
    spotify: true,
    hackernews: false,
    instagramRef: true,
  },
  categories: ["artist", "label", "venue", "media", "festival"],
  defaultCategory: "artist",
};

function coerceTrendSources(raw: unknown): TrendSourcesConfig {
  if (!raw || typeof raw !== "object") return { ...ALL_SOURCES_OFF };
  const obj = raw as Record<string, unknown>;
  return {
    google: !!obj.google,
    youtube: !!obj.youtube,
    reddit: !!obj.reddit,
    naverDataLab: !!obj.naverDataLab,
    naverSearch: !!obj.naverSearch,
    spotify: !!obj.spotify,
    hackernews: !!obj.hackernews,
    instagramRef: !!obj.instagramRef,
  };
}

export function nicheContextFromWorkspace(
  workspace: Pick<Workspace, "niche" | "promptHints" | "language" | "region" | "trendSources">,
  template?: Pick<NicheTemplate, "promptHints" | "redditSubs" | "categories"> | null,
): NicheContext {
  const promptHints = workspace.promptHints?.trim() || template?.promptHints?.trim() || "";
  const categories = template?.categories ?? [];
  return {
    niche: workspace.niche,
    promptHints,
    language: workspace.language,
    region: workspace.region,
    redditSubs: template?.redditSubs ?? [],
    trendSources: coerceTrendSources(workspace.trendSources),
    categories,
    defaultCategory: categories[0] ?? "general",
  };
}

/**
 * Load NicheContext from the database for a given workspace.
 * Falls back to DEFAULT_NICHE_CONTEXT if the workspace does not exist (defensive — should not happen in practice).
 */
export async function getNicheContext(workspaceId: string): Promise<NicheContext> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return DEFAULT_NICHE_CONTEXT;
  const tpl = await prisma.nicheTemplate.findUnique({ where: { niche: ws.niche } });
  return nicheContextFromWorkspace(ws, tpl);
}
