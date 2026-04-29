import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const templates = await prisma.nicheTemplate.findMany({
    orderBy: { niche: "asc" },
    select: {
      niche: true,
      displayName: true,
      description: true,
      iconEmoji: true,
      defaultKeywords: true,
      defaultSources: true,
      redditSubs: true,
      categories: true,
    },
  });
  return NextResponse.json(templates);
}
