"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Proposal {
  id: string;
  topic: string;
  reasoning: string;
  platform: string;
  content: { text?: string; hashtags?: string[] };
  createdAt: string;
  configId: string;
}

export default function OverviewApprovalQueue() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    try {
      // Get all configs, then fetch proposals for each
      const configRes = await fetch("/api/autopilot");
      if (!configRes.ok) return;
      const configs = await configRes.json();

      const allPending: Proposal[] = [];
      for (const config of configs) {
        const res = await fetch(`/api/autopilot/${config.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        const pending = (data.proposals ?? []).filter(
          (p: { status: string }) => p.status === "pending",
        );
        allPending.push(
          ...pending.map((p: Record<string, unknown>) => ({
            ...p,
            configId: config.id,
          })),
        );
      }
      setProposals(allPending.slice(0, 5));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  async function handleAction(proposalId: string, configId: string, action: "approved" | "rejected") {
    try {
      await fetch(`/api/autopilot/${configId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, status: action }),
      });
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
    } catch {
      // ignore
    }
  }

  if (loading) return null;
  if (proposals.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
          Pending Approval ({proposals.length})
        </h2>
        <Link href="/studio/autopilot" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
          View all
        </Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {proposals.map((p) => (
          <div
            key={p.id}
            style={{
              padding: "12px 16px",
              background: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  {p.topic}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {p.reasoning?.slice(0, 100)}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {p.platform} | {new Date(p.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleAction(p.id, p.configId, "approved")}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(p.id, p.configId, "rejected")}
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
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
