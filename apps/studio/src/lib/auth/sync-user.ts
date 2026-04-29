import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../db";
import type { User } from "../../generated/prisma/client";

/**
 * Lazily sync the Clerk-authenticated user into our DB.
 * Returns null when no Clerk session exists OR when Clerk middleware is not
 * configured (e.g. SITE_PASSWORD-only deploys). Both cases are treated as "no user."
 */
export async function syncCurrentUser(): Promise<User | null> {
  let cu;
  try {
    cu = await currentUser();
  } catch {
    // Clerk middleware not registered (SITE_PASSWORD mode) — operate as anonymous
    return null;
  }
  if (!cu) return null;

  const email = cu.primaryEmailAddress?.emailAddress ?? `${cu.id}@unknown.local`;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ").trim();

  return prisma.user.upsert({
    where: { id: cu.id },
    update: { email, name, imageUrl: cu.imageUrl ?? "" },
    create: { id: cu.id, email, name, imageUrl: cu.imageUrl ?? "" },
  });
}
