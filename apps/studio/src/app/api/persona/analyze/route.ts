import OpenAI from "openai";
import { json, badRequest, serverError } from "@/lib/studio";
import { workspaceGuard } from "@/lib/auth/route-guard";

const openai = new OpenAI();

/**
 * POST /api/persona/analyze — analyze writing style from sample texts.
 * Body: { texts: string[] }
 * Returns: { tone, vocabulary, structure, styleFingerprint }
 */
export async function POST(req: Request) {
  try {
    const guard = await workspaceGuard();
    if (!guard.ok) return guard.response;

    const body = (await req.json()) as { texts?: string[] };
    if (!body.texts?.length) {
      return badRequest("texts array is required (at least 3 samples recommended)");
    }

    const samples = body.texts.slice(0, 20);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a writing style analyst. Analyze the provided text samples and extract the author's unique writing style.

Return a JSON object with these fields:
{
  "tone": {
    "formality": "formal" | "casual" | "conversational" | "professional",
    "humor": "none" | "subtle" | "frequent" | "sarcastic",
    "emotion": "neutral" | "passionate" | "empathetic" | "provocative",
    "energy": "calm" | "moderate" | "energetic" | "intense"
  },
  "vocabulary": {
    "level": "simple" | "moderate" | "advanced" | "technical",
    "preferredWords": ["word1", "word2", ...],
    "avoidWords": [],
    "jargon": ["term1", "term2", ...]
  },
  "structure": {
    "avgSentenceLength": "short" | "medium" | "long" | "mixed",
    "paragraphPattern": "single-line" | "short-paragraphs" | "long-form",
    "hookStyle": "question" | "statement" | "statistic" | "story" | "provocative"
  },
  "styleFingerprint": "A 2-3 paragraph prose description of this author's distinctive writing style, tone, patterns, and personality that could be used as instructions for an AI to replicate this style. Write in Korean."
}

Respond ONLY with valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: `Analyze these ${samples.length} text samples:\n\n${samples.map((t, i) => `--- Sample ${i + 1} ---\n${t.slice(0, 500)}`).join("\n\n")}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(text);
    return json(result);
  } catch (e) {
    return serverError(String(e));
  }
}
