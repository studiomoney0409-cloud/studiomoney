import { prisma } from "@/lib/db";
import { json, notFound, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

/** GET /api/blog/[id] — get full blog post */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const post = await prisma.blogPost.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { pipelineRun: true },
    });
    if (!post) return notFound("Blog post not found");
    return json(post);
  } catch (e) {
    return serverError(String(e));
  }
}

/** PATCH /api/blog/[id] — update blog post content */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const owned = await prisma.blogPost.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Blog post not found");
    const body = (await req.json()) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) {
      data.content = body.content;
      data.wordCount = (body.content as string).split(/\s+/).length;
    }
    if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription;
    if (body.seoKeywords !== undefined) data.seoKeywords = body.seoKeywords;
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "published") data.publishedAt = new Date();
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data,
    });
    return json(updated);
  } catch (e) {
    return serverError(String(e));
  }
}

/** DELETE /api/blog/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;
    const { workspace } = guard.ctx;
    const { id } = await params;
    const owned = await prisma.blogPost.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!owned) return notFound("Blog post not found");
    await prisma.blogPost.delete({ where: { id } });
    return json({ deleted: true });
  } catch (e) {
    return serverError(String(e));
  }
}
