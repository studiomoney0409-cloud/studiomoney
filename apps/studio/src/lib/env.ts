/**
 * Environment variable validation.
 * Call `validateEnv()` at server startup to check required keys.
 */

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { key: "OPENAI_API_KEY", required: true, description: "OpenAI API key for LLM calls" },
  { key: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  { key: "ANTHROPIC_API_KEY", required: false, description: "Anthropic API key for Claude (Chief Editor agent)" },
  { key: "INNGEST_SIGNING_KEY", required: false, description: "Inngest signing key for production webhook verification" },
  { key: "INNGEST_EVENT_KEY", required: false, description: "Inngest event key for sending events in production" },
  { key: "SLACK_WEBHOOK_URL", required: false, description: "Slack webhook for agent failure notifications" },
  { key: "FAL_KEY", required: false, description: "fal.ai key for Flux image generation" },
  { key: "CRON_SECRET", required: false, description: "Secret for cron job authentication" },
  { key: "SPOTIFY_CLIENT_ID", required: false, description: "Spotify API client ID" },
  { key: "SPOTIFY_CLIENT_SECRET", required: false, description: "Spotify API client secret" },
  { key: "UNSPLASH_ACCESS_KEY", required: false, description: "Unsplash image API key" },
  { key: "PEXELS_API_KEY", required: false, description: "Pexels image API key" },
];

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    const value = process.env[v.key];
    if (!value) {
      if (v.required) {
        missing.push(v.key);
      } else {
        warnings.push(v.key);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(", ")}`);
    for (const key of missing) {
      const desc = ENV_VARS.find((v) => v.key === key)?.description;
      console.error(`  - ${key}: ${desc}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[ENV] Optional variables not set (some features disabled): ${warnings.join(", ")}`);
  }

  if (missing.length === 0 && warnings.length === 0) {
    console.log("[ENV] All environment variables configured.");
  }

  return { valid: missing.length === 0, missing, warnings };
}
