"use client";

import { useState, useEffect, useCallback } from "react";

interface ImageCandidate {
  id: string;
  source: string;
  previewUrl: string;
  fullUrl: string;
  sourceUrl: string;
  author: string;
  attribution: string;
}

interface ImageGateItem {
  id: string;
  topic: string;
  candidates: ImageCandidate[];
  status: string;
  createdAt: string;
}

export default function OverviewImageGate() {
  const [gates, setGates] = useState<ImageGateItem[]>([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [customUrl, setCustomUrl] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchGates = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/image-gate");
      if (res.ok) {
        const data = await res.json();
        setGates(data);
        // Initialize selection state
        const sel: Record<string, Set<string>> = {};
        for (const g of data) {
          sel[g.id] = new Set<string>();
        }
        setSelected(sel);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGates();
  }, [fetchGates]);

  function toggleImage(gateId: string, url: string) {
    setSelected((prev) => {
      const s = new Set(prev[gateId] ?? []);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return { ...prev, [gateId]: s };
    });
  }

  function addCustomUrl(gateId: string) {
    const url = customUrl[gateId]?.trim();
    if (!url) return;
    setSelected((prev) => {
      const s = new Set(prev[gateId] ?? []);
      s.add(url);
      return { ...prev, [gateId]: s };
    });
    setCustomUrl((prev) => ({ ...prev, [gateId]: "" }));
  }

  async function confirmSelection(gateId: string) {
    const urls = [...(selected[gateId] ?? [])];
    if (urls.length === 0) return;

    try {
      await fetch("/api/agents/image-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gateId, selectedUrls: urls, status: "selected" }),
      });
      setGates((prev) => prev.filter((g) => g.id !== gateId));
    } catch {
      // ignore
    }
  }

  async function skipGate(gateId: string) {
    try {
      await fetch("/api/agents/image-gate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gateId, status: "skipped" }),
      });
      setGates((prev) => prev.filter((g) => g.id !== gateId));
    } catch {
      // ignore
    }
  }

  if (loading || gates.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
        Image Selection ({gates.length})
      </h2>

      {gates.map((gate) => {
        const candidates = (gate.candidates ?? []) as ImageCandidate[];
        const sel = selected[gate.id] ?? new Set<string>();

        return (
          <div
            key={gate.id}
            style={{
              padding: 16,
              background: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              marginBottom: 12,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {gate.topic}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                  {sel.size} selected
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => confirmSelection(gate.id)}
                  disabled={sel.size === 0}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--accent)",
                    background: sel.size > 0 ? "var(--accent)" : "transparent",
                    color: sel.size > 0 ? "#fff" : "var(--text-muted)",
                    cursor: sel.size > 0 ? "pointer" : "default",
                    opacity: sel.size > 0 ? 1 : 0.5,
                  }}
                >
                  Confirm ({sel.size})
                </button>
                <button
                  onClick={() => skipGate(gate.id)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
              </div>
            </div>

            {/* Image Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {candidates.map((img) => {
                const isSelected = sel.has(img.fullUrl);
                return (
                  <div
                    key={img.id}
                    onClick={() => toggleImage(gate.id, img.fullUrl)}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: 8,
                      overflow: "hidden",
                      cursor: "pointer",
                      border: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                      opacity: isSelected ? 1 : 0.7,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.attribution}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                    />
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: "2px 4px",
                        background: "rgba(0,0,0,0.6)",
                        fontSize: 9,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {img.source}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom URL input */}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="Add image URL..."
                value={customUrl[gate.id] ?? ""}
                onChange={(e) => setCustomUrl((prev) => ({ ...prev, [gate.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addCustomUrl(gate.id)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              <button
                onClick={() => addCustomUrl(gate.id)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
