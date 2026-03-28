"use client";

import { useState, useEffect, useCallback } from "react";

interface AgentStatus {
  name: string;
  label: string;
  status: "running" | "idle" | "error";
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    durationMs: number;
    costUsd: number;
    summary: string;
    error?: string;
  } | null;
  todayRuns: number;
  todayCost: number;
}

interface RecentRun {
  id: string;
  agentName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  costUsd: number;
  summary: string;
  errorMessage?: string;
}

interface Alert {
  id: string;
  agentName: string;
  level: string;
  message: string;
  createdAt: string;
}

interface DashboardData {
  agents: AgentStatus[];
  recentRuns: RecentRun[];
  weeklyPlan: {
    id: string;
    theme: string;
    totalSlots: number;
    completedSlots: number;
    progressPercent: number;
  } | null;
  alerts: Alert[];
  costSummary: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  running: "#3b82f6",
  idle: "var(--accent, #22c55e)",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  running: "실행중",
  idle: "대기중",
  error: "오류",
};

export default function AgentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: "var(--text-muted)" }}>
        에이전트 대시보드 로딩중...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 32, color: "#ef4444" }}>
        대시보드 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Agent Dashboard
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: 14 }}>
        6개 에이전트 실시간 모니터링 | 30초마다 자동 새로고침
      </p>

      {/* Cost Summary Bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
          padding: 16,
          background: "var(--bg-card)",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <CostBadge label="오늘" value={data.costSummary.daily} />
        <CostBadge label="이번주" value={data.costSummary.weekly} />
        <CostBadge label="이번달" value={data.costSummary.monthly} />
        {data.weeklyPlan && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>주간 계획</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              &quot;{data.weeklyPlan.theme}&quot; — {data.weeklyPlan.progressPercent}%
            </div>
            <div
              style={{
                width: 120,
                height: 4,
                background: "var(--border)",
                borderRadius: 2,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: `${data.weeklyPlan.progressPercent}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Agent Status Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {data.agents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            isSelected={selectedAgent === agent.name}
            onClick={() =>
              setSelectedAgent(
                selectedAgent === agent.name ? null : agent.name,
              )
            }
          />
        ))}
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
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
            {data.alerts.slice(0, 10).map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 12,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    color: alert.level === "error" ? "#ef4444" : "#eab308",
                    fontWeight: 600,
                    minWidth: 40,
                  }}
                >
                  {alert.level.toUpperCase()}
                </span>
                <span style={{ color: "var(--text-muted)", minWidth: 100 }}>
                  {alert.agentName}
                </span>
                <span style={{ flex: 1, color: "var(--text)" }}>{alert.message}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {formatTime(alert.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        Today&apos;s Activity ({data.recentRuns.length})
      </h2>
      <div
        style={{
          background: "#111",
          borderRadius: 12,
          border: "1px solid #222",
          overflow: "hidden",
        }}
      >
        {data.recentRuns.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
            오늘 실행 기록 없음
          </div>
        ) : (
          data.recentRuns.slice(0, 20).map((run) => (
            <div
              key={run.id}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: 12,
                alignItems: "center",
                fontSize: 13,
                opacity: selectedAgent && run.agentName !== selectedAgent ? 0.3 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    run.status === "completed"
                      ? "#22c55e"
                      : run.status === "failed"
                        ? "#ef4444"
                        : "#3b82f6",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-muted)", minWidth: 120 }}>
                {run.agentName}
              </span>
              <span style={{ flex: 1, color: "var(--text)" }}>
                {run.summary || run.errorMessage || run.status}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {run.durationMs > 0
                  ? `${(run.durationMs / 1000).toFixed(1)}s`
                  : "—"}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                ${run.costUsd.toFixed(4)}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 12, minWidth: 50 }}>
                {formatTime(run.startedAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent: AgentStatus;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 16,
        background: "var(--bg-card)",
        borderRadius: 12,
        border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
        cursor: "pointer",
        transition: "border-color 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{agent.label}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>
            {agent.name}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: STATUS_COLORS[agent.status] + "20",
            color: STATUS_COLORS[agent.status],
            fontWeight: 600,
          }}
        >
          {STATUS_LABELS[agent.status]}
        </span>
      </div>

      {agent.lastRun ? (
        <>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
            {agent.lastRun.summary || "—"}
          </div>
          {agent.lastRun.error && (
            <div
              style={{ fontSize: 12, color: "#ef4444", marginBottom: 4 }}
            >
              {agent.lastRun.error.slice(0, 100)}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 8,
            }}
          >
            <span>마지막: {formatTime(agent.lastRun.startedAt)}</span>
            <span>오늘: {agent.todayRuns}회</span>
            <span>${agent.todayCost.toFixed(4)}</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#666" }}>아직 실행 기록 없음</div>
      )}
    </div>
  );
}

function CostBadge({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>${value.toFixed(2)}</div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
