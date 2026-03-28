"use client";

import Link from "next/link";

const SETTINGS_SECTIONS = [
  {
    title: "Writing Persona",
    description: "Brand voice, tone, vocabulary, and content rules. Used by Content Producer agent.",
    href: "/studio/persona",
  },
  {
    title: "SNS Accounts",
    description: "Connected social media accounts (Instagram, Threads, X, etc.) and OAuth management.",
    href: "/studio/accounts",
  },
  {
    title: "Reference Accounts",
    description: "Instagram/TikTok accounts monitored for trend discovery by Trend Scout agent.",
    href: "/studio/reference-accounts",
  },
  {
    title: "Analytics",
    description: "Performance metrics, engagement rates, and growth trends across all platforms.",
    href: "/studio/analytics",
  },
];

export default function SettingsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
        Settings
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="card-hover"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 20px",
              background: "var(--bg-card)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              textDecoration: "none",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                {section.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                {section.description}
              </div>
            </div>
            <span style={{ color: "var(--text-muted)", fontSize: 16, flexShrink: 0, marginLeft: 16 }}>
              &rarr;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
