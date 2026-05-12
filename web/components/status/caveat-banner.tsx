"use client";

import { useState, type ReactNode } from "react";
import { Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type CaveatTone = "info" | "caution";

const TONE_CLASS: Record<CaveatTone, string> = {
  info: "border-border bg-surface-sunken text-muted-foreground",
  caution: "border-status-review/40 bg-status-review-bg text-status-review",
};

/**
 * A persistent banner for a standing caveat — e.g. "MMR figures come from the Cox
 * sandbox, not production". `dismissible` is off by default (the sandbox notice must stay
 * visible); when on, the dismiss is in-memory only — it reappears on reload (no
 * persistence in v1).
 */
export function CaveatBanner({
  children,
  title,
  tone = "info",
  dismissible = false,
  className,
}: {
  children: ReactNode;
  title?: string;
  tone?: CaveatTone;
  dismissible?: boolean;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const Icon = tone === "caution" ? TriangleAlert : Info;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <p>{children}</p>
      </div>
      {dismissible ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 rounded-sm p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
