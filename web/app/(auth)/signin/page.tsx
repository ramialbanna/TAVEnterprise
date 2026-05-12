import type { Metadata } from "next";
import { signIn } from "@/lib/auth";
import { resolveSignInParams } from "./params";

export const metadata: Metadata = {
  title: "Sign in — TAV Acquisition Intelligence",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { callbackUrl, accessDenied } = resolveSignInParams(await searchParams);

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-sunken px-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">Texas Auto Value</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">TAV Acquisition Intelligence</h1>
        </div>

        {accessDenied && (
          <div
            role="alert"
            className="mb-5 rounded-md border border-status-error/40 bg-status-error-bg px-3 py-2 text-sm text-status-error"
          >
            Access denied. Use a <span className="font-medium">texasautovalue.com</span> Google account.
          </div>
        )}

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0">
              <path
                fill="#EA4335"
                d="M12 10.2v3.96h5.52c-.24 1.44-1.68 4.2-5.52 4.2-3.36 0-6.06-2.76-6.06-6.18S8.64 5.82 12 5.82c1.92 0 3.18.84 3.9 1.56l2.7-2.58C16.92 3.18 14.7 2.16 12 2.16 6.84 2.16 2.7 6.3 2.7 12s4.14 9.84 9.3 9.84c5.34 0 8.94-3.78 8.94-9.12 0-.6-.06-1.08-.12-1.56H12Z"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-subtle">
          Use your <span className="font-medium">texasautovalue.com</span> Google account.
        </p>

        <p className="mt-5 border-t border-border pt-4 text-center text-[11px] leading-relaxed text-text-subtle">
          Internal tool — access is restricted to TAV staff. Application data is protected, and
          credentials and secrets are never displayed in this dashboard.
        </p>
      </div>
    </main>
  );
}
