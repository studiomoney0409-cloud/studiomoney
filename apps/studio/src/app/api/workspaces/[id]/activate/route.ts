import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncCurrentUser } from "@/lib/auth/sync-user";
import { setActiveWorkspaceId } from "@/lib/auth/workspace";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const ws = await prisma.workspace.findFirst({ where: { id, ownerId: user.id } });
  if (!ws) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await setActiveWorkspaceId(id);
  return NextResponse.json({ ok: true, workspace: ws });
}
