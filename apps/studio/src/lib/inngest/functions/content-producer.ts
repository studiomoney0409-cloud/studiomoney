/**
 * Content Producer Agent — Inngest Functions
 *
 * Triggered by Chief Editor daily briefing or urgent content events.
 */
import { inngest } from "../client";
import { runAgent } from "@/lib/agents/agent-runner";
import { runContentProduction } from "@/lib/agents/content-producer";
import type { DailyAssignment } from "@/lib/agents/types";

/** Process daily assignments from Chief Editor. */
export const contentProducerRun = inngest.createFunction(
  { id: "content-producer-run", retries: 1 },
  { event: "agent/chief-editor.daily-briefing" },
  async ({ event, step }) => {
    const assignments = event.data.assignments as DailyAssignment[];
    const results = [];

    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i]!;
      const result = await step.run(`produce-${i}-${assignment.topic.slice(0, 20)}`, () =>
        runAgent(
          "content-producer",
          (ctx) => runContentProduction(ctx, assignment),
          {
            triggerType: "event",
            triggerRef: "agent/chief-editor.daily-briefing",
            input: { assignment },
          },
        ),
      );

      results.push(result);

      // Emit completion event for Design Director
      if (result.success && result.data) {
        await step.run(`emit-complete-${i}`, () =>
          inngest.send({
            name: "agent/content-producer.complete",
            data: {
              result: result.data!,
              articleContent: "", // Design Director will fetch from pipeline run
              topic: assignment.topic,
              platforms: assignment.platforms || [],
              personaId: assignment.personaId,
              agentRunId: result.runId,
            },
          }),
        );
      }
    }

    return { processed: results.length, successful: results.filter((r) => r.success).length };
  },
);

/** Process urgent content from Chief Editor emergency. */
export const contentProducerUrgent = inngest.createFunction(
  { id: "content-producer-urgent", retries: 1 },
  { event: "agent/chief-editor.urgent-content" },
  async ({ event, step }) => {
    const assignment = event.data.assignment as DailyAssignment;

    const result = await step.run("produce-urgent", () =>
      runAgent(
        "content-producer",
        (ctx) => runContentProduction(ctx, assignment),
        {
          triggerType: "event",
          triggerRef: "agent/chief-editor.urgent-content",
          input: { assignment, reason: event.data.reason },
        },
      ),
    );

    if (result.success && result.data) {
      await step.run("emit-complete", () =>
        inngest.send({
          name: "agent/content-producer.complete",
          data: {
            result: result.data!,
            articleContent: "",
            topic: assignment.topic,
            platforms: assignment.platforms || [],
            personaId: assignment.personaId,
            agentRunId: result.runId,
          },
        }),
      );
    }

    return result;
  },
);
