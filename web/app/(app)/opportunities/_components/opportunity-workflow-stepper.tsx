"use client";

import { Check } from "lucide-react";

import { resolveWorkflowStep, type WorkflowStepId, type WorkflowStepInput } from "@/lib/opportunities/workflow-steps";
import { cn } from "@/lib/utils";

/** Buyer-facing step labels per workflow doc §5.4 (Found → Working → Contacted → Outcome). */
const DETAIL_WORKFLOW_STEPS = [
  { id: "found", label: "Found" },
  { id: "working", label: "Working" },
  { id: "contacted", label: "Contacted" },
  { id: "outcome", label: "Outcome" },
] as const;

type DetailStepId = (typeof DETAIL_WORKFLOW_STEPS)[number]["id"];

function mapToDetailStep(step: WorkflowStepId): DetailStepId {
  if (step === "found" || step === "assigned") return "found";
  if (step === "working") return "working";
  if (step === "contacted") return "contacted";
  return "outcome";
}

function detailStepIndex(step: DetailStepId): number {
  return DETAIL_WORKFLOW_STEPS.findIndex((s) => s.id === step);
}

/** Compact progress strip above full workflow actions. */
export function OpportunityWorkflowStepper({
  opportunity,
}: {
  opportunity: WorkflowStepInput;
}) {
  const internalStep = resolveWorkflowStep(opportunity);
  const current = mapToDetailStep(internalStep);
  const currentIndex = detailStepIndex(current);

  return (
    <section
      className="rounded-lg border border-border bg-muted/20 p-4"
      aria-label="Deal progress"
    >
      <h2 className="mb-3 text-sm font-medium text-foreground">Workflow</h2>
      <ol className="flex flex-wrap gap-2">
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
    </section>
  );
}
