# MaxBuy decay backtest (Phase 1)

Offline walk-forward analysis to choose the recency half-life λ for benchmark views.

## Run

Export `tav.purchase_outcomes` (read-only), then:

```bash
python scripts/maxbuy/decay-backtest/run_backtest.py --csv path/to/purchase_outcomes.csv
```

Or merge Supabase MCP `execute_sql` JSON exports:

```bash
python scripts/maxbuy/decay-backtest/run_backtest.py \
  --merge-mcp batch0.json batch1.json batch2.json \
  --out-csv scripts/maxbuy/decay-backtest/data/purchase_outcomes.csv \
  --csv scripts/maxbuy/decay-backtest/data/purchase_outcomes.csv
```

Output: `docs/07-buybox/reports/10-decay-rate-report.md`

Requires: Python 3.11+, `numpy`.
