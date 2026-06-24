"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type CollapsibleBlockProps = {
  title: string;
  description?: string;
  /** Optional content rendered on the right side of the header (e.g. status badge, actions). */
  headerActions?: ReactNode;
  /** Default open state. Defaults to true. */
  defaultOpen?: boolean;
  /** Controlled open state. When provided, the component is controlled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  /** Optional id for aria-labelledby; auto-generated from title if absent. */
  id?: string;
};

export function CollapsibleBlock({
  title,
  description,
  headerActions,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
  id,
}: CollapsibleBlockProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const panelId = id ?? `block-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const headerId = `${panelId}-header`;

  function toggle() {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <section
      id={panelId}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        id={headerId}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={`${panelId}-content`}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-t-lg px-4 py-3 text-left",
          "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              !isOpen && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{title}</span>
            {description ? (
              <span className="text-xs font-normal text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        </span>
        {headerActions ? (
          <span
            className="inline-flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {headerActions}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div
          id={`${panelId}-content`}
          role="region"
          aria-labelledby={headerId}
          className="border-t border-border px-4 py-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
