import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-sunken px-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">Texas Auto Value</p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That page doesn&apos;t exist or has moved.</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
