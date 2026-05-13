import type { SystemStatus } from "@/lib/app-api/schemas";
import type { OperationalStatus } from "@/components/status";

export type SystemHealth = {
  /** Top-level operational status for the dashboard pill. */
  status: OperationalStatus;
  /** Short human label shown in the pill. */
  label: string;
  /** Subsystem reasons that downgraded the status — empty when healthy. */
  reasons: string[];
};

/**
 * Pure summary of `/app/system-status` into a single dashboard health verdict:
 *   - `error`   when `db.ok === false`.
 *   - `review`  when DB is up but a subsystem is missing/misconfigured:
 *               · `intelWorker.mode === "worker"` with neither binding nor URL routed.
 *               · `staleSweep.missingReason` is `never_run` or `db_error`.
 *   - `healthy` otherwise.
 *
 * Returns the reasons that triggered a non-healthy verdict so the UI can list them.
 * Deliberately defensive: only reads documented fields; never inspects `sources` row
 * contents.
 */
export function summarizeSystemStatus(data: SystemStatus): SystemHealth {
  if (!data.db.ok) {
    return {
      status: "error",
      label: "Database unavailable",
      reasons: ["db_error"],
    };
  }

  const reasons: string[] = [];

  const intel = data.intelWorker;
  if (intel.mode === "worker" && !intel.binding && !intel.url) {
    reasons.push("intel_worker_unrouted");
  }

  const sweep = data.staleSweep;
  if (sweep.lastRunAt === null) {
    if (sweep.missingReason === "never_run") reasons.push("stale_sweep_never_run");
    else if (sweep.missingReason === "db_error") reasons.push("stale_sweep_db_error");
  }

  if (reasons.length > 0) {
    return { status: "review", label: "Degraded", reasons };
  }

  return { status: "healthy", label: "Operational", reasons: [] };
}
