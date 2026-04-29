import { describe, it, expect } from "vitest";
import { DEFAULT_NICHE_CONTEXT, nicheContextFromWorkspace } from "../context";

// Cast as any to satisfy the structural Pick<Workspace, ...> type in nicheContextFromWorkspace
// — this is a unit test, not a full Workspace fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseWorkspace: any = {
  niche: "tech",
  promptHints: "테크 매거진 에디터",
  language: "ko",
  region: "KR",
  trendSources: { google: true, hackernews: true, reddit: false },
};

const baseTemplate = {
  promptHints: "기본 테크 톤",
  redditSubs: ["programming", "technology"],
  categories: ["company", "developer", "vc"],
};

describe("nicheContextFromWorkspace", () => {
  it("uses workspace.promptHints when present", () => {
    const ctx = nicheContextFromWorkspace(baseWorkspace, baseTemplate);
    expect(ctx.promptHints).toBe("테크 매거진 에디터");
  });

  it("falls back to template promptHints when workspace empty", () => {
    const ctx = nicheContextFromWorkspace({ ...baseWorkspace, promptHints: "  " }, baseTemplate);
    expect(ctx.promptHints).toBe("기본 테크 톤");
  });

  it("returns empty promptHints when both are blank", () => {
    const ctx = nicheContextFromWorkspace({ ...baseWorkspace, promptHints: "" }, { ...baseTemplate, promptHints: "" });
    expect(ctx.promptHints).toBe("");
  });

  it("coerces unset trendSource flags to false", () => {
    const ctx = nicheContextFromWorkspace(baseWorkspace, baseTemplate);
    expect(ctx.trendSources.google).toBe(true);
    expect(ctx.trendSources.hackernews).toBe(true);
    expect(ctx.trendSources.reddit).toBe(false);
    expect(ctx.trendSources.spotify).toBe(false);
    expect(ctx.trendSources.youtube).toBe(false);
  });

  it("handles malformed trendSources JSON safely", () => {
    const ctx = nicheContextFromWorkspace({ ...baseWorkspace, trendSources: null as unknown as object }, baseTemplate);
    expect(ctx.trendSources.google).toBe(false);
    expect(ctx.trendSources.spotify).toBe(false);
  });

  it("derives defaultCategory from first template category", () => {
    const ctx = nicheContextFromWorkspace(baseWorkspace, baseTemplate);
    expect(ctx.defaultCategory).toBe("company");
  });

  it("falls back to 'general' when template has no categories", () => {
    const ctx = nicheContextFromWorkspace(baseWorkspace, { ...baseTemplate, categories: [] });
    expect(ctx.defaultCategory).toBe("general");
  });

  it("works without template (subreddits empty, categories general)", () => {
    const ctx = nicheContextFromWorkspace(baseWorkspace);
    expect(ctx.redditSubs).toEqual([]);
    expect(ctx.categories).toEqual([]);
    expect(ctx.defaultCategory).toBe("general");
  });

  it("DEFAULT_NICHE_CONTEXT preserves legacy music behavior", () => {
    expect(DEFAULT_NICHE_CONTEXT.niche).toBe("music");
    expect(DEFAULT_NICHE_CONTEXT.trendSources.spotify).toBe(true);
    expect(DEFAULT_NICHE_CONTEXT.redditSubs).toContain("kpop");
    expect(DEFAULT_NICHE_CONTEXT.defaultCategory).toBe("artist");
  });
});
