import { Skeleton } from "@/components/ui/skeleton";

/** First-paint placeholder while a thin RSC page loads Worker data on the client. */
export function QueryPending({ label }: { label: string }) {
  return (
    <div>
      <p className="sr-only">{label}</p>
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    </div>
  );
}
