"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import OverviewApprovalQueue from "./OverviewApprovalQueue";
import OverviewImageGate from "./OverviewImageGate";

// ── Types ──────────────────────────────────────────

interface AgentStatus {
  name: string;
  label: string;
  status: "running" | "idle" | "error";
  lastRun: {
    status: string;
    startedAt: string;
    summary: string;
    error?: string;
  } | null;
  todayRuns: number;
  todayCost: number;
}

interface DashboardData {
  agents: AgentStatus[];
  recentRuns: Array<{
    id: string;
    agentName: string;
    status: string;
    startedAt: string;
    durationMs: number;
    costUsd: number;
    summary: string;
    errorMessage?: string;
  }>;
  weeklyPlan: {
    theme: string;
    totalSlots: number;
    completedSlots: number;
    progressPercent: number;
  } | null;
  alerts: Array<{
    id: string;
    agentName: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
  costSummary: { daily: number; weekly: number; monthly: number };
}

const STATUS_COLORS: Record<string, string> = {
  running: "#3b82f6",
  idle: "var(--accent)",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  idle: "Idle",
  error: "Error",
};

// ── Main Component ──────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-muted)" }}>Loading dashboard...</div>;
  }

  if (!data) {
    return <div style={{ padding: 32, color: "var(--text-muted)" }}>Failed to load dashboard data.</div>;
  }

  const todayPublished = data.agents.find((a) => a.name === "content-producer")?.todayRuns ?? 0;
  const growthReport = data.recentRuns.find((r) => r.agentName === "growth-analyst" && r.status === "completed");

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
        Overview
      </h1>

      {/* Key Metrics Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <MetricCard label="Today Cost" value={`$${data.costSummary.daily.toFixed(2)}`} />
        <MetricCard label="Published" value={`${todayPublished}`} />
        <MetricCard label="Weekly Cost" value={`$${data.costSummary.weekly.toFixed(2)}`} />
        <MetricCard label="Monthly Cost" value={`$${data.costSummary.monthly.toFixed(2)}`} />
      </div>

      {/* Agent Status Grid */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
          Agents
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {data.agents.map((agent) => (
            <Link
              key={agent.name}
              href="/studio/agents"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                className="card-hover"
                style={{
                  padding: 14,
                  background: "var(--bg-card)",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {agent.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: (STATUS_COLORS[agent.status] ?? "var(--accent)") + "18",
                      color: STATUS_COLORS[agent.status] ?? "var(--accent)",
                    }}
                  >
                    {STATUS_LABELS[agent.status] ?? agent.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {agent.lastRun?.summary || "No runs yet"}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  <span>Runs: {agent.todayRuns}</span>
                  <span>${agent.todayCost.toFixed(3)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Weekly Plan Progress */}
      {data.weeklyPlan && (
        <div
          style={{
            padding: 16,
            background: "var(--bg-card)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Weekly Plan</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                &quot;{data.weeklyPlan.theme}&quot;
              </span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
              {data.weeklyPlan.progressPercent}%
            </span>
          </div>
          <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3 }}>
            <div
              style={{
                width: `${data.weeklyPlan.progressPercent}%`,
                height: "100%",
                background: "var(--accent)",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            {data.weeklyPlan.completedSlots} / {data.weeklyPlan.totalSlots} slots completed
          </div>
        </div>
      )}

      {/* Approval Queue */}
      <OverviewApprovalQueue />

      {/* Image Selection Gate */}
      <OverviewImageGate />

      {/* Growth Report Summary */}
      {growthReport && (
        <div
          style={{
            padding: 16,
            background: "var(--bg-card)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Latest Report</h2>
            <Link href="/studio/analytics" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
              Full analytics
            </Link>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {growthReport.summary}
          </div>
        </div>
      )}

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Alerts ({data.alerts.length})
          </h2>
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            {data.alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 10,
                  fontSize: 12,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: alert.level === "error" ? "#ef4444" : "#f59e0b",
                    fontWeight: 600,
                    fontSize: 10,
                    minWidth: 36,
                  }}
                >
                  {alert.level.toUpperCase()}
                </span>
                <span style={{ color: "var(--text-muted)", minWidth: 80 }}>
                  {alert.agentName}
                </span>
                <span style={{ flex: 1, color: "var(--text)" }}>
                  {alert.message}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {new Date(alert.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Timeline */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
          Recent Activity
        </h2>
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {data.recentRuns.length === 0 ? (
            <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
              No activity yet today
            </div>
          ) : (
            data.recentRuns.slice(0, 10).map((run) => (
              <div
                key={run.id}
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: run.status === "completed" ? "var(--accent)" : run.status === "failed" ? "#ef4444" : "#3b82f6",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text-muted)", minWidth: 100 }}>
                  {run.agentName}
                </span>
                <span style={{ flex: 1, color: "var(--text)" }}>
                  {run.summary || run.errorMessage || run.status}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(1)}s` : ""}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  ${run.costUsd.toFixed(4)}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11, minWidth: 45 }}>
                  {new Date(run.startedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--bg-card)",
        borderRadius: 12,
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
}
