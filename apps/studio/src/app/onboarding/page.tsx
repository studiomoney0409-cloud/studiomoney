import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db";

/**
 * /onboarding — server-rendered gate.
 * - Not signed in → /sign-in
 * - Has at least one workspace → /studio (already onboarded)
 * - Otherwise → render the welcome screen with a CTA to create the first workspace
 */
export default async function OnboardingPage() {
  const user = await syncCurrentUser();
  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px",
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>
            인증이 필요합니다
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
            워크스페이스 기능은 Clerk 인증이 구성되어 있어야 사용할 수 있습니다.
            <br />
            <code style={{ fontSize: 12 }}>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> 와{" "}
            <code style={{ fontSize: 12 }}>CLERK_SECRET_KEY</code>를 .env에 설정한 뒤 다시 시도해주세요.
          </p>
        </div>
      </div>
    );
  }

  const existing = await prisma.workspace.count({ where: { ownerId: user.id } });
  if (existing > 0) redirect("/studio");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Studio에 오신 것을 환영합니다
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 32px" }}>
          시작하려면 워크스페이스를 만들어주세요. 워크스페이스는 도메인(음악·테크·패션 등)별로
          독립된 페르소나, SNS 계정, 콘텐츠를 관리하는 공간입니다.
        </p>

        <Link
          href="/workspaces/new"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "var(--accent)",
            color: "white",
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          첫 워크스페이스 만들기 →
        </Link>
      </div>
    </div>
  );
}
