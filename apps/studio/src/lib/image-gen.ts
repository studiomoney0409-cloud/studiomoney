/**
 * Unified Image Generation — DALL-E 3 + Flux (fal.ai) dual provider.
 *
 * Auto-routes based on use case:
 *   - Text-in-image / typography → DALL-E 3 (best text accuracy)
 *   - Photorealistic / background / hero → Flux Pro (best quality, cheapest)
 *   - Fast preview / thumbnail → Flux Schnell (1-2s, ~$0.003)
 *
 * User can override with `provider` option.
 */
import OpenAI from "openai";
import { fal } from "@fal-ai/client";

// ── Types ────────────────────────────────────────────────

export type ImageProvider = "dalle" | "flux-pro" | "flux-schnell";
export type ImagePurpose = "text-overlay" | "hero" | "background" | "thumbnail" | "editorial" | "general";

export type AspectRatio = "landscape" | "square" | "portrait";

export interface ImageGenOptions {
  prompt: string;
  /** Workspace owning this generation (history record). Optional — defaults to system default workspace. */
  workspaceId?: string;
  /** Override auto-routing */
  provider?: ImageProvider;
  /** Hints for auto-routing */
  purpose?: ImagePurpose;
  aspectRatio?: AspectRatio;
  /** DALL-E style: "vivid" (default) or "natural" */
  dalleStyle?: "vivid" | "natural";
  /** DALL-E quality: "standard" (default) or "hd" */
  dalleQuality?: "standard" | "hd";
  /** Flux guidance scale (default 3.5) */
  guidanceScale?: number;
  /** Flux num_inference_steps (default: schnell=4, pro=28) */
  steps?: number;
}

export interface ImageGenResult {
  imageUrl: string;
  /** Base64 data URI (if available) */
  dataUri?: string;
  provider: ImageProvider;
  revisedPrompt?: string;
  width: number;
  height: number;
  /** Generation time in ms */
  elapsedMs: number;
  /** Estimated cost in USD */
  costUsd: number;
}

// ── Cost estimation ──────────────────────────────────────

const COST_MAP: Record<string, number> = {
  "dalle:standard": 0.04,
  "dalle:hd": 0.08,
  "flux-pro": 0.08,
  "flux-schnell": 0.003,
};

function estimateCost(provider: ImageProvider, quality?: string): number {
  if (provider === "dalle") return COST_MAP[`dalle:${quality ?? "standard"}`] ?? 0.04;
  return COST_MAP[provider] ?? 0;
}

// ── History persistence (fire-and-forget) ────────────────

function saveToHistory(result: ImageGenResult, opts: ImageGenOptions): void {
  try {
    // Dynamic import to avoid circular deps and client-side issues
    void (async () => {
      const { prisma } = await import("@/lib/db");
      const { fallbackWorkspaceId } = await import("@/lib/auth/workspace-fallback");
      const workspaceId = opts.workspaceId ?? (await fallbackWorkspaceId());
      if (!workspaceId) return;
      await prisma.imageGenHistory.create({
        data: {
          workspaceId,
          prompt: opts.prompt,
          revisedPrompt: result.revisedPrompt,
          provider: result.provider,
          imageUrl: result.imageUrl,
          width: result.width,
          height: result.height,
          aspectRatio: opts.aspectRatio ?? "square",
          purpose: opts.purpose ?? "general",
          costUsd: result.costUsd,
          elapsedMs: result.elapsedMs,
        },
      });
    })().catch(() => {}); // silently fail — history is non-critical
  } catch {
    // prisma not available
  }
}

// ── Size maps ────────────────────────────────────────────

const DALLE_SIZES: Record<AspectRatio, "1792x1024" | "1024x1024" | "1024x1792"> = {
  landscape: "1792x1024",
  square: "1024x1024",
  portrait: "1024x1792",
};

const FLUX_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  landscape: { width: 1792, height: 1024 },
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1792 },
};

// ── Auto-routing ─────────────────────────────────────────

