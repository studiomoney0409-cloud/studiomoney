import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncCurrentUser } from "@/lib/auth/sync-user";
import { clearActiveWorkspaceId, getActiveWorkspaceId } from "@/lib/auth/workspace";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  keywords: z.array(z.string()).optional(),
  trendSources: z.record(z.string(), z.unknown()).optional(),
  promptHints: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
  isDefault: z.boolean().optional(),
});

async function ownedWorkspace(userId: string, id: string) {
  return prisma.workspace.findFirst({ where: { id, ownerId: userId } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const ws = await ownedWorkspace(user.id, id);
  if (!ws) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(ws);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const ws = await ownedWorkspace(user.id, id);
  if (!ws) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.format() }, { status: 400 });
  }

  if (parsed.data.isDefault === true) {
    await prisma.workspace.updateMany({
      where: { ownerId: user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.workspace.update({
    where: { id },
    data: {
      ...parsed.data,
      trendSources: parsed.data.trendSources as object | undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const ws = await ownedWorkspace(user.id, id);
  if (!ws) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.workspace.delete({ where: { id } });

  const activeId = await getActiveWorkspaceId();
  if (activeId === id) await clearActiveWorkspaceId();

  return NextResponse.json({ ok: true });
}
