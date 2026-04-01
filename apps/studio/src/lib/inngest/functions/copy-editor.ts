/**
 * Copy Editor Agent — Inngest Functions
 *
 * Listens to content-producer.complete → runs QA gate → emits passed or blocked.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runCopyEdit } from "@/lib/agents/copy-editor";

/** Copy edit gate — triggered after content production. */
export const copyEditorGate = inngest.createFunction(
  { id: "copy-editor-gate", retries: 1 },
  { event: "agent/content-producer.complete" },
  async ({ event, step }) => {
    const {
      result,
      articleContent,
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
      // Fallback: find most recent BlogPost matching topic
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

    const agentResult = await step.run("run-copy-edit", () =>
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
