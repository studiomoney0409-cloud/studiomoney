import { callGptJson } from "@/lib/llm";
import type { PipelineOutline, QualityScore, EditorResult, ContentRules, ResearchPacket } from "./types";
import { numberSources } from "./writer-agent";
import { DEFAULT_NICHE_CONTEXT, type NicheContext } from "@/lib/niche/context";

const FALLBACK_EDITOR_INTRO = "Senior editor.";

const QUALITY_THRESHOLD = 70;

const RUBRIC_WEIGHTS = {
  factualAccuracy: 0.25,
  voiceAlignment: 0.20,
  readability: 0.20,
  originality: 0.20,
  seo: 0.15,
};

/**
 * Editor Agent — evaluates and improves draft content.
 * Uses gpt-4o-mini at low temperature for consistent evaluation.
 */
export async function evaluateAndEdit(
  draft: string,
  outline: PipelineOutline,
  opts?: {
    personaName?: string;
    styleFingerprint?: string;
    contentRules?: ContentRules | null;
    research?: ResearchPacket | null;
    nicheContext?: NicheContext;
  },
): Promise<EditorResult> {
  const ctx = opts?.nicheContext ?? DEFAULT_NICHE_CONTEXT;
  const intro = ctx.promptHints?.trim() || FALLBACK_EDITOR_INTRO;
  const voiceRef = opts?.styleFingerprint
    ? `\nVoice reference: ${opts.styleFingerprint}`
    : "";

  const contentRulesSection = buildContentRulesSection(opts?.contentRules);

  // Build citation reference list for verification
  const citationRef = opts?.research
    ? `\nAVAILABLE SOURCES:\n${numberSources(opts.research).map((s) => `[${s.refNumber}] ${s.title}${s.url ? ` — ${s.url}` : ""}`).join("\n")}\n`
    : "";

  const citationInstruction = citationRef
    ? `\nCitation check: verify all [N] references in the text match the AVAILABLE SOURCES list. Flag fabricated citations (numbers not in sources) or major uncited factual claims. Add issues to "citationIssues" array.`
    : "";

  const prompt = `${intro} Acting as senior editor: score the draft on 5 dimensions (0-100), give actionable feedback, and apply light edits preserving voice.

OUTLINE: ${outline.title} | Angle: ${outline.angle} | SEO: ${outline.seoKeywords.join(", ")} | Min ${outline.targetWordCount} words${voiceRef}
${contentRulesSection}${citationRef}
DRAFT:
---
${draft}
---

Dimensions: factualAccuracy (names/dates/claims correct?), voiceAlignment (consistent voice, not AI-generic?${opts?.personaName ? ` matches "${opts.personaName}"?` : ""}), readability (engaging prose, good flow?), originality (unique angle, no cliches?), seo (keywords integrated, good headings?)${citationInstruction}

Return JSON:
{"score":{"factualAccuracy":<n>,"voiceAlignment":<n>,"readability":<n>,"originality":<n>,"seo":<n>,"overall":<weighted avg>,"feedback":"<2-5 actionable suggestions in Korean>"},"editedContent":"<lightly edited draft>","ruleViolations":["<NEVER rule violations if any>"],"citationIssues":["<citation problems if any>"]}

70+ = publishable. <50 in any = needs rework.${contentRulesSection ? " NEVER rule violations = automatic fail." : ""} JSON only.`;

  const result = await callGptJson<{
    score: QualityScore;
    editedContent: string;
    ruleViolations?: string[];
    citationIssues?: string[];
  }>(prompt, {
    caller: "pipeline",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 10000,
    timeoutMs: 120_000,
  });

  // Recalculate overall score with our weights
  const s = result.score;
  s.overall = Math.round(
    s.factualAccuracy * RUBRIC_WEIGHTS.factualAccuracy +
    s.voiceAlignment * RUBRIC_WEIGHTS.voiceAlignment +
    s.readability * RUBRIC_WEIGHTS.readability +
    s.originality * RUBRIC_WEIGHTS.originality +
    s.seo * RUBRIC_WEIGHTS.seo,
  );

  const hasRuleViolations = (result.ruleViolations ?? []).length > 0;

  // Append rule violations to feedback if any
  if (hasRuleViolations) {
    s.feedback = `${s.feedback}\n\n[RULE VIOLATIONS] ${result.ruleViolations!.join("; ")}`;
  }

  // Append citation issues to feedback (soft failure, not auto-reject)
  const citationIssues = result.citationIssues ?? [];
  if (citationIssues.length > 0) {
    s.feedback = `${s.feedback}\n\n[CITATION ISSUES] ${citationIssues.join("; ")}`;
  }

  return {
    score: s,
    editedContent: result.editedContent,
    passed: s.overall >= QUALITY_THRESHOLD && !hasRuleViolations,
    citationIssues,
  };
}

function buildContentRulesSection(rules?: ContentRules | null): string {
  if (!rules) return "";
  const parts: string[] = ["\nCONTENT RULES (strict enforcement):"];
  if (rules.always.length > 0) {
    parts.push("ALWAYS do:");
    for (const r of rules.always) parts.push(`  - ${r}`);
  }
  if (rules.never.length > 0) {
    parts.push("NEVER do (violations = automatic rejection):");
    for (const r of rules.never) parts.push(`  - ${r}`);
  }
  return parts.join("\n");
}
