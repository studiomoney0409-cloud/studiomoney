"use client";

import { useState } from "react";
import Link from "next/link";

const SUB_TABS = [
  { key: "published", label: "Published" },
  { key: "scheduled", label: "Scheduled" },
  { key: "autopilot", label: "Autopilot" },
  { key: "calendar", label: "Calendar" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

const CREATION_TOOLS = [
  { label: "Design Editor", href: "/studio/design", desc: "Card news, SNS images" },
  { label: "Blog Writer", href: "/studio/blog", desc: "Long-form articles" },
  { label: "Reels Editor", href: "/studio/reels", desc: "Short video content" },
  { label: "Create Hub", href: "/studio/create", desc: "Quick content creation" },
  { label: "Workshop", href: "/studio/workshop", desc: "Topic brainstorming" },
  { label: "Plan", href: "/studio/plan", desc: "AI content planning" },
  { label: "Import", href: "/studio/import", desc: "Batch URL import" },
  { label: "Research", href: "/studio/research", desc: "Trend analysis" },
  { label: "Database", href: "/studio/database", desc: "Design references" },
  { label: "Inbox", href: "/studio/inbox", desc: "Comments & DMs" },
  { label: "Campaigns", href: "/studio/campaigns", desc: "Keyword campaigns" },
  { label: "Analytics", href: "/studio/analytics", desc: "Performance metrics" },
];

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState<SubTab>("published");

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
        Content
      </h1>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto" }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? "var(--text)" : "var(--text-muted)",
              background: activeTab === tab.key ? "var(--accent-light)" : "transparent",
              border: activeTab === tab.key ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: 8,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div
        style={{
          padding: 20,
          background: "var(--bg-card)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          marginBottom: 32,
          minHeight: 200,
        }}
      >
        {activeTab === "published" && (
          <SubTabEmbed
            title="Published Content"
            href="/studio/publish"
            description="View and manage all published content across platforms."
          />
        )}
        {activeTab === "scheduled" && (
          <SubTabEmbed
            title="Scheduled Content"
            href="/studio/publish"
            description="Upcoming scheduled publications. Managed by smart scheduling."
          />
        )}
        {activeTab === "autopilot" && (
          <SubTabEmbed
            title="Autopilot Proposals"
            href="/studio/autopilot"
            description="AI-generated content proposals. Review, approve, or reject."
          />
        )}
        {activeTab === "calendar" && (
          <SubTabEmbed
            title="Content Calendar"
            href="/studio/calendar"
            description="Visual calendar view of all planned and published content."
          />
        )}
      </div>

      {/* Creation Tools */}
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
        Tools
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {CREATION_TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="card-hover"
            style={{
              padding: "14px 16px",
              background: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              textDecoration: "none",
              display: "block",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              {tool.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.3 }}>
              {tool.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SubTabEmbed({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 0" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.4 }}>
        {description}
      </div>
      <Link
        href={href}
        style={{
          display: "inline-block",
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 600,
          color: "#fff",
          background: "var(--accent)",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Open
      </Link>
    </div>
  );
}