function autoSelectProvider(opts: ImageGenOptions): ImageProvider {
  if (opts.provider) return opts.provider;

  const purpose = opts.purpose ?? "general";

  switch (purpose) {
    case "text-overlay":
      return "dalle";
    case "thumbnail":
      return "flux-schnell";
    case "hero":
    case "background":
    case "editorial":
      return hasFalKey() ? "flux-pro" : "dalle";
    default:
      return hasFalKey() ? "flux-pro" : "dalle";
  }
}

function hasFalKey(): boolean {
  return !!process.env.FAL_KEY;
}

// ── DALL-E 3 provider ────────────────────────────────────

const openai = new OpenAI();

async function generateDalle(opts: ImageGenOptions): Promise<ImageGenResult> {
  const aspect = opts.aspectRatio ?? "landscape";
  const start = performance.now();

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: opts.prompt,
    n: 1,
    size: DALLE_SIZES[aspect],
    quality: opts.dalleQuality ?? "standard",
    style: opts.dalleStyle ?? "vivid",
    response_format: "url",
  });

  const first = response.data?.[0];
  if (!first?.url) throw new Error("DALL-E returned no image");

  const [w, h] = DALLE_SIZES[aspect].split("x").map(Number) as [number, number];

  return {
    imageUrl: first.url,
    provider: "dalle",
    revisedPrompt: first.revised_prompt,
    width: w,
    height: h,
    elapsedMs: Math.round(performance.now() - start),
    costUsd: estimateCost("dalle", opts.dalleQuality),
  };
}

// ── Flux provider (fal.ai) ───────────────────────────────

function configureFal(): void {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is required for Flux image generation");

  fal.config({ credentials: key });
}

interface FalImageOutput {
  images: Array<{ url: string; content_type?: string }>;
}

async function generateFlux(
  opts: ImageGenOptions,
  model: "flux-pro" | "flux-schnell",
): Promise<ImageGenResult> {
  configureFal();

  const aspect = opts.aspectRatio ?? "landscape";
  const size = FLUX_SIZES[aspect];
  const start = performance.now();

  const modelId = model === "flux-pro"
    ? "fal-ai/flux-pro/v1.1"
    : "fal-ai/flux/schnell";

  const result = await fal.subscribe(modelId, {
    input: {
      prompt: opts.prompt,
      image_size: {
        width: size.width,
        height: size.height,
      },
      num_inference_steps: opts.steps ?? (model === "flux-schnell" ? 4 : 28),
      guidance_scale: opts.guidanceScale ?? 3.5,
      num_images: 1,
      enable_safety_checker: true,
    },
  }) as { data: FalImageOutput };

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`Flux (${model}) returned no image`);

  return {
    imageUrl,
    provider: model,
    width: size.width,
    height: size.height,
    elapsedMs: Math.round(performance.now() - start),
    costUsd: estimateCost(model),
  };
}

// ── Public API ───────────────────────────────────────────

/**
 * Generate an image using the best provider for the given purpose.
 * Auto-routes: text-overlay → DALL-E, photo/hero → Flux Pro, thumbnail → Flux Schnell.
 * Falls back to DALL-E if FAL_KEY is not set.
 */
export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult> {
  const provider = autoSelectProvider(opts);

  let result: ImageGenResult;
  switch (provider) {
    case "dalle":
      result = await generateDalle(opts);
      break;
    case "flux-pro":
      result = await generateFlux(opts, "flux-pro");
      break;
    case "flux-schnell":
      result = await generateFlux(opts, "flux-schnell");
      break;
  }

  saveToHistory(result, opts);
  return result;
}

/**
 * Generate multiple variants using different providers for comparison.
 */
export async function generateImageComparison(
  opts: Omit<ImageGenOptions, "provider">,
): Promise<ImageGenResult[]> {
  const providers: ImageProvider[] = hasFalKey()
    ? ["dalle", "flux-pro"]
    : ["dalle"];

  const results = await Promise.allSettled(
    providers.map((provider) => generateImage({ ...opts, provider })),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ImageGenResult> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * Check which providers are available (have valid API keys configured).
 */
export function getAvailableProviders(): { provider: ImageProvider; available: boolean }[] {
  return [
    { provider: "dalle", available: !!process.env.OPENAI_API_KEY },
    { provider: "flux-pro", available: hasFalKey() },
    { provider: "flux-schnell", available: hasFalKey() },
  ];
}
