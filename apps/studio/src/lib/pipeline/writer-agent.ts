import { callGptSafe } from "@/lib/llm";
import type { PipelineOutline, PersonaContext, ContentType, ResearchPacket, Citation } from "./types";

/** Numbered source reference for citation tracking */
export interface NumberedSource {
  refNumber: number;
  title: string;
  url: string;
  snippet: string;
  sourceType: Citation["sourceType"];
}

/**
 * Assign sequential reference numbers to all citable sources in the research packet.
 * Order: KG artists first, then web sources.
 * Exported so editor-agent and orchestrator can use the same numbering.
 */
export function numberSources(research: ResearchPacket): NumberedSource[] {
  const sources: NumberedSource[] = [];
  let n = 1;

  for (const a of research.artists) {
    sources.push({
      refNumber: n++,
      title: `${a.name}${a.nameKo ? ` / ${a.nameKo}` : ""} (Knowledge Graph)`,
      url: "",
      snippet: a.bio?.slice(0, 150) ?? "",
      sourceType: "knowledgeGraph",
    });
  }

  for (const ws of research.webSources) {
    sources.push({
      refNumber: n++,
      title: ws.title,
      url: ws.url,
      snippet: ws.snippet,
      sourceType: "web",
    });
  }

  return sources;
}

/**
 * Persona Writer Agent — generates full draft content from outline.
 * Uses gpt-4o at higher temperature for creative writing.
 */
export async function generateDraft(
  outline: PipelineOutline,
  opts?: {
    persona?: PersonaContext | null;
    contentType?: ContentType;
    research?: ResearchPacket;
    editorFeedback?: string;
    /** Override LLM model (default: gpt-4o for blog/review, gpt-4o-mini for sns/carousel) */
    model?: string;
  },
): Promise<string> {
  const systemPrompt = buildSystemPrompt(opts?.persona ?? null, opts?.contentType ?? "blog");

  const feedbackSection = opts?.editorFeedback
    ? `\n\n--- EDITOR FEEDBACK (apply these corrections) ---\n${opts.editorFeedback}\n--- END FEEDBACK ---`
    : "";

  const researchSection = buildResearchContext(opts?.research);

  const userPrompt = `Write a complete blog article based on this outline.

TITLE: ${outline.title}
ANGLE: ${outline.angle}
TARGET WORD COUNT: ${outline.targetWordCount}+ words

OUTLINE:
${outline.sections
  .map(
    (s, i) =>
      `${i + 1}. ${s.heading}\n${s.keyPoints.map((p) => `   - ${p}`).join("\n")}`,
  )
  .join("\n\n")}

SEO KEYWORDS (weave naturally): ${outline.seoKeywords.join(", ")}
${researchSection}${feedbackSection}

Requirements:
- Write entirely in Korean (English terms for music/brand names are OK)
- Start with a compelling hook (not "오늘은 ~에 대해 알아보겠습니다" pattern)
- Use markdown formatting: # for title, ## for sections, ### for sub-sections
- Include specific examples, data, or references where relevant
- Use inline citations [1], [2], etc. when stating facts from the research data
- End the article with a "## 참고 자료" section listing all cited sources: [N] Title — URL
- End with a thought-provoking conclusion, not a generic summary
- Maintain consistent voice throughout

Return ONLY the markdown content.`;

  // SNS/carousel use cheaper model (short-form content doesn't need gpt-4o quality)
  const contentType = opts?.contentType ?? "blog";
  const defaultModel = (contentType === "sns" || contentType === "carousel") ? "gpt-4o-mini" : "gpt-4o";

  return callGptSafe(userPrompt, {
    caller: "pipeline",
    model: opts?.model ?? defaultModel,
    temperature: 0.8,
    maxTokens: contentType === "sns" ? 2000 : 8000,
    timeoutMs: 120_000,
    systemPrompt,
  });
}

