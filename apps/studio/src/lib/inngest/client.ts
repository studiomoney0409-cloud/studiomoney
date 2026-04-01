import { Inngest } from "inngest";

// Warn at startup if critical Inngest env vars are missing (common Vercel deployment issue)
if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
  if (!process.env.INNGEST_EVENT_KEY) {
    console.warn("[inngest] INNGEST_EVENT_KEY is not set — event sending will fail in production");
  }
  if (!process.env.INNGEST_SIGNING_KEY) {
    console.warn("[inngest] INNGEST_SIGNING_KEY is not set — webhook verification will fail");
  }
}

export const inngest = new Inngest({ id: "web-magazine-studio" });
