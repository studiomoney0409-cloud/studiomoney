"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    label: "Overview",
    href: "/studio",
    match: (p: string) => p === "/studio",
  },
  {
    label: "Agents",
    href: "/studio/agents",
    match: (p: string) => p.startsWith("/studio/agents"),
  },
  {
    label: "Content",
    href: "/studio/content",
    match: (p: string) =>
      p === "/studio/content" ||
      [
        "/studio/create", "/studio/design", "/studio/reels", "/studio/blog",
        "/studio/calendar", "/studio/plan", "/studio/workshop", "/studio/publish",
        "/studio/autopilot", "/studio/import", "/studio/campaigns", "/studio/inbox",
        "/studio/research", "/studio/database",
      ].some((prefix) => p.startsWith(prefix)),
  },
  {
    label: "Settings",
    href: "/studio/settings",
    match: (p: string) =>
      p === "/studio/settings" ||
      ["/studio/persona", "/studio/accounts", "/studio/reference-accounts"].some(
        (prefix) => p.startsWith(prefix),
      ),
  },
] as const;

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        padding: "0 4px",
      }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: "block",
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--text)" : "var(--text-muted)",
              textDecoration: "none",
              borderRadius: 999,
              background: active ? "var(--accent-light)" : "transparent",
              border: active ? "1px solid var(--accent)" : "1px solid transparent",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
