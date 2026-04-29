/**
 * Newsletter Manager Agent — weekly digest curation, A/B subject lines, delivery.
 *
 * Curates top content from the past week, generates compelling subject lines,
 * segments subscribers, and sends via email provider.
 */
import { callGptJson } from "@/lib/llm";
import { sendEmail } from "@/lib/email/sender";
import { z } from "zod";
import type { AgentContext, NewsletterResult } from "./types";

export async function runWeeklyDigest(ctx: AgentContext): Promise<NewsletterResult> {
  await ctx.log("info", "Starting weekly newsletter digest curation");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Fetch this week's published content, ranked by engagement
  const recentPosts = await ctx.prisma.blogPost.findMany({
    where: {
      status: "published",
      publishedAt: { gte: weekAgo },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      seoDescription: true,
      publishedUrl: true,
      coverImageUrl: true,
      pipelineRunId: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  if (recentPosts.length === 0) {
    await ctx.log("info", "No posts published this week, skipping newsletter");
    return {
      issueId: "",
      subject: "",
      articleCount: 0,
      recipientCount: 0,
      segmentsSent: 0,
      status: "failed",
    };
  }

  // Get engagement rates for ranking
  const runIds = recentPosts.map((p) => p.pipelineRunId).filter(Boolean) as string[];
  const runs = await ctx.prisma.pipelineRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, engagementRate: true },
  });
  const engagementMap = new Map(runs.map((r) => [r.id, r.engagementRate ?? 0]));

  // Sort by engagement
  const rankedPosts = [...recentPosts].sort((a, b) => {
    const engA = a.pipelineRunId ? (engagementMap.get(a.pipelineRunId) ?? 0) : 0;
    const engB = b.pipelineRunId ? (engagementMap.get(b.pipelineRunId) ?? 0) : 0;
    return engB - engA;
  });

  const topPosts = rankedPosts.slice(0, 5);

  // 2. LLM: curate newsletter content + A/B subject lines
  const postSummaries = topPosts.map((p, i) =>
    `${i + 1}. ${p.title}\n   ${p.excerpt || p.seoDescription || ""}`,
  ).join("\n\n");

  const curation = await callGptJson(
    `당신은 음악/문화 웹매거진 뉴스레터 편집자입니다. 이번 주 발행된 기사를 기반으로 뉴스레터를 구성하세요.

## 이번 주 기사
${postSummaries}

## 요구사항
- subjectA: 매력적인 이메일 제목 A안 (40자 이내)
- subjectB: 다른 톤의 이메일 제목 B안 (A/B 테스트용)
- intro: 인사 + 이번 주 하이라이트 소개 (2-3문장)
- editorPick: 에디터 추천 기사 번호 (1~${topPosts.length})
- articleSummaries: 각 기사별 요약 (2문장 이내)

한국어로 작성하세요. 톤은 친근하지만 전문적으로.`,
    {
      caller: "newsletter-manager:curation",
      schema: z.object({
        subjectA: z.string(),
        subjectB: z.string(),
        intro: z.string(),
        editorPick: z.number(),
        articleSummaries: z.array(z.string()),
      }),
    },
  );

  // 3. Build HTML body (escape user content to prevent XSS)
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const articlesHtml = topPosts.map((post, i) => {
    const summary = esc(curation.articleSummaries[i] ?? post.excerpt ?? "");
    const isEditorPick = i + 1 === curation.editorPick;
    const url = post.publishedUrl ?? `/${post.slug}`;
    return `
      <div style="margin-bottom:24px;padding:16px;border-left:3px solid ${isEditorPick ? "#e74c3c" : "#ddd"}">
        ${isEditorPick ? '<span style="color:#e74c3c;font-size:12px;font-weight:bold">★ 에디터 추천</span><br>' : ""}
        <a href="${esc(url)}" style="font-size:18px;font-weight:bold;color:#333;text-decoration:none">${esc(post.title)}</a>
        <p style="color:#666;margin:8px 0 0">${summary}</p>
      </div>`;
  }).join("\n");

  const bodyHtml = `
    <div style="max-width:600px;margin:0 auto;font-family:'Noto Sans KR',sans-serif">
      <h1 style="font-size:24px;border-bottom:2px solid #333;padding-bottom:8px">이번 주 매거진</h1>
      <p style="color:#555">${curation.intro}</p>
      ${articlesHtml}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
      <p style="color:#999;font-size:12px">이 뉴스레터가 마음에 들지 않으면 <a href="{{unsubscribe_url}}">구독 해지</a>할 수 있습니다.</p>
    </div>`;

  const bodyText = `이번 주 매거진\n\n${curation.intro}\n\n${topPosts.map((p, i) => `${i + 1}. ${p.title}\n${curation.articleSummaries[i] ?? ""}`).join("\n\n")}`;

  // 4. Create NewsletterIssue record
  const issue = await ctx.prisma.newsletterIssue.create({
    data: {
      workspaceId: ctx.workspaceId,
      subject: curation.subjectA,
      subjectB: curation.subjectB,
      bodyHtml,
      bodyText,
      articleIds: topPosts.map((p) => p.id),
      status: "sending",
    },
  });

  // 5. Fetch active subscribers grouped by segment
  const subscribers = await ctx.prisma.subscriber.findMany({
    where: { status: "active" },
    select: { email: true, segments: true },
  });

  if (subscribers.length === 0) {
    await ctx.prisma.newsletterIssue.update({
      where: { id: issue.id },
      data: { status: "sent", recipientCount: 0 },
    });
    await ctx.log("info", "No active subscribers, newsletter created but not sent");
    return {
      issueId: issue.id,
      subject: curation.subjectA,
      subjectVariantB: curation.subjectB,
      articleCount: topPosts.length,
      recipientCount: 0,
      segmentsSent: 0,
      status: "sent",
    };
  }

  // 6. A/B split: shuffle then split for unbiased assignment
  const emails = subscribers.map((s: { email: string }) => s.email);
  // Fisher-Yates shuffle for random A/B assignment
  for (let i = emails.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [emails[i], emails[j]] = [emails[j]!, emails[i]!];
  }
  const midpoint = Math.ceil(emails.length / 2);
  const groupA = emails.slice(0, midpoint);
  const groupB = emails.slice(midpoint);

  let totalSent = 0;

  try {
    // Send variant A
    if (groupA.length > 0) {
      const resultA = await sendEmail({
        to: groupA,
        subject: curation.subjectA,
        html: bodyHtml,
        text: bodyText,
      });
      await ctx.prisma.newsletterCampaign.create({
        data: {
          issueId: issue.id,
          segment: "all",
          variant: "A",
          recipientCount: groupA.length,
          sentCount: resultA.accepted,
          externalBatchId: resultA.batchId,
          status: "sent",
        },
      });
      totalSent += resultA.accepted;
    }

    // Send variant B
    if (groupB.length > 0) {
      const resultB = await sendEmail({
        to: groupB,
        subject: curation.subjectB,
        html: bodyHtml,
        text: bodyText,
      });
      await ctx.prisma.newsletterCampaign.create({
        data: {
          issueId: issue.id,
          segment: "all",
          variant: "B",
          recipientCount: groupB.length,
          sentCount: resultB.accepted,
          externalBatchId: resultB.batchId,
          status: "sent",
        },
      });
      totalSent += resultB.accepted;
    }

    // Update issue as sent
    await ctx.prisma.newsletterIssue.update({
      where: { id: issue.id },
      data: { status: "sent", sentAt: new Date(), recipientCount: totalSent },
    });
  } catch (err) {
    // Mark issue as failed if sending throws
    await ctx.prisma.newsletterIssue.update({
      where: { id: issue.id },
      data: { status: "failed" },
    });
    await ctx.log("error", `Newsletter sending failed: ${err}`);
    return {
      issueId: issue.id,
      subject: curation.subjectA,
      subjectVariantB: curation.subjectB,
      articleCount: topPosts.length,
      recipientCount: 0,
      segmentsSent: 0,
      status: "failed",
    };
  }

  await ctx.log("info", `Newsletter sent: "${curation.subjectA}" to ${totalSent} subscribers`);

  return {
    issueId: issue.id,
    subject: curation.subjectA,
    subjectVariantB: curation.subjectB,
    articleCount: topPosts.length,
    recipientCount: totalSent,
    segmentsSent: groupB.length > 0 ? 2 : 1,
    status: "sent",
  };
}
