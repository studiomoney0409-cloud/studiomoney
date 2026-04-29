import { describe, it, expect } from "vitest";
import { normalizeSlug } from "../workspace-create";

describe("normalizeSlug", () => {
  it("lowercases and converts spaces to hyphens", () => {
    expect(normalizeSlug("My Workspace")).toBe("my-workspace");
  });

  it("preserves Korean characters", () => {
    expect(normalizeSlug("K-pop 매거진")).toBe("k-pop-매거진");
  });

  it("collapses repeated spaces and hyphens", () => {
    expect(normalizeSlug("  hello   world  ")).toBe("hello-world");
    expect(normalizeSlug("a---b")).toBe("a-b");
  });

  it("strips special characters except hyphen", () => {
    expect(normalizeSlug("hello!@#$%world")).toBe("helloworld");
  });

  it("falls back to random ws- prefix when input collapses to empty", () => {
    const slug = normalizeSlug("!!!@@@");
    expect(slug).toMatch(/^ws-[a-z0-9]+$/);
  });

  it("clamps to 60 chars", () => {
    const long = "a".repeat(120);
    expect(normalizeSlug(long).length).toBeLessThanOrEqual(60);
  });

  it("handles empty input by generating random slug", () => {
    expect(normalizeSlug("")).toMatch(/^ws-[a-z0-9]+$/);
  });
});
