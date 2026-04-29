import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncCurrentUser } from "@/lib/auth/sync-user";
import { setActiveWorkspaceId } from "@/lib/auth/workspace";
import { createWorkspaceFromNiche } from "@/lib/auth/workspace-create";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  niche: z.string().min(1),
  slug: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  trendSources: z.record(z.string(), z.unknown()).optional(),
  promptHints: z.string().optional(),
  language: z.string().optional(),
  region: z.string().optional(),
});

export async function GET() {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(workspaces);
}

export async function POST(req: Request) {
  const user = await syncCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const workspace = await createWorkspaceFromNiche({ ownerId: user.id, ...parsed.data });
    await setActiveWorkspaceId(workspace.id);
    return NextResponse.json(workspace, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.startsWith("Unknown niche") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
