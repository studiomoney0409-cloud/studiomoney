import { inngest } from "../client";
import { prisma } from "@/lib/db";
import { generateProposals, publishApprovedProposals } from "@/lib/autopilot/scanner";

/**
 * Autopilot scan: generate proposals + publish approved. Runs every 30 minutes.
 * NOTE: Trend scanning is now also handled by Trend Scout agent.
 * This function continues to run for backward compatibility (direct autopilot configs).
 */
export const autopilotScan = inngest.createFunction(
  { id: "autopilot-scan", retries: 2 },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    const configs = await step.run("load-configs", () =>
      prisma.autopilotConfig.findMany({ where: { isActive: true } }),
    );

    let totalProposals = 0;
    for (const config of configs) {
      const count = await step.run(`generate-${config.id}`, () =>
        generateProposals(config.id),
      );
      totalProposals += count;
    }

    const published = await step.run("publish-approved", () =>
      publishApprovedProposals(),
    );

    return { configsProcessed: configs.length, proposalsGenerated: totalProposals, published };
  },
);
