export const OPPORTUNITIES_TOUR_STORAGE_KEY = "tav.opportunities.tour.dismissed";

export const OPPORTUNITIES_TOUR_STEPS = [
  {
    title: "Submit a listing",
    body: "Paste a marketplace URL to add a deal to the queue — same flow as the Submit listing nav item.",
  },
  {
    title: "Claim a deal",
    body: "Use I'm working this on a row (hand icon) or in the preview panel to start your 24-hour window.",
  },
  {
    title: "Track progress",
    body: "Open a row for a quick preview, then update status and notes on the full page when you're ready.",
  },
] as const;

export function isOpportunitiesTourDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(OPPORTUNITIES_TOUR_STORAGE_KEY) === "1";
}

export function dismissOpportunitiesTour(): void {
  window.localStorage.setItem(OPPORTUNITIES_TOUR_STORAGE_KEY, "1");
}
