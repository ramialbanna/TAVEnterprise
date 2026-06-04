#!/usr/bin/env python3
"""Walk-forward decay half-life backtest for MaxBuy benchmark views.

Read-only offline analysis on tav.purchase_outcomes export (CSV).
See archive/07-buybox-pre-code/audits/10-decay-rate-validation-plan.md
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

import numpy as np

HALF_LIVES: dict[str, float | None] = {
    "no_decay": None,
    "90d": 90.0,
    "180d": 180.0,
    "365d": 365.0,
    "540d": 540.0,
}

THIN_EFFECTIVE_N = 30.0
TARGET_NET_GROSS = 800
EVAL_WEEKS = 26


@dataclass(frozen=True)
class Sale:
    year: int
    make: str
    model: str
    trim: str
    region: str
    sale_date: date
    sale_price: float
    price_paid: float | None
    gross_profit: float | None
    net_gross: float | None


def parse_date(value: str) -> date:
    return datetime.strptime(value[:10], "%Y-%m-%d").date()


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def load_csv(path: Path) -> list[Sale]:
    rows: list[Sale] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            year_raw = row.get("year")
            if not year_raw:
                continue
            rows.append(
                Sale(
                    year=int(float(year_raw)),
                    make=row["make"],
                    model=row["model"],
                    trim=row["trim"],
                    region=row["region"],
                    sale_date=parse_date(row["sale_date"]),
                    sale_price=float(row["sale_price"]),
                    price_paid=parse_float(row.get("price_paid")),
                    gross_profit=parse_float(row.get("gross_profit")),
                    net_gross=parse_float(row.get("net_gross")),
                )
            )
    rows.sort(key=lambda s: s.sale_date)
    return rows


def extract_mcp_json(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", text, re.DOTALL)
    if not match:
        payload = json.loads(text)
        if isinstance(payload, dict) and "result" in payload:
            inner = payload["result"]
            match = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", inner, re.DOTALL)
    if not match:
        raise ValueError(f"Could not parse MCP JSON export: {path}")
    return json.loads(match.group(1))


def merge_mcp_exports(paths: Iterable[Path], out_csv: Path) -> int:
    fieldnames = [
        "year",
        "make",
        "model",
        "trim",
        "region",
        "sale_date",
        "sale_price",
        "price_paid",
        "gross_profit",
        "net_gross",
        "mmr_value_at_purchase",
        "mileage",
    ]
    count = 0
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for path in paths:
            for row in extract_mcp_json(path):
                writer.writerow({k: row.get(k) for k in fieldnames})
                count += 1
    return count


def week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def decay_weight(age_days: int, half_life: float | None) -> float:
    if half_life is None:
        return 1.0
    if age_days < 0:
        return 0.0
    return 0.5 ** (age_days / half_life)


def segment_keys(sale: Sale) -> tuple[str, str, str]:
    exact = f"{sale.year}|{sale.make}|{sale.model}|{sale.trim}"
    ymm = f"{sale.year}|{sale.make}|{sale.model}"
    mm = f"{sale.make}|{sale.model}"
    return exact, ymm, mm


@dataclass
class BenchmarkStore:
    exact: dict[str, tuple[float, float]]
    ymm: dict[str, tuple[float, float]]
    mm: dict[str, tuple[float, float]]
    global_w: float
    global_price_w: float

    def predict(self, sale: Sale) -> tuple[float, float, str]:
        exact, ymm, mm = segment_keys(sale)
        for key, bucket, label in (
            (exact, self.exact, "exact"),
            (ymm, self.ymm, "ymm"),
            (mm, self.mm, "mm"),
        ):
            w_sum, price_w = bucket.get(key, (0.0, 0.0))
            if w_sum > 0:
                return price_w / w_sum, w_sum, label
        if self.global_w > 0:
            return self.global_price_w / self.global_w, self.global_w, "global"
        return math.nan, 0.0, "none"


def build_benchmarks(train: list[Sale], ref_date: date, half_life: float | None) -> BenchmarkStore:
    exact: dict[str, list[tuple[float, float]]] = defaultdict(list)
    ymm: dict[str, list[tuple[float, float]]] = defaultdict(list)
    mm: dict[str, list[tuple[float, float]]] = defaultdict(list)
    global_w = 0.0
    global_price_w = 0.0

    for sale in train:
        age_days = (ref_date - sale.sale_date).days
        weight = decay_weight(age_days, half_life)
        if weight <= 0:
            continue
        price_w = weight * sale.sale_price
        e, y, m = segment_keys(sale)
        exact[e].append((weight, price_w))
        ymm[y].append((weight, price_w))
        mm[m].append((weight, price_w))
        global_w += weight
        global_price_w += price_w

    def collapse(bucket: dict[str, list[tuple[float, float]]]) -> dict[str, tuple[float, float]]:
        return {k: (sum(w for w, _ in v), sum(pw for _, pw in v)) for k, v in bucket.items()}

    return BenchmarkStore(
        exact=collapse(exact),
        ymm=collapse(ymm),
        mm=collapse(mm),
        global_w=global_w,
        global_price_w=global_price_w,
    )


def gross_positive(sale: Sale) -> bool | None:
    if sale.gross_profit is not None:
        return sale.gross_profit > 0
    if sale.net_gross is not None:
        return sale.net_gross > 0
    if sale.price_paid is not None:
        return sale.sale_price - sale.price_paid > 0
    return None


def predicted_gross_positive(predicted_sale: float, price_paid: float | None) -> bool | None:
    if price_paid is None or math.isnan(predicted_sale):
        return None
    return predicted_sale - price_paid >= TARGET_NET_GROSS


@dataclass
class ArmMetrics:
    abs_errors: list[float]
    gross_pairs: list[tuple[bool, bool]]
    thin_abs_errors: list[float]
    stability_changes: list[float]


def run_backtest(sales: list[Sale]) -> dict[str, dict]:
    if not sales:
        raise ValueError("No sales loaded")

    max_date = sales[-1].sale_date
    eval_start = week_start(max_date) - timedelta(weeks=EVAL_WEEKS - 1)
    eval_weeks = [eval_start + timedelta(weeks=i) for i in range(EVAL_WEEKS)]

    metrics: dict[str, ArmMetrics] = {name: ArmMetrics([], [], [], []) for name in HALF_LIVES}
    prev_benchmarks: dict[str, dict[str, float]] = {name: {} for name in HALF_LIVES}

    for week in eval_weeks:
        week_end = week + timedelta(days=7)
        train = [s for s in sales if s.sale_date < week]
        holdout = [s for s in sales if week <= s.sale_date < week_end]
        if not holdout:
            continue

        for arm_name, half_life in HALF_LIVES.items():
            store = build_benchmarks(train, week, half_life)
            for sale in holdout:
                pred, effective_n, _ = store.predict(sale)
                if math.isnan(pred):
                    continue
                metrics[arm_name].abs_errors.append(abs(pred - sale.sale_price))

                actual_gp = gross_positive(sale)
                predicted_gp = predicted_gross_positive(pred, sale.price_paid)
                if actual_gp is not None and predicted_gp is not None:
                    metrics[arm_name].gross_pairs.append((predicted_gp, actual_gp))

                if effective_n < THIN_EFFECTIVE_N:
                    metrics[arm_name].thin_abs_errors.append(abs(pred - sale.sale_price))

            exact, _, _ = segment_keys(holdout[0])
            _ = exact  # silence lint; segment stability uses exact buckets below
            current_exact: dict[str, float] = {}
            for key, (w_sum, price_w) in store.exact.items():
                if w_sum > 0:
                    current_exact[key] = price_w / w_sum

            for key, value in current_exact.items():
                prev = prev_benchmarks[arm_name].get(key)
                if prev is not None and prev > 0:
                    change = abs(value - prev) / prev
                    metrics[arm_name].stability_changes.append(change)
            prev_benchmarks[arm_name] = current_exact

    summary: dict[str, dict] = {}
    for arm_name, arm in metrics.items():
        abs_errors = np.array(arm.abs_errors, dtype=float)
        thin_errors = np.array(arm.thin_abs_errors, dtype=float)
        stability = np.array(arm.stability_changes, dtype=float)
        gross_error_rate = None
        if arm.gross_pairs:
            mismatches = sum(1 for pred, actual in arm.gross_pairs if pred != actual)
            gross_error_rate = mismatches / len(arm.gross_pairs)
        summary[arm_name] = {
            "n_predictions": int(abs_errors.size),
            "sale_price_mae": float(abs_errors.mean()) if abs_errors.size else math.nan,
            "gross_hit_error_rate": gross_error_rate,
            "stability_p95": float(np.percentile(stability, 95)) if stability.size else math.nan,
            "thin_segment_mae": float(thin_errors.mean()) if thin_errors.size else math.nan,
            "thin_segment_n": int(thin_errors.size),
        }
    return summary


def choose_lambda(summary: dict[str, dict]) -> tuple[str, str]:
    ranked = sorted(
        HALF_LIVES.keys(),
        key=lambda name: summary[name]["sale_price_mae"],
    )
    best = ranked[0]
    chosen = best
    rationale_parts = []

    # Reject a shorter half-life when MAE gain is negligible but thin-segment error is worse.
    for candidate in ranked[1:]:
        best_mae = summary[best]["sale_price_mae"]
        cand_mae = summary[candidate]["sale_price_mae"]
        rel_gain = (cand_mae - best_mae) / cand_mae if cand_mae else 0.0
        if rel_gain > 0.01:
            break
        best_thin = summary[best]["thin_segment_mae"]
        cand_thin = summary[candidate]["thin_segment_mae"]
        if (
            not math.isnan(best_thin)
            and not math.isnan(cand_thin)
            and cand_thin + 50 < best_thin
        ):
            chosen = candidate
            rationale_parts.append(
                f"Raw MAE winner was {best} (${best_mae:,.0f}). Chose {candidate} instead: "
                f"only ${cand_mae - best_mae:,.0f} worse on overall MAE ({rel_gain * 100:.2f}%) "
                f"but thin-segment MAE improves ${best_thin - cand_thin:,.0f} "
                f"(${best_thin:,.0f} → ${cand_thin:,.0f})."
            )
            break

    if not rationale_parts:
        rationale_parts.append(
            f"Lowest walk-forward sale-price MAE over the most recent {EVAL_WEEKS} weeks "
            f"(${summary[best]['sale_price_mae']:,.0f})."
        )

    if chosen == best and len(ranked) > 1:
        runner = ranked[1]
        rationale_parts.append(
            f"Next closest arm: {runner} (MAE ${summary[runner]['sale_price_mae']:,.0f}, "
            f"thin-segment MAE ${summary[runner]['thin_segment_mae']:,.0f})."
        )

    return chosen, " ".join(rationale_parts)


def render_report(
    sales: list[Sale],
    excluded: int,
    summary: dict[str, dict],
    chosen: str,
    rationale: str,
    eval_start: date,
    eval_end: date,
) -> str:
    lines = [
        "# Report 10 — Decay-Rate Validation",
        "",
        f"**Run date:** {date.today().isoformat()} · **Punch item:** #10",
        f"**Data source:** `tav.purchase_outcomes` (not `historical_sales`)",
        f"**Rows used:** {len(sales):,} · **Excluded:** {excluded:,} (NULL `sale_date` or `sale_price`)",
        f"**Sale date range:** {sales[0].sale_date} → {sales[-1].sale_date}",
        f"**Evaluation window:** {eval_start} → {eval_end} ({EVAL_WEEKS} walk-forward weeks, Monday starts)",
        "",
        "## Method",
        "",
        "- Walk-forward: train = all sales with `sale_date < week_start(W)`; holdout = sales in week W.",
        "- Decay weight: `0.5 ^ (age_days / half_life)`; no-decay arm uses uniform weights.",
        "- Segment ladder: exact (Y+M+M+trim) → drop trim (Y+M+M) → make/model → global.",
        f"- Thin segment: effective N < {THIN_EFFECTIVE_N:.0f}.",
        f"- Gross-hit error: predicted `(benchmark_sale − price_paid ≥ ${TARGET_NET_GROSS})` vs actual `gross_profit > 0`.",
        "",
        "## λ-grid results",
        "",
        "| Half-life | Sale-price MAE | Gross-hit error | Stability P95 | Thin-segment MAE | N preds |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in HALF_LIVES:
        row = summary[name]
        gross = (
            f"{row['gross_hit_error_rate'] * 100:.2f}%"
            if row["gross_hit_error_rate"] is not None
            else "n/a"
        )
        lines.append(
            f"| {name} | ${row['sale_price_mae']:,.0f} | {gross} | "
            f"{row['stability_p95']:.3f} | ${row['thin_segment_mae']:,.0f} | {row['n_predictions']:,} |"
        )
    lines.extend(
        [
            "",
            "## Chosen λ",
            "",
            f"**Half-life:** `{HALF_LIVES[chosen] or 'no_decay (uniform weights)'}` ({chosen})",
            "",
            f"**Rationale:** {rationale}",
            "",
            f"**Benchmark version naming:** use suffix `-{chosen}` e.g. `bm-2026w22-{chosen}`.",
            "",
            "## Per-segment overrides",
            "",
            "None for v1 — global half-life applied to all segments.",
            "",
            "## Follow-ups",
            "",
            "- Region/mileage decay sensitivity (out of scope for this spike).",
            "- Regenerate Audit Kit 07 effective-N column with chosen λ before Phase 2 views ship.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="MaxBuy decay half-life backtest")
    parser.add_argument("--csv", type=Path, help="Input CSV export path")
    parser.add_argument(
        "--merge-mcp",
        nargs="+",
        type=Path,
        help="Merge MCP execute_sql JSON exports into --out-csv",
    )
    parser.add_argument("--out-csv", type=Path, help="Output CSV when merging MCP exports")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("docs/07-buybox/reports/10-decay-rate-report.md"),
    )
    parser.add_argument("--excluded", type=int, default=0)
    args = parser.parse_args()

    if args.merge_mcp:
        if not args.out_csv:
            print("--out-csv required with --merge-mcp", file=sys.stderr)
            return 1
        count = merge_mcp_exports(args.merge_mcp, args.out_csv)
        print(f"Wrote {count:,} rows to {args.out_csv}")
        if not args.csv:
            args.csv = args.out_csv

    if not args.csv:
        parser.error("--csv or --merge-mcp required")

    sales = load_csv(args.csv)
    summary = run_backtest(sales)
    chosen, rationale = choose_lambda(summary)

    eval_end = week_start(sales[-1].sale_date) + timedelta(days=6)
    eval_start = week_start(sales[-1].sale_date) - timedelta(weeks=EVAL_WEEKS - 1)
    report = render_report(sales, args.excluded, summary, chosen, rationale, eval_start, eval_end)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report, encoding="utf-8")

    print(json.dumps({"chosen": chosen, "half_life_days": HALF_LIVES[chosen], "summary": summary}, indent=2))
    print(f"\nReport written to {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
