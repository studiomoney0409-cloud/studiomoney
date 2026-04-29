import NewWorkspaceForm from "./NewWorkspaceForm";

export default function NewWorkspacePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          새 워크스페이스 만들기
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 32px" }}>
          도메인 템플릿을 선택하면 기본 키워드, 트렌드 소스, 페르소나 톤이 자동 설정됩니다.
          이후 설정에서 모두 변경 가능합니다.
        </p>
        <NewWorkspaceForm />
      </div>
    </div>
  );
}
