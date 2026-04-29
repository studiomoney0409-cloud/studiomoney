import { prisma } from "@/lib/db";
import { json, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const reports = await prisma.benchmarkReport.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        source: true,
        imageCount: true,
        createdAt: true,
        updatedAt: true,
        screenshots: true,
      },
    });
    return json(reports);
  } catch (e) {
    return serverError(String(e));
  }
}
