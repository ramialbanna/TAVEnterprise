# /mmr-lab Manheim Redesign Implementation Plan (Issue #44)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **REVISION R1 (2026-05-17) — READ FIRST.** Scope changed; see spec "REVISION R1".
> Interim catalog is WITHDRAWN. Net plan now:
> - T1 ✅ done. T2 (catalog) → **REVERTED: delete `interim-catalog.ts` + test.**
>   T3 ✅ (`MmrMoney/MmrRange`) unchanged & kept.
> - T4 → **rewritten:** `search-panel.tsx` renders VIN row + Year/Make/Model/Style
>   selectors **visible but DISABLED**, no options, no catalog import, with a clear
>   "live catalog not connected" message. No cascade, no `onIdentityChange`.
> - T5 (result band), T6 (data sections) — unchanged (honest `--`).
> - T7 (compose) — page = SearchPanel + ResultBand + DataSections; wire VIN via
>   `postMmrVin`; "live catalog not connected" note; NO interim-catalog import; remove
>   dummy prefill. No identity title from Y/M/M/S (selectors inert).
> - T8 (e2e) — empty state + disabled-selectors state + VIN mocked path; screenshots =
>   empty + disabled-state ONLY (drop the selected-YMM screenshot).
> - T9 — follow-up issue **already created (#45) + linked from #44**; do final verify +
>   guardrail greps (incl. zero hardcoded vehicle catalog in `web/`).
> Where any task below references the interim catalog / cascade / identity title, it is
> SUPERSEDED by the above.

**Goal:** Replace `/mmr-lab` with a Manheim-MMR-faithful, honest-data workspace: VIN valuation via the existing proxy, identity-only cascading Year/Make/Model/Style from a bounded labeled interim catalog, no dummy prefill, `--` everywhere there is no real API value.

**Architecture:** Next.js App Router page composed of focused client components under `web/app/(app)/mmr-lab/`. New `_data/interim-catalog.ts` (labeled, bounded). New `_components` for the Manheim zones; reuse `@/components/data-state`, `@/lib/format`, shadcn/ui primitives, `@tanstack/react-query`. VIN is the ONLY valuation path: browser → same-origin `/api/app/mmr/vin` → Worker (unchanged). Y/M/M/S sets the title only and fires no request.

**Tech Stack:** TypeScript, Next.js, shadcn/ui + Tailwind, vitest + React Testing Library, Playwright, pnpm. Repo: `/Users/ramialbanna/Claude/tav-aip`, branch `feat/issue-44-mmr-lab-redesign` (already created off `origin/main`).

**Spec:** `docs/superpowers/specs/2026-05-17-mmr-lab-redesign-design.md` — read it; this plan implements it exactly. The pre-existing uncommitted `AGENTS.md`/scaffolding (`.agents/`, `.claude-flow/`, `.codex/`, `.swarm/`, `#`, `.claude/settings.json`, `web/docs/ingest-screenshots/ingest-list.png`) are NOT ours — never stage or commit them. Stage only the explicit files each task names.

**Working dir:** all commands run from `/Users/ramialbanna/Claude/tav-aip`. Web app lives in `web/`; web commands run from `web/` (`cd web && pnpm ...`). The shell cwd resets between tool calls — always `cd /Users/ramialbanna/Claude/tav-aip` (or `.../tav-aip/web`) at the start of each command.

---

### Task 1: Read current implementation (no code change)

Before any edit, the implementer MUST read these to match existing patterns (props, tokens, conventions). This task produces a short written notes block, no commit.

- [ ] **Step 1: Read the current mmr-lab + dependencies**

Read fully: `web/app/(app)/mmr-lab/page.tsx`, `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx`, `web/app/(app)/mmr-lab/_components/lookup-form.tsx`, `web/app/(app)/mmr-lab/_components/result-panel.tsx`, `web/app/(app)/mmr-lab/_components/historical-comparison.tsx`, `web/lib/app-api/client.ts`, `web/lib/app-api/schemas.ts`, `web/components/data-state/*`, `web/lib/format.ts`, the shadcn primitives in `web/components/ui/` (`button`, `input`, `label`, `card`, `badge`, `select` if present — note if there is NO `select` primitive), `web/app/(app)/mmr-lab/_components/lookup-form.test.tsx`, `web/app/(app)/mmr-lab/_components/result-panel.test.tsx`, `web/app/(app)/mmr-lab/_components/historical-comparison.test.tsx`, `web/e2e/mmr-lab.spec.ts`, `web/playwright.config.ts`, `web/package.json` (scripts), `web/app/api/app/[...path]/route.ts`.

- [ ] **Step 2: Record exact contracts**

Write a short notes block (in the task report, not a file) capturing: exact `postMmrVin` signature + return type; `MmrVinOkSchema`/`MmrVinUnavailableSchema` field names; `data-state` component names + props; `formatMoney`/`formatNumber` signatures; whether a shadcn `select` primitive exists (if not, Task 4 uses native `<select>` styled with Tailwind to match); exact current e2e selectors; `playwright.config.ts` shape (does it set `screenshot`/`outputDir`?). No commit.

---

### Task 2: Interim catalog data module

**Files:**
- Create: `web/app/(app)/mmr-lab/_data/interim-catalog.ts`
- Create: `web/app/(app)/mmr-lab/_data/interim-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/app/(app)/mmr-lab/_data/interim-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INTERIM_CATALOG_DISCLAIMER,
  getYears,
  getMakes,
  getModels,
  getStyles,
} from "./interim-catalog";

describe("interim-catalog (bounded validated sample — NOT live Manheim)", () => {
  it("exposes a disclaimer that says it is not the live catalog", () => {
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("not");
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("manheim");
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("vin");
  });

  it("years are exactly 2027..2014 descending", () => {
    expect(getYears()).toEqual([
      2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
    ]);
  });

  it("makes for a year are the validated slice, alphabetical", () => {
    const makes = getMakes(2026);
    expect(makes).toContain("CADILLAC");
    expect(makes).toContain("FORD");
    expect(makes).toContain("SUBARU");
    expect([...makes]).toEqual([...makes].sort());
  });

  it("2026 CADILLAC models include ESCALADE IQ and only validated entries", () => {
    const models = getModels(2026, "CADILLAC");
    expect(models).toContain("ESCALADE IQ");
    expect(models).toContain("XT5 FWD V6");
    expect(models).not.toContain("ESCALADE IQ 2WD"); // not invented
  });

  it("2026 CADILLAC ESCALADE IQ styles are exactly the 4 validated", () => {
    expect(getStyles(2026, "CADILLAC", "ESCALADE IQ")).toEqual([
      "4D SUV LUXURY",
      "4D SUV PREMIUM LUXURY",
      "4D SUV PREMIUM SPORT",
      "4D SUV SPORT",
    ]);
  });

  it("validated extra example paths exist (Ford F250, Subaru BRZ)", () => {
    expect(getModels(2019, "FORD")).toContain("F250 4WD V8 TDSL");
    expect(getStyles(2019, "FORD", "F250 4WD V8 TDSL")).toContain(
      "CREW CAB 6.7L PLATINUM",
    );
    expect(getModels(2016, "SUBARU")).toContain("BRZ");
    expect(getStyles(2016, "SUBARU", "BRZ")).toContain("2D COUPE LIMITED");
  });

  it("unknown / unvalidated combinations return [] (never invented)", () => {
    expect(getMakes(2027)).toEqual([]); // no validated makes captured for 2027
    expect(getModels(2026, "FERRARI")).toEqual([]);
    expect(getStyles(2026, "CADILLAC", "LYRIQ 2WD")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- interim-catalog`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the catalog module**

Create `web/app/(app)/mmr-lab/_data/interim-catalog.ts`:

```ts
// INTERIM CATALOG — limited validated sample, NOT the live Manheim catalog.
//
// Source: Issue #44 + the 2026-05-17 Manheim MMR screenshots ONLY. Every
// value below was directly observed; nothing is inferred or invented. This
// exists solely so the Manheim-style Year/Make/Model/Style row can render
// and cascade for demonstrable/validated cases. Selecting a Y/M/M/S here
// forms a vehicle title ONLY — it triggers no valuation and calls no API.
// Use a VIN for an actual value. Tracked for removal by the follow-up
// issue (live metadata + browser-safe YMM valuation endpoint).

export const INTERIM_CATALOG_DISCLAIMER =
  "Year/Make/Model/Style is a limited validated sample, not the live Manheim catalog. YMM valuation is not available — enter a VIN for a value.";

const YEARS = [
  2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
] as const;

// Only Year+Make combos with screenshot/issue-validated children are keyed.
type ModelMap = Record<string, string[]>; // model -> styles
type MakeMap = Record<string, ModelMap>; // make -> models
const CATALOG: Record<number, MakeMap> = {
  2026: {
    CADILLAC: {
      "ESCALADE 4WD": [],
      "ESCALADE AWD": [],
      "ESCALADE ESV 2WD": [],
      "ESCALADE ESV 4WD": [],
      "ESCALADE ESV AWD": [],
      "ESCALADE IQ": [
        "4D SUV LUXURY",
        "4D SUV PREMIUM LUXURY",
        "4D SUV PREMIUM SPORT",
        "4D SUV SPORT",
      ],
      "ESCALADE IQL": [],
      "LYRIQ 2WD": [],
      "LYRIQ AWD": [],
      OPTIQ: [],
      VISTIQ: [],
      "XT5 AWD 4C": [],
      "XT5 AWD V6": [],
      "XT5 FWD 4C": [],
      "XT5 FWD V6": [],
    },
  },
  2019: {
    FORD: { "F250 4WD V8 TDSL": ["CREW CAB 6.7L PLATINUM"] },
  },
  2016: {
    SUBARU: { BRZ: ["2D COUPE LIMITED"] },
  },
};

export function getYears(): number[] {
  return [...YEARS];
}

export function getMakes(year: number): string[] {
  return Object.keys(CATALOG[year] ?? {}).sort();
}

export function getModels(year: number, make: string): string[] {
  return Object.keys(CATALOG[year]?.[make] ?? {});
}

export function getStyles(year: number, make: string, model: string): string[] {
  return [...(CATALOG[year]?.[make]?.[model] ?? [])];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- interim-catalog`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/_data/interim-catalog.ts web/app/\(app\)/mmr-lab/_data/interim-catalog.test.ts docs/superpowers/specs/2026-05-17-mmr-lab-redesign-design.md docs/superpowers/plans/2026-05-17-mmr-lab-redesign.md
git commit -m "feat(mmr-lab): bounded validated interim Y/M/M/S catalog (#44)"
```

---

### Task 3: Honest value primitives (`MmrValue`, dash constant)

A single source of truth for the `--` empty token + a money/range display that renders `--` for null. Keeps every zone honest by construction.

**Files:**
- Create: `web/app/(app)/mmr-lab/_components/mmr-value.tsx`
- Create: `web/app/(app)/mmr-lab/_components/mmr-value.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DASH, MmrMoney, MmrRange } from "./mmr-value";

