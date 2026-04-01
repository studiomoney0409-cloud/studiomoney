/**
 * Agent Runner — wraps every agent function with consistent tracking.
 *
 * - Creates AgentRun row (status: running)
 * - Provides ctx.log() that writes to AgentLog
 * - Calculates cost from LlmUsageLog entries during the run window
 * - Updates AgentRun on completion/failure
 * - Sends Slack notification on failure
 * - Timeout protection (default: 2 min)
 * - Optional exponential backoff retry
 */
import { prisma } from "@/lib/db";
import { notifySlack } from "@/lib/notify";
import { createLogger } from "@/lib/logger";
import type { AgentName, AgentContext, AgentResult } from "./types";

interface RunAgentOpts {
  triggerType?: "cron" | "event" | "manual";
  triggerRef?: string;
  input?: Record<string, unknown>;
  /** Max execution time in ms (default: 120_000 = 2 min) */
  timeoutMs?: number;
  /** Max retries with exponential backoff (default: 0 = no retry) */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 240_000; // 4 minutes (must stay under Vercel 300s maxDuration)
const BASE_DELAY_MS = 1_000; // 1 second base for exponential backoff

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Agent timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // 3. Execute agent logic with timeout and optional retry
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? 0;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await ctx.log("info", `Retry ${attempt}/${maxRetries} after ${delay}ms backoff`);
      await sleep(delay);
    }

    try {
      const data = await withTimeout(fn(ctx), timeoutMs);

      // Success path
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

      await ctx.log("info", `Agent completed in ${durationMs}ms (cost: $${costUsd.toFixed(4)})${attempt > 0 ? ` (attempt ${attempt + 1})` : ""}`);

      return { success: true, data, costUsd, durationMs, runId: run.id };
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof Error && err.message.includes("timed out");
      await ctx.log("warn", `Attempt ${attempt + 1}/${maxRetries + 1} failed: ${err instanceof Error ? err.message : String(err)}${isTimeout ? " (timeout)" : ""}`);

      // Only retry on transient errors (timeout, network), not on logic errors
      if (attempt < maxRetries && (isTimeout || isTransientError(err))) {
        continue;
      }
      break;
    }
  }

  // All retries exhausted — failure path
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);

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

  plog.error({ runId: run.id, err: lastError }, `Agent ${agentName} failed`);
  await notifySlack(
    `[Agent] ${agentName} 실행 실패`,
    { runId: run.id, error: errorMessage, durationMs },
  );

  return { success: false, error: errorMessage, costUsd: 0, durationMs, runId: run.id };
}

/** Detect transient errors worth retrying (network, rate limit, timeout). */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502")
  );
}
