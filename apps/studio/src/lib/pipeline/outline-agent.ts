import { callGptJson } from "@/lib/llm";
import type { PipelineOutline, PersonaContext, ResearchPacket } from "./types";
import { DEFAULT_NICHE_CONTEXT, type NicheContext } from "@/lib/niche/context";

const FALLBACK_INTRO = "You are a professional editorial planner.";

/**
 * Outline Agent — generates structured outline from a topic.
 * Uses gpt-4o-mini at low temperature for consistent structure.
 */
export async function generateOutline(
  topic: string,
  opts?: {
    persona?: PersonaContext | null;
    contentType?: string;
    targetWordCount?: number;
    research?: ResearchPacket;
    nicheContext?: NicheContext;
  },
): Promise<PipelineOutline> {
  const targetWordCount = opts?.targetWordCount ?? 2000;
  const ctx = opts?.nicheContext ?? DEFAULT_NICHE_CONTEXT;
  const intro = ctx.promptHints?.trim() || FALLBACK_INTRO;

  const personaSection = opts?.persona
    ? `
Writer Persona: ${opts.persona.name}
Style: ${opts.persona.styleFingerprint}
Tone preferences: ${JSON.stringify(opts.persona.tone ?? {})}
Structure preferences: ${JSON.stringify(opts.persona.structure ?? {})}`
    : "";

  const researchSection = buildResearchSection(opts?.research);

  const prompt = `${intro}

Generate a detailed blog post outline for the topic: "${topic}"

Target word count: ${targetWordCount}+ words
Content type: ${opts?.contentType ?? "blog"}
${personaSection}
${researchSection}

Consider:
- What angle makes this topic fresh and interesting?
- What narrative structure best serves the content? (chronological, thematic, analytical, comparative)
- How to hook the reader in the introduction?
- What facts, data, or references would strengthen each section?
- SEO keyword placement strategy
${researchSection ? "- Incorporate the research data above — use specific facts, albums, and relationships" : ""}

Return a JSON object:
{
  "title": "compelling title in Korean",
  "angle": "1-sentence description of the unique angle/perspective",
  "sections": [
    { "heading": "section heading", "keyPoints": ["point 1", "point 2", ...] }
  ],
  "seoTitle": "SEO title (Korean, under 60 chars)",
  "seoDescription": "meta description (Korean, under 160 chars)",
  "seoKeywords": ["keyword1", "keyword2", ...],
  "targetWordCount": ${targetWordCount}
}

Requirements:
- At least 5 sections for blog, 3 for review
- Each section must have 2-4 key points
- Angle should be specific and differentiated

Respond ONLY with the JSON object.`;

  return callGptJson<PipelineOutline>(prompt, {
    caller: "pipeline",
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 2000,
  });
}

function buildResearchSection(research?: ResearchPacket): string {
  if (!research) return "";

  const parts: string[] = ["\n=== RESEARCH DATA ==="];

  // Artist info from Knowledge Graph
  if (research.artists.length > 0) {
    parts.push("\nArtist Information:");
    for (const a of research.artists) {
      parts.push(`- ${a.name} (${a.nameKo || a.name}): ${a.genres.join(", ")} | popularity: ${a.popularity}/100`);
      if (a.bio) parts.push(`  Bio: ${a.bio.slice(0, 200)}...`);
      if (a.albums.length > 0) {
        parts.push(`  Recent albums: ${a.albums.map((al) => `${al.title} (${al.releaseDate ?? "?"})`).join(", ")}`);
      }
      if (a.relatedArtists.length > 0) {
        parts.push(`  Related: ${a.relatedArtists.map((r) => `${r.name} [${r.relationType}]`).join(", ")}`);
      }
    }
  }

  // Extracted entities
  if (research.entities.keywords.length > 0) {
    parts.push(`\nRelevant keywords: ${research.entities.keywords.join(", ")}`);
  }
  if (research.entities.genres.length > 0) {
    parts.push(`Relevant genres: ${research.entities.genres.join(", ")}`);
  }

  // Related past articles
  if (research.relatedArticles.length > 0) {
    parts.push("\nRelated past articles (avoid repeating same angles):");
    for (const a of research.relatedArticles.slice(0, 3)) {
      parts.push(`- [${a.sourceType}] ${a.content.slice(0, 150)}...`);
    }
  }

  return parts.length > 1 ? parts.join("\n") : "";
}
