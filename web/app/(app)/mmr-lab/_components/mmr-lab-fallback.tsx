import { Skeleton } from "@/components/ui/skeleton";

/** Shown while `/mmr-lab` hydrates so the previous page is not held on screen. */
export function MmrLabFallback() {
  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4 sm:space-y-6">
      <div className="bg-primary px-4 py-4 sm:px-6">
        <span className="text-lg font-semibold tracking-tight text-primary-foreground">MMR</span>
      </div>
      <div className="space-y-3 bg-surface-sunken px-4 py-4 sm:px-6">
        <p className="sr-only">Loading TAV MMR…</p>
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
