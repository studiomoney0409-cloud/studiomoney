"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  niche: string;
  isDefault: boolean;
  createdAt: string;
}

interface WorkspaceContextValue {
  active: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  loading: boolean;
  error: string | null;
  switchTo: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const WorkspaceCtx = createContext<WorkspaceContextValue>({
  active: null,
  workspaces: [],
  loading: true,
  error: null,
  switchTo: async () => {},
  refresh: async () => {},
});

const ACTIVE_COOKIE = "active_workspace_id";

function readActiveCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", { credentials: "include" });
      if (res.status === 401) {
        // Not signed in — let the auth middleware handle it.
        setWorkspaces([]);
        setActiveId(null);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load workspaces (${res.status})`);
      const data = (await res.json()) as WorkspaceSummary[];
      setWorkspaces(data);

      const cookieActive = readActiveCookie();
      const resolved =
        (cookieActive && data.find((w) => w.id === cookieActive)?.id) ??
        data.find((w) => w.isDefault)?.id ??
        data[0]?.id ??
        null;
      setActiveId(resolved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchTo = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/workspaces/${id}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Activation failed (${res.status})`);
      setActiveId(id);
      router.refresh();
    },
    [router],
  );

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  return (
    <WorkspaceCtx.Provider value={{ active, workspaces, loading, error, switchTo, refresh }}>
      {children}
    </WorkspaceCtx.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceCtx);
