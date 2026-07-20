"use client";

import { Lock, ShieldCheck, UserRoundPlus } from "lucide-react";

import { Alert } from "@/components/ui/alert";

export type ClaimBannerState = {
  tone: "editable" | "unclaimed" | "locked";
  message: string;
} | null;

/**
 * Persistent claim/status banner (NEXT_STEPS #58) — explains *why* detail
 * fields are enabled or disabled instead of leaving a wall of disabled-gray
 * inputs with no visible reason.
 */
export function resolveClaimBannerState(input: {
  canMutate: boolean;
  canClaim: boolean;
  collision: string | null;
}): ClaimBannerState {
  if (input.collision) {
    return {
      tone: "locked",
      message: `${input.collision} Fields are locked until they finish or the claim window expires.`,
    };
  }
  if (input.canMutate) {
    return {
      tone: "editable",
      message: "You're working this deal — fields below are editable.",
    };
  }
  if (input.canClaim) {
    return {
      tone: "unclaimed",
      message: "This lead is unclaimed — claim it above to edit fields.",
    };
  }
  return {
    tone: "locked",
    message: "You don't have permission to edit this lead.",
  };
}

const TONE_CONFIG = {
  editable: { variant: "healthy" as const, Icon: ShieldCheck },
  unclaimed: { variant: "amber" as const, Icon: UserRoundPlus },
  locked: { variant: "destructive" as const, Icon: Lock },
};

export function OpportunityClaimBanner({ state }: { state: ClaimBannerState }) {
  if (!state) return null;
  const { variant, Icon } = TONE_CONFIG[state.tone];
  return (
    <Alert variant={variant}>
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden />
        {state.message}
      </span>
    </Alert>
  );
}
