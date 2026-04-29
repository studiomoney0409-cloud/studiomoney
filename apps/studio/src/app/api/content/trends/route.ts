import { json, serverError } from "@/lib/studio";
import { getTrendGrowth } from "@/lib/pipeline/topic-intelligence";
import { workspaceGuard } from "@/lib/auth/route-guard";

/**
 * GET /api/content/trends — Get trend growth analysis over the past N days.
 *
 * Query params:
 *   days — lookback window (default 7)
 */
export async function GET(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days")) || 7;

    const growth = await getTrendGrowth(days);

    return json({
      trends: growth,
      meta: {
        days,
        totalTrends: growth.length,
        multiSource: growth.filter((t) => t.sources.length > 1).length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    return serverError(String(e));
  }
}