function buildSystemPrompt(persona: PersonaContext | null, contentType: ContentType): string {
  if (!persona) {
    return `You are a skilled Korean music/culture magazine writer.
Write with passion, specificity, and cultural insight.
Avoid generic filler phrases and clickbait.`;
  }

  const parts = [
    `You are "${persona.name}", a writer for a Korean music/culture magazine.`,
  ];

  // Identity
  if (persona.perspective) {
    parts.push(`Perspective: ${persona.perspective}`);
  }
  if (persona.expertiseAreas.length > 0) {
    parts.push(`Expertise: ${persona.expertiseAreas.join(", ")}`);
  }

  // Voice profile
  parts.push("", "=== VOICE PROFILE ===");

  if (persona.styleFingerprint) {
    parts.push(`Style: ${persona.styleFingerprint}`);
  }

  if (persona.tone) {
    const t = persona.tone as Record<string, number>;
    parts.push(
      `Tone: formality=${t.formality ?? 5}/10, humor=${t.humor ?? 3}/10, emotion=${t.emotion ?? 5}/10, energy=${t.energy ?? 5}/10`,
    );
  }

  if (persona.emotionalDrivers.length > 0) {
    parts.push(`Emotional drivers: ${persona.emotionalDrivers.join(", ")}`);
  }

  if (persona.vocabulary) {
    const v = persona.vocabulary as Record<string, unknown>;
    if (v.preferredWords)
      parts.push(`Preferred vocabulary: ${JSON.stringify(v.preferredWords)}`);
    if (v.avoidWords)
      parts.push(`Avoid: ${JSON.stringify(v.avoidWords)}`);
    if (v.level) parts.push(`Vocabulary level: ${v.level}`);
  }

  if (persona.structure) {
    const s = persona.structure as Record<string, unknown>;
    if (s.hookStyle) parts.push(`Hook style: ${s.hookStyle}`);
    if (s.paragraphPattern)
      parts.push(`Paragraph pattern: ${s.paragraphPattern}`);
  }

  // Channel-specific overrides
  if (persona.channelProfiles) {
    const profile = persona.channelProfiles[contentType] as Record<string, unknown> | undefined;
    if (profile) {
      parts.push("", `=== CHANNEL OVERRIDE (${contentType}) ===`);
      for (const [k, v] of Object.entries(profile)) {
        parts.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
    }
  }

  // Content rules
  parts.push("", "=== RULES ===");

  if (persona.contentRules) {
    if (persona.contentRules.always.length > 0) {
      parts.push("ALWAYS:");
      for (const rule of persona.contentRules.always) {
        parts.push(`  - ${rule}`);
      }
    }
    if (persona.contentRules.never.length > 0) {
      parts.push("NEVER:");
      for (const rule of persona.contentRules.never) {
        parts.push(`  - ${rule}`);
      }
    }
  }

  parts.push(
    "- Maintain this voice consistently throughout the article",
    "- Avoid generic AI-sounding phrases",
    "- Be specific — reference actual songs, albums, artists, dates",
  );

  // Golden example (single best example to save tokens)
  const examples = persona.goldenExamples?.[contentType] ?? persona.goldenExamples?.["blog"] ?? [];
  if (examples.length > 0) {
    parts.push("", "=== REFERENCE EXAMPLE (match this style) ===");
    // Use only the first (best) example — saves ~300-500 tokens per call
    parts.push(`\n${examples[0]}`);
  }

  return parts.join("\n");
}

function buildResearchContext(research?: ResearchPacket): string {
  if (!research) return "";
  const numbered = numberSources(research);
  const parts: string[] = [
    "\n--- RESEARCH DATA (use [N] citations when referencing these facts) ---",
  ];

  // Artist KG data with reference numbers
  let artistIdx = 0;
  for (const a of research.artists) {
    const ref = numbered[artistIdx];
    const tag = ref ? ` [${ref.refNumber}]` : "";
    artistIdx++;
    parts.push(`\n[${a.name}${a.nameKo ? ` / ${a.nameKo}` : ""}]${tag}`);
    parts.push(`Genres: ${a.genres.join(", ")} | Popularity: ${a.popularity}/100`);
    if (a.bio) parts.push(`Bio: ${a.bio.slice(0, 300)}`);
    if (a.albums.length > 0) {
      parts.push(`Albums: ${a.albums.map((al) => `${al.title} (${al.releaseDate ?? "?"})`).join(", ")}`);
    }
    if (a.relatedArtists.length > 0) {
      parts.push(`Related: ${a.relatedArtists.map((r) => `${r.name} [${r.relationType}]`).join(", ")}`);
    }
  }

  // Web sources with reference numbers
  if (research.webSources.length > 0) {
    parts.push("\nWeb sources:");
    const webStart = research.artists.length;
    for (let i = 0; i < research.webSources.length; i++) {
      const s = research.webSources[i];
      const ref = numbered[webStart + i];
      const refNum = ref?.refNumber ?? webStart + i + 1;
      parts.push(`[${refNum}] ${s!.title}: ${s!.snippet}`);
    }
  }

  parts.push("--- END RESEARCH ---");
  return parts.join("\n");
}
