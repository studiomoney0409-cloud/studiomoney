import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { enqueueJob } from "@/lib/jobs";
import { workspaceGuard } from "@/lib/auth/route-guard";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/reference-accounts/:id/sync — trigger manual feed sync. */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;

    const account = await prisma.referenceAccount.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!account) return notFound("Account not found");

    await enqueueJob({
      type: "reference_feed_sync",
      payload: { accountId: id },
    });

    return json({ queued: true, accountId: id });
  } catch (e) {
    return serverError(String(e));
  }
}
