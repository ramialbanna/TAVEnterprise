import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Authenticated dashboard shell. The proxy already gates these routes; this re-check is
 * defence in depth and gives us the session for the topbar user menu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/signin");

  const { ENV_LABEL } = serverEnv();

  return (
    <AppShell envLabel={ENV_LABEL} user={session.user ?? null}>
      {children}
    </AppShell>
  );
}
