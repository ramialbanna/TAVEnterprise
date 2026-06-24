"use client";

import { Check } from "lucide-react";

import {
  resolveWorkflowStep,
  type WorkflowStepId,
  type WorkflowStepInput,
} from "@/lib/opportunities/workflow-steps";
import { cn } from "@/lib/utils";

/**
 * Single buyer-facing workflow strip per opportunity-detail-redesign.md §2.
 * Found → Working → Contacted → Landed. Passed is a secondary action, not a
 * step; when status is `passed` the stepper stays at the last reached step
 * (TBD behavior per doc — no spec change yet).
 */
const DETAIL_WORKFLOW_STEPS = [
  { id: "found", label: "Found" },
  { id: "working", label: "Working" },
  { id: "contacted", label: "Contacted" },
  { id: "landed", label: "Landed" },
] as const;

type DetailStepId = (typeof DETAIL_WORKFLOW_STEPS)[number]["id"];

function mapToDetailStep(step: WorkflowStepId): DetailStepId {
  if (step === "found" || step === "assigned") return "found";
  if (step === "working") return "working";
  if (step === "contacted") return "contacted";
  // `outcome` covers purchased / bought / passed. Only purchased/bought map to
  // Landed; passed stays at Contacted until stepper-after-pass is specced.
  return "landed";
}

function detailStepIndex(step: DetailStepId): number {
  return DETAIL_WORKFLOW_STEPS.findIndex((s) => s.id === step);
}

/** Resolve the detail step, treating `passed` as Contacted (not Landed). */
function resolveDetailStep(opportunity: WorkflowStepInput): DetailStepId {
  const status = opportunity.status ?? "new";
  if (status === "passed") return "contacted";
  return mapToDetailStep(resolveWorkflowStep(opportunity));
}

export function OpportunityWorkflowStepper({
  opportunity,
}: {
  opportunity: WorkflowStepInput;
}) {
  const current = resolveDetailStep(opportunity);
  const currentIndex = detailStepIndex(current);

  return (
    <ol
      className="flex flex-wrap gap-2"
      aria-label="Deal progress"
    >
      {DETAIL_WORKFLOW_STEPS.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
              complete && "border-primary/30 bg-primary/10 text-primary",
              active && "border-primary bg-primary text-primary-foreground",
              !complete && !active && "border-border text-muted-foreground",
            )}
          >
            {complete ? <Check className="size-3.5" aria-hidden /> : null}
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
