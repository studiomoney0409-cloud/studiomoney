"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import TabBar from "./_components/TabBar";
import UnifiedComposer from "./_components/UnifiedComposer";
import FeatureGuide from "./_components/FeatureGuide";
import PipelineProvider from "./_components/pipeline/PipelineProvider";
import PipelineOverlay from "./_components/pipeline/PipelineOverlay";
import PipelineStepHint from "./_components/pipeline/PipelineStepHint";
import PipelineAwareFab from "./_components/pipeline/PipelineAwareFab";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <PipelineProvider>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Top header with tabs */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "var(--bg-card)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              maxWidth: 1280,
              margin: "0 auto",
              padding: isMobile ? "10px 12px" : "10px 32px",
              gap: 16,
            }}
          >
            {/* Brand */}
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text)",
                flexShrink: 0,
              }}
            >
              Studio
            </span>

            {/* Tabs */}
            <TabBar />

            {/* Feature Guide */}
            <div style={{ flexShrink: 0 }}>
              <FeatureGuide />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main
          className="page-enter"
          key={pathname}
          style={{
            flex: 1,
            padding: isMobile ? "20px 16px 80px" : "28px 32px 80px",
            maxWidth: 1280,
            margin: "0 auto",
            width: "100%",
            position: "relative",
          }}
        >
          <PipelineStepHint />
          {children}
        </main>

        {/* FAB: New Post */}
        <PipelineAwareFab isMobile={isMobile} onClick={() => setComposerOpen(true)} />
        <UnifiedComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
        <PipelineOverlay />
      </div>
    </PipelineProvider>
  );
}
