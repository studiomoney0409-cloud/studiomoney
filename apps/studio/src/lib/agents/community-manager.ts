/**
 * Community Manager Agent — enhanced comment handling with
 * sentiment aggregation, escalation, and content idea extraction.
 *
 * Wraps existing: commentFetchHandler, commentMonitorHandler
 */
import { commentFetchHandler } from "@/lib/jobs/handlers/commentFetch";
import { commentMonitorHandler } from "@/lib/jobs/handlers/commentMonitor";
import type { AgentContext, CommunityReport } from "./types";

const NEGATIVE_SURGE_THRESHOLD = 0.30; // 30% negative = escalation

export async function runCommunityManagement(ctx: AgentContext): Promise<CommunityReport> {
  await ctx.log("info", "Starting community management cycle");

  // 1. Run existing comment fetch (brings in new comments from platforms)
  let fetchResult: unknown;
  try {
    fetchResult = await commentFetchHandler.handle({});
    await ctx.log("info", `Comment fetch complete: ${JSON.stringify(fetchResult)}`);
  } catch (err) {
    await ctx.log("warn", `Comment fetch failed: ${err}`);
  }

  // 2. Run existing comment monitor (classifies + auto-replies)
  let monitorResult: unknown;
  try {
    monitorResult = await commentMonitorHandler.handle({});
    await ctx.log("info", `Comment monitor complete: ${JSON.stringify(monitorResult)}`);
  } catch (err) {
    await ctx.log("warn", `Comment monitor failed: ${err}`);
  }

  // 3. Sentiment aggregation — last 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentMessages = await ctx.prisma.incomingMessage.findMany({
    where: { receivedAt: { gte: oneHourAgo } },
    select: {
      sentiment: true,
      classification: true,
      body: true,
    },
  });

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const msg of recentMessages) {
    const sentiment = (msg.sentiment ?? "neutral").toLowerCase();
    if (sentiment === "positive" || sentiment === "praise") {
      sentimentCounts.positive++;
    } else if (sentiment === "negative" || sentiment === "complaint") {
      sentimentCounts.negative++;
    } else {
      sentimentCounts.neutral++;
    }
  }

  const total = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;
  const negativeRatio = total > 0 ? sentimentCounts.negative / total : 0;

  // 4. Escalation check
  const escalations: string[] = [];
  if (negativeRatio >= NEGATIVE_SURGE_THRESHOLD && total >= 5) {
    const escalationMsg = `Negative sentiment surge: ${(negativeRatio * 100).toFixed(0)}% (${sentimentCounts.negative}/${total} messages)`;
    escalations.push(escalationMsg);
    await ctx.log("warn", escalationMsg);
  }

  // 5. Content idea extraction — find repeated questions
  const questions = recentMessages.filter(
    (m) => m.classification === "question",
  );

  const contentIdeas: string[] = [];
  if (questions.length >= 2) {
    // Simple frequency-based extraction: look for common words
    const wordFreq = new Map<string, number>();
    for (const q of questions) {
      const words = (q.body ?? "").split(/\s+/).filter((w: string) => w.length > 2);
      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }

    // Topics mentioned 2+ times
    const commonWords = [...wordFreq.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);

    if (commonWords.length > 0) {
      const idea = `팔로워 질문 기반 콘텐츠 아이디어: "${commonWords.join(", ")}" 관련 (${questions.length}건 질문)`;
      contentIdeas.push(idea);
      await ctx.log("info", idea);

      // Create TopicDraft for repeated questions
      await ctx.prisma.topicDraft.create({
        data: {
          topic: `팔로워 질문: ${commonWords.join(", ")}`,
          angle: "팔로워가 자주 묻는 질문에 대한 답변형 콘텐츠",
          contentType: "sns",
          sourceType: "community",
          sourceData: { questions: questions.map((q) => q.body) },
          status: "saved",
        },
      }).catch(() => {}); // non-fatal
    }
  }

  // Count auto-replies sent (approximate from recent replies)
  const repliesSent = await ctx.prisma.incomingMessage.count({
    where: {
      receivedAt: { gte: oneHourAgo },
      isRead: true,
      classification: { not: null },
    },
  });

  const report: CommunityReport = {
    repliesSent,
    sentimentSummary: {
      ...sentimentCounts,
      negativeRatio,
    },
    contentIdeas,
    escalations,
  };

  await ctx.log("info", `Community cycle: ${repliesSent} replies, sentiment ${sentimentCounts.positive}+/${sentimentCounts.neutral}~/${sentimentCounts.negative}-, ${escalations.length} escalations`);

  return report;
}
