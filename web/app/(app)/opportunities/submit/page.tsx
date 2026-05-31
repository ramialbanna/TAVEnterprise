import { ManualSubmitPanel } from "../_components/manual-submit-dialog";

/**
 * `/opportunities/submit` — dedicated submit surface for New-mode nav.
 * Classic users can still submit via the dialog on `/opportunities`.
 */
export default function SubmitListingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Submit a listing</h1>
        <p className="text-sm text-muted-foreground">
          Paste a marketplace link and optional vehicle facts. The listing enters the same queue
          as automated leads.
        </p>
      </header>
      <ManualSubmitPanel />
    </div>
  );
}
