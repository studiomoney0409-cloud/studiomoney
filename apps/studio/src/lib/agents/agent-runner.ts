/**
 * Agent Runner — wraps every agent function with consistent tracking.
 *
 * - Creates AgentRun row (status: running)
 * - Provides ctx.log() that writes to AgentLog
 * - Calculates cost from LlmUsageLog entries during the run window
 * - Updates AgentRun on completion/failure
 * - Sends Slack notification on failure
 */
import { prisma } from "@/lib/db";
import { notifySlack } from "@/lib/notify";
import { createLogger } from "@/lib/logger";
import type { AgentName, AgentContext, AgentResult } from "./types";

interface RunAgentOpts {
  triggerType?: "cron" | "event" | "manual";
  triggerRef?: string;
  input?: Record<string, unknown>;
}

export async function runAgent<T>(
  agentName: AgentName,
  fn: (ctx: AgentContext) => Promise<T>,
  opts: RunAgentOpts = {},
): Promise<AgentResult<T>> {
  const plog = createLogger({ agent: agentName });
  const startedAt = new Date();

  // 1. Create run record
  const run = await prisma.agentRun.create({
    data: {
      agentName,
      triggerType: opts.triggerType ?? "cron",
      triggerRef: opts.triggerRef ?? "",
      status: "running",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputJson: (opts.input ?? undefined) as any,
      startedAt,
    },
  });

  // 2. Build context
  const ctx: AgentContext = {
    runId: run.id,
    agentName,
    prisma,
    log: async (level, message, metadata) => {
      plog[level]({ runId: run.id, ...metadata }, message);
      await prisma.agentLog.create({
        data: {
          agentRunId: run.id,
          level,
          message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: (metadata ?? undefined) as any,
        },
      }).catch(() => {}); // non-fatal
    },
  };

  // 3. Execute agent logic
  try {
    const data = await fn(ctx);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Calculate cost from LLM usage logs created during this run
    const costResult = await prisma.llmUsageLog.aggregate({
      _sum: { costUsd: true },
      where: {
        createdAt: { gte: startedAt, lte: completedAt },
        caller: { contains: agentName },
      },
    });
    const costUsd = costResult._sum.costUsd ?? 0;

    // Update run record
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputJson: data as any,
        costUsd,
        durationMs,
        completedAt,
      },
    });

    await ctx.log("info", `Agent completed in ${durationMs}ms (cost: $${costUsd.toFixed(4)})`);

    return { success: true, data, costUsd, durationMs, runId: run.id };
  } catch (err) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Update run record as failed
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage,
        durationMs,
        completedAt,
      },
    });

    await ctx.log("error", `Agent failed: ${errorMessage}`);

    plog.error({ runId: run.id, err }, `Agent ${agentName} failed`);
    await notifySlack(
      `[Agent] ${agentName} 실행 실패`,
      { runId: run.id, error: errorMessage, durationMs },
    );

    return { success: false, error: errorMessage, costUsd: 0, durationMs, runId: run.id };
  }
}
