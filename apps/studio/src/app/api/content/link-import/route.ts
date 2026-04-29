import { prisma } from "@/lib/db";
import { json, badRequest, serverError } from "@/lib/studio";
import { extractFromUrls } from "@/lib/sns/linkExtractor";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/content/link-import — list link imports in this workspace */
export async function GET() {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const imports = await prisma.linkImport.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json(imports);
  } catch (e) {
    return serverError(String(e));
  }
}

/**
 * POST /api/content/link-import — start a batch link extraction.
 * Body: { urls: string[], commonInstructions?: string }
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;

    const body = (await req.json()) as {
      urls?: string[];
      commonInstructions?: string;
    };

    if (!body.urls?.length) {
      return badRequest("urls array is required and must not be empty");
    }

    const validUrls: string[] = [];
    for (const u of body.urls) {
      try {
        new URL(u);
        validUrls.push(u.trim());
      } catch {
        // skip invalid URLs
      }
    }
    if (!validUrls.length) return badRequest("No valid URLs provided");

    const record = await prisma.linkImport.create({
      data: {
        workspaceId: workspace.id,
        urls: validUrls,
        commonInstructions: body.commonInstructions ?? "",
        status: "processing",
      },
    });

    const results = await extractFromUrls(validUrls);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await prisma.linkImport.update({
      where: { id: record.id },
      data: {
        status: "completed",
        results: results as any,
      },
    });

    return json(updated, 201);
  } catch (e) {
    return serverError(String(e));
  }
}
