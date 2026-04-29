import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { id } = await params;
    const report = await prisma.benchmarkReport.findUnique({ where: { id } });
    if (!report) return notFound("Report not found");
    return json(report);
  } catch (e) {
    return serverError(String(e));
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { id } = await params;
    await prisma.benchmarkReport.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025")
      return notFound("Report not found");
    return serverError(String(e));
  }
}