describe("MmrMoney / MmrRange — honest empty", () => {
  it("DASH is the two-hyphen token", () => {
    expect(DASH).toBe("--");
  });
  it("renders -- when value is null/undefined", () => {
    render(<MmrMoney value={null} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });
  it("formats a number as USD", () => {
    render(<MmrMoney value={48600} />);
    expect(screen.getByText("$48,600")).toBeInTheDocument();
  });
  it("range renders -- when either bound missing", () => {
    render(<MmrRange low={null} high={51600} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });
  it("range formats both bounds", () => {
    render(<MmrRange low={45800} high={51600} />);
    expect(screen.getByText("$45,800 - $51,600")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- mmr-value`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `web/app/(app)/mmr-lab/_components/mmr-value.tsx`. Use the repo's `formatMoney` from `@/lib/format` (confirmed in Task 1; if its name differs, use the real one — do not invent). Implementation:

```tsx
import { formatMoney } from "@/lib/format";

export const DASH = "--";

export function MmrMoney({ value }: { value: number | null | undefined }) {
  return <span>{typeof value === "number" ? formatMoney(value) : DASH}</span>;
}

export function MmrRange({
  low,
  high,
}: {
  low: number | null | undefined;
  high: number | null | undefined;
}) {
  if (typeof low !== "number" || typeof high !== "number") {
    return <span>{DASH}</span>;
  }
  return (
    <span>
      {formatMoney(low)} - {formatMoney(high)}
    </span>
  );
}
```

If `formatMoney(48600)` does not produce exactly `$48,600` (e.g. it adds `.00`), adjust the test's expected strings to the real output in Step 1 BEFORE implementing — match the existing helper, do not reformat money bespoke.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- mmr-value`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/_components/mmr-value.tsx web/app/\(app\)/mmr-lab/_components/mmr-value.test.tsx
git commit -m "feat(mmr-lab): honest MmrMoney/MmrRange primitives (#44)"
```

---

### Task 4: Search panel — VIN row + cascading Year/Make/Model/Style

**Files:**
- Create: `web/app/(app)/mmr-lab/_components/search-panel.tsx`
- Create: `web/app/(app)/mmr-lab/_components/search-panel.test.tsx`

Contract: `SearchPanel` props `{ onVinSubmit: (vin: string) => void; onIdentityChange: (id: { year?: number; make?: string; model?: string; style?: string }) => void; vinPending: boolean }`. It owns VIN input + the 4 selects. VIN submit fires `onVinSubmit` only when VIN length is 11–17 (matches `MmrVinRequest` bounds from Task 1). Selects use the catalog; cascade: Make disabled until Year; Model until Make; Style until Model. Changing a parent clears all descendants. Selecting any level calls `onIdentityChange` with the current partial identity. **No network call, ever, from this component.** Use shadcn `select` if it exists (from Task 1), else a Tailwind-styled native `<select>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./search-panel";

describe("SearchPanel", () => {
  it("VIN submit fires only for 11-17 char VIN", () => {
    const onVinSubmit = vi.fn();
    render(
      <SearchPanel onVinSubmit={onVinSubmit} onIdentityChange={vi.fn()} vinPending={false} />,
    );
    const vin = screen.getByPlaceholderText(/enter vin/i);
    fireEvent.change(vin, { target: { value: "SHORT" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).not.toHaveBeenCalled();
    fireEvent.change(vin, { target: { value: "1FT7W2BT4KED81759" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).toHaveBeenCalledWith("1FT7W2BT4KED81759");
  });

  it("Make is disabled until Year, Model until Make, Style until Model", () => {
    render(
      <SearchPanel onVinSubmit={vi.fn()} onIdentityChange={vi.fn()} vinPending={false} />,
    );
    expect(screen.getByLabelText(/make/i)).toBeDisabled();
    expect(screen.getByLabelText(/model/i)).toBeDisabled();
    expect(screen.getByLabelText(/style/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    expect(screen.getByLabelText(/make/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/model/i)).toBeDisabled();
  });

  it("full Y/M/M/S selection emits identity and fires NO network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onIdentityChange = vi.fn();
    render(
      <SearchPanel onVinSubmit={vi.fn()} onIdentityChange={onIdentityChange} vinPending={false} />,
    );
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "CADILLAC" } });
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "ESCALADE IQ" } });
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV SPORT" } });
    expect(onIdentityChange).toHaveBeenLastCalledWith({
      year: 2026,
      make: "CADILLAC",
      model: "ESCALADE IQ",
      style: "4D SUV SPORT",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("changing Year clears make/model/style", () => {
    const onIdentityChange = vi.fn();
    render(
      <SearchPanel onVinSubmit={vi.fn()} onIdentityChange={onIdentityChange} vinPending={false} />,
    );
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "CADILLAC" } });
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2019" } });
    expect(onIdentityChange).toHaveBeenLastCalledWith({ year: 2019 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- search-panel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `search-panel.tsx`**

Build per the contract above using `getYears/getMakes/getModels/getStyles` from `../_data/interim-catalog`, shadcn `Input`/`Button` (and `Select` if present, else native `<select>` with `aria-label` = "Year"/"Make"/"Model"/"Style" so the tests' `getByLabelText` works — labels are REQUIRED for a11y + tests). Blue `MMR` bar + gray search panel styling using the repo's Tailwind tokens observed in Task 1. State: `year/make/model/style` local; on each change recompute downstream option lists and clear downstream selections; call `onIdentityChange` with only the set fields. VIN: controlled input + button labeled "search"; submit guarded by `vin.trim().length` in `[11,17]`. **Import nothing from `@/lib/app-api` here. No `fetch`.** Show the gold/active vs gray search button by VIN presence; show `×` clear when VIN non-empty.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- search-panel`
Expected: PASS (all 4 cases, incl. the no-`fetch` assertion).

- [ ] **Step 5: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/_components/search-panel.tsx web/app/\(app\)/mmr-lab/_components/search-panel.test.tsx
git commit -m "feat(mmr-lab): Manheim VIN row + cascading Y/M/M/S (no network) (#44)"
```

---

### Task 5: Result band — Base MMR / disabled Adjustments / navy panel (honest `--`)

**Files:**
- Create: `web/app/(app)/mmr-lab/_components/result-band.tsx`
- Replace: `web/app/(app)/mmr-lab/_components/result-panel.tsx` (becomes a thin re-export of `result-band` OR is deleted and references updated — implementer chooses the lower-churn path after Task 1; update `result-panel.test.tsx` accordingly)
- Modify: `web/app/(app)/mmr-lab/_components/result-panel.test.tsx`

Contract: `ResultBand` props `{ baseMmr: number | null; confidence?: "high"|"medium"|"low"|null; method?: string|null; unavailableReason?: string|null }`. Renders the three zones. Base MMR = `<MmrMoney value={baseMmr} />`; Avg Odometer/Condition/EV Battery = `--` (lean envelope has none — hardcode `DASH`, not faked). Center "MMR Adjustments" card: all controls (`Enter ODO (mi)`, `Region`, `Grade**`, `Exterior Color`, `Build Options?`, Express toggle) rendered **disabled** (`disabled` attribute) and visibly present, plus the inert `CLEAR` and the footer rounding/AutoGrade note. Right navy panel: `MMR Range`, `Adjusted MMR`, `Estimated Retail Value` (+ "Based on Cox Automotive Retail Transactions"), `Typical Range` — all `--` (only Base MMR can ever have a value). If `unavailableReason` set, render the existing `UnavailableState` (reuse the current reason→copy mapping found in Task 1) in place of the Base MMR value; if it's an error, `ErrorState`.

- [ ] **Step 1: Write the failing test** — replace the body of `result-panel.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultBand } from "./result-band";

describe("ResultBand — honest, no fabrication", () => {
  it("empty: Base MMR and every right-panel value render --", () => {
    render(<ResultBand baseMmr={null} />);
    // Base MMR + Avg rows + MMR Range + Adjusted MMR + Est Retail + Typical Range
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });
  it("VIN value populates ONLY Base MMR; other zones stay --", () => {
    render(<ResultBand baseMmr={48600} confidence="high" method="vin" />);
    expect(screen.getByText("$48,600")).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    // Adjusted MMR / MMR Range / Estimated Retail / Typical Range still --
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });
  it("all MMR Adjustments controls are disabled", () => {
    render(<ResultBand baseMmr={48600} />);
    for (const el of screen.getAllByRole("textbox")) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole("combobox")) expect(el).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- result-panel`
Expected: FAIL — `./result-band` not found.

- [ ] **Step 3: Implement `result-band.tsx`** per the contract using `MmrMoney`/`MmrRange`/`DASH` from `./mmr-value`, the navy/gray Tailwind tokens from Task 1, shadcn `Card`/`Badge`, and the existing `UnavailableState`/`ErrorState`. Every Adjustments control gets `disabled`. No value is computed/derived — only `baseMmr` is ever a number. If `result-panel.tsx` is kept as a shim, make it `export { ResultBand as ResultPanel } from "./result-band";` only if other code imports `ResultPanel`; otherwise delete `result-panel.tsx` and fix imports (verify with grep).

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- result-panel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/_components/result-band.tsx web/app/\(app\)/mmr-lab/_components/result-panel.tsx web/app/\(app\)/mmr-lab/_components/result-panel.test.tsx
git commit -m "feat(mmr-lab): honest 3-zone result band, disabled adjustments (#44)"
```

---

### Task 6: Honest sections — Similar / Transactions / Historical / Projected

**Files:**
- Create: `web/app/(app)/mmr-lab/_components/data-sections.tsx`
- Replace/rework: `web/app/(app)/mmr-lab/_components/historical-comparison.tsx` (the new `data-sections.tsx` supersedes it; keep a shim or delete + fix imports like Task 5)
- Modify: `web/app/(app)/mmr-lab/_components/historical-comparison.test.tsx`

Contract: `DataSections` takes no live data (no backend supplies these). Renders the Manheim section frames: `Similar vehicles` (header + empty), `Transactions` (header + the exact column set `Date | Price | Odo (mi) | Grade | EVBH | Eng/T | Ext Color | Type | Region | Auction` + a centered `--` empty body), `Historical Average` (`Past 30 Days`/`6 Months Ago`/`Last Year` each `--`) and `Projected Average` (`Next Month` `--`). All bodies honest-empty; no fabricated rows/numbers.

- [ ] **Step 1: Write the failing test** — replace `historical-comparison.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataSections } from "./data-sections";

describe("DataSections — frames render, bodies honest-empty", () => {
  it("renders the four section headers", () => {
    render(<DataSections />);
    expect(screen.getByText(/similar vehicles/i)).toBeInTheDocument();
    expect(screen.getByText(/transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/historical average/i)).toBeInTheDocument();
    expect(screen.getByText(/projected average/i)).toBeInTheDocument();
  });
  it("transactions has the Manheim columns and no data rows", () => {
    render(<DataSections />);
    for (const c of ["Date", "Price", "Odo (mi)", "Grade", "EVBH", "Eng/T", "Ext Color", "Type", "Region", "Auction"]) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
    expect(screen.queryByRole("row", { name: /\$/ })).not.toBeInTheDocument();
  });
  it("historical/projected slots all render --", () => {
    render(<DataSections />);
    for (const s of ["Past 30 Days", "6 Months Ago", "Last Year", "Next Month"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- historical-comparison`
Expected: FAIL — `./data-sections` not found.

- [ ] **Step 3: Implement `data-sections.tsx`** per contract (static frames, `DASH` for every slot, shadcn `Card`/table primitives, Tailwind tokens from Task 1). Remove the old client-side aggregate logic from `historical-comparison.tsx` (it queried `/app/historical-sales` by client-only YMM — out of scope for this redesign; the new design has no historical data source, so it must be honest-empty, not a live query). Shim or delete `historical-comparison.tsx` + fix imports (grep).

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- historical-comparison`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/_components/data-sections.tsx web/app/\(app\)/mmr-lab/_components/historical-comparison.tsx web/app/\(app\)/mmr-lab/_components/historical-comparison.test.tsx
git commit -m "feat(mmr-lab): honest-empty similar/transactions/historical sections (#44)"
```

---

### Task 7: Compose the page — wire VIN path, identity title, honest banner, remove dummy prefill

**Files:**
- Modify: `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx`
- Modify: `web/app/(app)/mmr-lab/page.tsx`
- Delete: `web/app/(app)/mmr-lab/_components/lookup-form.tsx` + `lookup-form.test.tsx` (its VIN/YMM/prefill role is replaced by `SearchPanel`; confirm no other importer via grep, else shim)
- Modify: `web/app/(app)/mmr-lab/_components/result-panel.test.tsx` already done (Task 5)

Contract: `MmrLabClient` owns state: `vinResult` (from `postMmrVin`), `identity` (from `SearchPanel.onIdentityChange`). Layout = `<SearchPanel ... />` then identity row (title `${year} ${make} ${model} ${style}` when all 4 present, else when a VIN result resolves a vehicle the title stays generic — lean envelope has no identity, so VIN result shows no YMM title, only the VIN echoed) then `<ResultBand .../>` then `<DataSections />`. When an `identity` has any field set, render the persistent honest banner using `INTERIM_CATALOG_DISCLAIMER`. VIN submit → `postMmrVin({ vin })` via existing `@/lib/app-api/client` + react-query (match the existing call/error pattern from Task 1); map `data.mmrValue`→`baseMmr`, `confidence`/`method` through, `missingReason`→`unavailableReason`. **The only network call in the whole page is `postMmrVin`. Selecting Y/M/M/S triggers nothing.** Remove ALL example/prefill (`EXAMPLE_*`, `fillExample`, the `Fill example` button) — gone, not hidden.

- [ ] **Step 1: Write the failing test (client-level)** — create `web/app/(app)/mmr-lab/_components/mmr-lab-client.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { MmrLabClient } from "./mmr-lab-client";

afterEach(() => vi.restoreAllMocks());

describe("MmrLabClient — honest end to end", () => {
  it("empty initial state: no title, Base MMR --, no Fill example control", () => {
    render(<MmrLabClient />);
    expect(screen.queryByRole("button", { name: /fill example/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });

  it("selecting full Y/M/M/S shows the title + honest banner, NO fetch, Base MMR stays --", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<MmrLabClient />);
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "CADILLAC" } });
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "ESCALADE IQ" } });
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV SPORT" } });
    expect(screen.getByText(/2026 CADILLAC ESCALADE IQ 4D SUV SPORT/i)).toBeInTheDocument();
    expect(screen.getByText(/limited validated sample/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument(); // no fabricated money
  });

  it("VIN path calls postMmrVin once and populates ONLY Base MMR", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, data: { mmrValue: 48600, confidence: "high", method: "vin" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText("$48,600")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/app/mmr/vin");
  });
});
```

(If the repo wraps client API calls in a `QueryClientProvider`, wrap `<MmrLabClient />` in the repo's test query wrapper — use the existing test util discovered in Task 1; do not invent one.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- mmr-lab-client`
Expected: FAIL — old client still has Fill example / different shape.

- [ ] **Step 3: Implement** the new `mmr-lab-client.tsx` per contract; trim `page.tsx` heading copy to match (server shell stays; just renders `<MmrLabClient />`). Delete `lookup-form.tsx`/`lookup-form.test.tsx` after grep confirms no other importer (else convert to shim). Keep the existing react-query/client-api usage pattern exactly.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test -- mmr-lab-client`
Expected: PASS (all 3 cases incl. no-fetch on YMM, single fetch on VIN).

- [ ] **Step 5: Typecheck + lint + full unit suite**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. Fix any fallout (orphaned imports from deleted files).

- [ ] **Step 6: Commit**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/app/\(app\)/mmr-lab/
git commit -m "feat(mmr-lab): compose honest page, wire VIN, remove dummy prefill (#44)"
```

---

### Task 8: E2E + screenshots

**Files:**
- Modify: `web/e2e/mmr-lab.spec.ts`
- Modify: `web/playwright.config.ts` (only if it lacks screenshot/output config — add `screenshot: "only-on-failure"` is NOT enough; we need explicit `page.screenshot` calls writing to a committed path, e.g. `web/e2e/__screenshots__/`)

- [ ] **Step 1: Rewrite the e2e spec**

Replace `web/e2e/mmr-lab.spec.ts` so it: (a) removes the old `Fill example` test and old-layout asserts; (b) asserts empty `/mmr-lab` shows `--` for Base MMR and the right-panel values and NO `Fill example`; (c) selects 2026 → CADILLAC → ESCALADE IQ → 4D SUV SPORT, asserts the title `2026 CADILLAC ESCALADE IQ 4D SUV SPORT` + the honest banner text appear, asserts NO request to `**/api/app/mmr/vin` fired (use `page.on("request", ...)` to fail if any `/api/app/` request occurs during YMM selection), and asserts no `$` money text appears; (d) VIN path with `await page.route("**/api/app/mmr/vin", r => r.fulfill({ status:200, body: JSON.stringify({ ok:true, data:{ mmrValue:48600, confidence:"high", method:"vin" } }) }))` → asserts `$48,600` shows and other zones `--`; (e) captures screenshots:
  - empty: `await page.screenshot({ path: "e2e/__screenshots__/mmr-lab-empty.png", fullPage: true })`
  - YMM path: after selecting the Escalade IQ path, `await page.screenshot({ path: "e2e/__screenshots__/mmr-lab-ymm-escalade-iq.png", fullPage: true })`

Use the repo's existing e2e auth/setup pattern (from Task 1's read of the current spec — reuse its `test.use`/storageState/login helper; do not invent auth).

- [ ] **Step 2: Run e2e**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm test:e2e -- mmr-lab`
Expected: PASS; the two PNGs exist under `web/e2e/__screenshots__/`.

- [ ] **Step 3: Commit (including the screenshots)**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git add web/e2e/mmr-lab.spec.ts web/playwright.config.ts web/e2e/__screenshots__/mmr-lab-empty.png web/e2e/__screenshots__/mmr-lab-ymm-escalade-iq.png
git commit -m "test(mmr-lab): e2e honest-state + YMM-no-call + screenshots (#44)"
```

---

### Task 9: Follow-up issue + final verification

- [ ] **Step 1: Create the follow-up GitHub issue (before closing #44)**

```bash
cd /Users/ramialbanna/Claude/tav-aip
gh issue create --title "MMR Lab v-next: live YMM metadata + browser-safe YMM valuation + adjustment recompute; remove interim catalog" --body "$(cat <<'EOF'
Follow-up to #44 (interim shell shipped).

Scope:
1. Live metadata source for full Year/Make/Model/Style — replace and DELETE `web/app/(app)/mmr-lab/_data/interim-catalog.ts` and its "limited validated sample" labeling.
2. Browser-safe YMM valuation endpoint exposed via `/app/*`. It MUST require a valid body/style AND mileage/odometer before returning a value; the UI must gate the YMM lookup on both (Year/Make/Model/Style alone is identity only and must never imply valuation readiness).
3. Adjustment recompute endpoint (ODO / Region / Grade / Exterior Color / Build Options) to power the MMR Adjustments controls, which #44 ships disabled.
4. Acceptance: interim catalog removed; adjustments enabled only when backed by a real recompute; YMM lookup enabled only when body/style + mileage are valid.

Security boundary unchanged: no browser → Supabase/Cox/Manheim; secrets server-only.
Refs #44.
EOF
)" 2>&1 | tail -2
```
Record the created issue URL/number; then add a comment on #44 linking it: `gh issue comment 44 --body "Follow-up for live metadata + browser-safe YMM valuation + adjustment recompute: <url>"`.

- [ ] **Step 2: Final verification**

Run: `cd /Users/ramialbanna/Claude/tav-aip/web && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e -- mmr-lab`
Expected: all green.

Run guardrail greps from repo root:
```bash
cd /Users/ramialbanna/Claude/tav-aip
grep -rn "supabase\|cox\|manheim" web/app/\(app\)/mmr-lab web/lib/app-api/client.ts | grep -vi "test\|comment\|//\|disclaimer" || echo "(no browser→vendor refs)"
grep -rn "mmr/year\|/makes\|/models\|/styles\|/years" web/app/\(app\)/mmr-lab || echo "(no YMM endpoint calls)"
grep -rn "fillExample\|Fill example\|EXAMPLE_" web/app/\(app\)/mmr-lab || echo "(no dummy prefill)"
```
Expected: the three "(no ...)" lines.

- [ ] **Step 3: Confirm branch state**

```bash
cd /Users/ramialbanna/Claude/tav-aip
git log --oneline origin/main..HEAD
git status --porcelain | grep -vE 'AGENTS.md|^\?\? \.|ingest-list.png|^\?\? #'
```
Expected: the #44 commits listed; the second command empty (only the pre-existing untouched scaffolding remains unstaged — never commit it).

- [ ] **Step 4: Done — report**

Report: commits, screenshot paths, follow-up issue URL, all-green verification output. Do NOT push or open the PR unless the user asks (creating/pushing a PR is a shared-state action — surface it, let the user decide).

---

## Self-Review

**Spec coverage:** blue MMR bar + VIN row + cascade selectors → T4; empty `--` everywhere → T3/T5/T6/T7; VIN via `/api/app/mmr/vin` only, lean→Base-MMR-only → T5/T7; Y/M/M/S identity-only, no valuation, no `/api/app/mmr/vin`, no other endpoint → T2/T4/T7/T8 (explicit no-fetch + grep); disabled adjustments shown → T5; bounded labeled interim catalog (exact values) → T2; honest banner → T7/T8; `Style` label not `Trim` → T4; mileage explicit → T5 (ODO field present, disabled, `--`); remove dummy prefill → T7 (delete `EXAMPLE_*`/`fillExample`); tests + 2 screenshots → T8; follow-up issue w/ body-style+mileage gating + recompute + catalog removal → T9; guardrails (no browser→Supabase/Cox/Manheim, no v2, no lead scoring, scaffolding untouched) → T9 greps + per-task `git add` of explicit paths only. No gaps.

**Placeholder scan:** code/data/tests given verbatim; the only deferred specifics are "match exact existing primitive/api names" which Task 1 forces the implementer to read first (named files, exact). No TBD/TODO. Money-format assertion has an explicit "adjust to real `formatMoney` output" instruction so it can't be a wrong literal.

**Type consistency:** `SearchPanel` props (`onVinSubmit`/`onIdentityChange`/`vinPending`) consistent T4↔T7; identity object `{year,make,model,style}` consistent T4↔T7; `ResultBand` props consistent T5↔T7; `MmrMoney/MmrRange/DASH` consistent T3↔T5; catalog fn names `getYears/getMakes/getModels/getStyles`+`INTERIM_CATALOG_DISCLAIMER` consistent T2↔T4↔T7. Test command `pnpm test -- <name>` form used throughout (verify against Task 1's read of `web/package.json`; if the runner needs `pnpm vitest run <path>` instead, the implementer adjusts the command — noted here so it's not a silent mismatch).

No gaps; ready for execution.
