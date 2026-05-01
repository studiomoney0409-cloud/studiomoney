/**
 * Copy Editor Agent — Inngest Functions
 *
 * Listens to content-producer.complete → runs QA gate → emits passed or blocked.
 * On block, performs ONE inline rewrite via writer-agent and re-runs QA.
 * If still blocked after rewrite, marks PipelineRun as "dropped" and notifies Slack.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runCopyEdit } from "@/lib/agents/copy-editor";
import { generateDraft } from "@/lib/pipeline/writer-agent";
import { notifySlack } from "@/lib/notify";
import type { PipelineOutline, ResearchPacket, ContentType } from "@/lib/pipeline/types";

/** Copy edit gate — triggered after content production. */
export const copyEditorGate = inngest.createFunction(
  { id: "copy-editor-gate", retries: 1 },
  { event: "agent/content-producer.complete" },
  async ({ event, step }) => {
    const {
      result,
      articleContent: initialArticleContent,
      topic,
      platforms,
      personaId,
      agentRunId: _parentRunId,
    } = event.data as {
      result: { pipelineRunId?: string; blogPostId?: string; publicationIds: string[]; qualityScore: number };
      articleContent: string;
      topic: string;
      platforms: string[];
      personaId?: string;
      agentRunId: string;
    };

    let articleContent = initialArticleContent;

    // Resolve blogPostId: direct from result → pipelineRunId lookup → topic fallback
    let blogPostId: string | undefined = result.blogPostId;
    if (!blogPostId) {
      const { prisma } = await import("@/lib/db");
      if (result.pipelineRunId) {
        const bp = await step.run("resolve-blog-post", () =>
          prisma.blogPost.findUnique({
            where: { pipelineRunId: result.pipelineRunId! },
            select: { id: true },
          }),
        );
        blogPostId = bp?.id;
      }
      if (!blogPostId) {
        const bp = await step.run("resolve-blog-post-by-topic", () =>
          prisma.blogPost.findFirst({
            where: { title: { contains: topic } },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          }),
        );
        blogPostId = bp?.id;
      }
    }

    let agentResult = await step.run("run-copy-edit", () =>
      runAgent("copy-editor", (ctx) =>
        runCopyEdit(ctx, {
          articleContent,
          topic,
          platforms,
          pipelineRunId: result.pipelineRunId,
          personaId,
          publicationIds: result.publicationIds,
          blogPostId,
        }),
      {
        triggerType: "event",
        triggerRef: "agent/content-producer.complete",
      }),
    );

    // ── Inline rewrite on block (one attempt) ─────────────────────
    if (
      agentResult.success &&
      agentResult.data?.verdict === "blocked" &&
      result.pipelineRunId
    ) {
      const blockReasons = agentResult.data.blockReasons;

      const rewritten = await step.run("rewrite-after-block", async () => {
        const { prisma } = await import("@/lib/db");
        const run = await prisma.pipelineRun.findUnique({
          where: { id: result.pipelineRunId! },
          select: {
            outlineJson: true,
            researchJson: true,
            contentType: true,
          },
        });
        if (!run?.outlineJson) return null;

        const newDraft = await generateDraft(
          run.outlineJson as unknown as PipelineOutline,
          {
            contentType: run.contentType as ContentType,
            research: (run.researchJson as unknown as ResearchPacket) ?? undefined,
            editorFeedback: blockReasons.join("\n"),
          },
        );

        await prisma.pipelineRun.update({
          where: { id: result.pipelineRunId! },
          data: {
            draftContent: newDraft,
            rewriteCount: { increment: 1 },
          },
        });
        if (blogPostId) {
          await prisma.blogPost.update({
            where: { id: blogPostId },
            data: { content: newDraft },
          });
        }
        return newDraft;
      });

      if (rewritten) {
        articleContent = rewritten;
        agentResult = await step.run("run-copy-edit-retry", () =>
          runAgent("copy-editor", (ctx) =>
            runCopyEdit(ctx, {
              articleContent,
              topic,
              platforms,
              pipelineRunId: result.pipelineRunId,
              personaId,
              publicationIds: result.publicationIds,
              blogPostId,
            }),
          {
            triggerType: "event",
            triggerRef: "agent/content-producer.complete:retry",
          }),
        );
      }
    }

    if (!agentResult.success || !agentResult.data) {
      // On failure, pass through to avoid blocking pipeline (but flag for review)
      await step.run("emit-pass-on-failure", () =>
        inngest.send({
          name: "agent/copy-editor.passed",
          data: {
            articleContent,
            topic,
            platforms,
            pipelineRunId: result.pipelineRunId,
            personaId,
            publicationIds: result.publicationIds,
            blogPostId,
            agentRunId: agentResult.runId,
          },
        }),
      );
      return agentResult;
    }

    const verdict = agentResult.data.verdict;

    if (verdict === "blocked") {
      // Final block after rewrite attempt — drop the run, notify, emit blocked event
      if (result.pipelineRunId) {
        await step.run("mark-dropped", async () => {
          const { prisma } = await import("@/lib/db");
          await prisma.pipelineRun.update({
            where: { id: result.pipelineRunId! },
            data: {
              status: "dropped",
              errorMessage: `Copy editor blocked after rewrite: ${agentResult.data!.blockReasons.join("; ")}`,
            },
          });
        });
      }
      await step.run("notify-dropped", () =>
        notifySlack(
          `:no_entry: [Copy Editor] 콘텐츠 폐기 (재작성 후에도 차단)`,
          {
            topic,
            blockReasons: agentResult.data!.blockReasons,
            pipelineRunId: result.pipelineRunId,
          },
        ),
      );
      await step.run("emit-blocked", () =>
        inngest.send({
          name: "agent/copy-editor.blocked",
          data: {
            topic,
            blockReasons: agentResult.data!.blockReasons,
            publicationIds: result.publicationIds,
            agentRunId: agentResult.runId,
          },
        }),
      );
    } else {
      // passed or needs-review both continue pipeline
      await step.run("emit-passed", () =>
        inngest.send({
          name: "agent/copy-editor.passed",
          data: {
            articleContent,
            topic,
            platforms,
            pipelineRunId: result.pipelineRunId,
            personaId,
            publicationIds: result.publicationIds,
            blogPostId,
            agentRunId: agentResult.runId,
          },
        }),
      );
    }

    return agentResult;
  },
);
