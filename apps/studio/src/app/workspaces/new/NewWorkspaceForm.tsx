"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NicheTemplate {
  niche: string;
  displayName: string;
  description: string;
  iconEmoji: string;
  defaultKeywords: string[];
  redditSubs: string[];
  categories: string[];
}

export default function NewWorkspaceForm() {
  const router = useRouter();
  const [niches, setNiches] = useState<NicheTemplate[]>([]);
  const [loadingNiches, setLoadingNiches] = useState(true);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/niches")
      .then((r) => r.json())
      .then((data: NicheTemplate[]) => {
        if (cancelled) return;
        setNiches(data);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoadingNiches(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill keywords when a niche is selected
  useEffect(() => {
    const tpl = niches.find((n) => n.niche === selectedNiche);
    if (tpl && !keywordsRaw) setKeywordsRaw(tpl.defaultKeywords.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNiche, niches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNiche || !name.trim()) return;
    setSubmitting(true);
    setError(null);

    const keywords = keywordsRaw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          niche: selectedNiche,
          keywords,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Failed (${res.status})`);
      }
      // Workspace created and activated server-side. Hard-navigate so the studio
      // shell re-renders with the new active workspace context.
      window.location.href = "/studio";
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (loadingNiches) {
    return <div style={{ color: "var(--text-muted)" }}>도메인 템플릿 로딩 중…</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Niche cards */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)" }}>
          1. 도메인 선택
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {niches.map((n) => {
            const selected = selectedNiche === n.niche;
            return (
              <button
                key={n.niche}
                type="button"
                onClick={() => setSelectedNiche(n.niche)}
                style={{
                  textAlign: "left",
                  padding: 16,
                  background: selected ? "var(--bg-hover)" : "var(--bg-card)",
                  border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>{n.iconEmoji}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  {n.displayName}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {n.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Name + keywords */}
      <div style={{ opacity: selectedNiche ? 1 : 0.4, pointerEvents: selectedNiche ? "auto" : "none", transition: "opacity 0.15s" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-muted)" }}>
          2. 워크스페이스 정보
        </div>

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 6, color: "var(--text)" }}>이름 *</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: K-pop 매거진"
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-card)",
              color: "var(--text)",
            }}
          />
        </label>

        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, marginBottom: 6, color: "var(--text)" }}>
            키워드 (쉼표로 구분)
          </div>
          <input
            type="text"
            value={keywordsRaw}
            onChange={(e) => setKeywordsRaw(e.target.value)}
            placeholder="K-pop, 신곡, 앨범 리뷰"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-card)",
              color: "var(--text)",
            }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            트렌드 분석과 콘텐츠 제안의 시드로 사용됩니다.
          </div>
        </label>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(239,68,68,0.1)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="submit"
          disabled={!selectedNiche || !name.trim() || submitting}
          style={{
            padding: "10px 20px",
            background: "var(--accent)",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            cursor: submitting || !selectedNiche || !name.trim() ? "not-allowed" : "pointer",
            opacity: submitting || !selectedNiche || !name.trim() ? 0.5 : 1,
          }}
        >
          {submitting ? "생성 중…" : "워크스페이스 만들기"}
        </button>
      </div>
    </form>
  );
}
