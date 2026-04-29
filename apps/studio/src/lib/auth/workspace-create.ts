import { prisma } from "../db";
import type { NicheTemplate, Workspace } from "../../generated/prisma/client";

export type CreateWorkspaceInput = {
  ownerId: string;
  name: string;
  niche: string;
  slug?: string;
  keywords?: string[];
  trendSources?: Record<string, unknown>;
  promptHints?: string;
  language?: string;
  region?: string;
};

export function normalizeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\w가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return cleaned || `ws-${Math.random().toString(36).slice(2, 8)}`;
}

async function uniqueSlugFor(ownerId: string, base: string): Promise<string> {
  let slug = base;
  let suffix = 2;
  while (await prisma.workspace.findUnique({ where: { ownerId_slug: { ownerId, slug } } })) {
    slug = `${base}-${suffix++}`;
    if (suffix > 50) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      break;
    }
  }
  return slug;
}

/**
 * Create a workspace from a NicheTemplate, seeding a default persona and brand kit.
 * The first workspace owned by a user is marked as default.
 */
export async function createWorkspaceFromNiche(input: CreateWorkspaceInput): Promise<Workspace> {
  const template = await prisma.nicheTemplate.findUnique({ where: { niche: input.niche } });
  if (!template) throw new Error(`Unknown niche: ${input.niche}`);

  const slug = await uniqueSlugFor(input.ownerId, normalizeSlug(input.slug ?? input.name));
  const isFirst = (await prisma.workspace.count({ where: { ownerId: input.ownerId } })) === 0;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: input.ownerId,
      name: input.name,
      slug,
      niche: template.niche,
      keywords: input.keywords ?? template.defaultKeywords,
      trendSources: (input.trendSources ?? template.defaultSources) as object,
      promptHints: input.promptHints ?? template.promptHints,
      language: input.language ?? "ko",
      region: input.region ?? "KR",
      isDefault: isFirst,
    },
  });

  await seedDefaultPersona(workspace.id, workspace.name, template);
  await seedDefaultBrandKit(workspace.id);

  return workspace;
}

async function seedDefaultPersona(workspaceId: string, workspaceName: string, template: NicheTemplate) {
  const blueprint = (template.defaultPersona ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonOrUndefined = (v: unknown) => (v == null ? undefined : (v as any));
  await prisma.writingPersona.create({
    data: {
      workspaceId,
      name: `${workspaceName} 기본 페르소나`,
      creationMethod: "template",
      perspective: typeof blueprint.perspective === "string" ? blueprint.perspective : "",
      expertiseAreas: Array.isArray(blueprint.expertiseAreas) ? (blueprint.expertiseAreas as string[]) : [],
      tone: jsonOrUndefined(blueprint.tone),
      emotionalDrivers: Array.isArray(blueprint.emotionalDrivers) ? (blueprint.emotionalDrivers as string[]) : [],
      vocabulary: jsonOrUndefined(blueprint.vocabulary),
      structure: jsonOrUndefined(blueprint.structure),
      contentRules: jsonOrUndefined(blueprint.contentRules),
      channelProfiles: jsonOrUndefined(blueprint.channelProfiles),
      goldenExamples: jsonOrUndefined(blueprint.goldenExamples),
      styleFingerprint: typeof blueprint.styleFingerprint === "string" ? blueprint.styleFingerprint : "",
      isDefault: true,
      isActive: true,
    },
  });
}

async function seedDefaultBrandKit(workspaceId: string) {
  await prisma.brandKit.create({
    data: { workspaceId, name: "Default Brand Kit", isDefault: true },
  });
}
