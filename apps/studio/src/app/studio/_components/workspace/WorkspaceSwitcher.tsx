"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "./WorkspaceProvider";

const NICHE_EMOJI: Record<string, string> = {
  music: "🎵",
  tech: "💻",
  fashion: "👗",
  lifestyle: "🌿",
  custom: "✨",
};

export default function WorkspaceSwitcher() {
  const { active, workspaces, loading, switchTo } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading) {
    return (
      <div style={{ padding: "6px 10px", fontSize: 13, color: "var(--text-muted)" }}>
        ⏳ 워크스페이스 로딩
      </div>
    );
  }

  if (!active) {
    // No workspace yet — direct user to onboarding
    return (
      <Link
        href="/onboarding"
        style={{
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 500,
          background: "var(--accent)",
          color: "white",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        + 워크스페이스 생성
      </Link>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={`${active.name} (${active.niche})`}
      >
        <span>{NICHE_EMOJI[active.niche] ?? "📦"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{active.name}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 6,
            zIndex: 200,
          }}
        >
          <div
            style={{
              padding: "6px 10px",
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            워크스페이스
          </div>
          {workspaces.map((ws) => {
            const isActive = ws.id === active.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  if (!isActive) await switchTo(ws.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: isActive ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: isActive ? "default" : "pointer",
                }}
              >
                <span style={{ fontSize: 16 }}>{NICHE_EMOJI[ws.niche] ?? "📦"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ws.name}
                </span>
                {isActive && <span style={{ fontSize: 11, color: "var(--accent)" }}>✓</span>}
              </button>
            );
          })}
          <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
          <Link
            href="/workspaces/new"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "8px 10px",
              fontSize: 13,
              color: "var(--accent)",
              textDecoration: "none",
              borderRadius: 6,
            }}
          >
            + 새 워크스페이스
          </Link>
        </div>
      )}
    </div>
  );
}
