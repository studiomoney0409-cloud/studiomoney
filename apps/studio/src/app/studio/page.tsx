import { redirect } from "next/navigation";
import Dashboard from "./_components/Dashboard";
import { syncCurrentUser } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db";

export default async function StudioPage() {
  // Gate: signed-in users with no workspace are redirected to onboarding.
  // Anonymous users (e.g. SITE_PASSWORD-only deploys) bypass this check.
  const user = await syncCurrentUser();
  if (user) {
    const count = await prisma.workspace.count({ where: { ownerId: user.id } });
    if (count === 0) redirect("/onboarding");
  }

  return <Dashboard />;
}
