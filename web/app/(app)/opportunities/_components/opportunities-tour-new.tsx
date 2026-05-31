"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

import {
  dismissOpportunitiesTour,
  isOpportunitiesTourDismissed,
  OPPORTUNITIES_TOUR_STEPS,
} from "@/lib/opportunities/opportunities-tour";
import { Button } from "@/components/ui/button";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot() {
  return isOpportunitiesTourDismissed();
}

function getServerSnapshot() {
  return true;
}

/** Dismissible first-run hints for New mode (submit → claim → track). */
export function OpportunitiesTourNew() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  function handleDismiss() {
    dismissOpportunitiesTour();
    emit();
  }

  return (
    <section
      aria-label="Getting started"
      className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Quick start</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Three steps to run your queue — dismiss when you know the flow.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Dismiss quick start"
          onClick={handleDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {OPPORTUNITIES_TOUR_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-md border border-border/80 bg-card/80 px-3 py-2 text-xs"
          >
            <span className="font-medium text-foreground">
              {index + 1}. {step.title}
            </span>
            <p className="mt-1 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" variant="secondary" onClick={handleDismiss}>
          Got it
        </Button>
      </div>
    </section>
  );
}
