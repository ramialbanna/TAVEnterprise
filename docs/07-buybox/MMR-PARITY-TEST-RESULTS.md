# MMR Parity Test Results

**Date:** 2026-06-19  
**Tester:** Manual — MMR Lab UI  
**Purpose:** Side-by-side comparison of our app vs Manheim native tool for 3 YMMs + 2 VINs.

---

## 3 YMMs

### 1 — 2022 Toyota Camry SE

**Style matched:** 2022 TOYOTA CAMRY AWD 4C 4D SEDAN SE

| Field | Our App | Manheim | Match? |
|---|---|---|---|
| Base MMR | $19,950 | $15,850 | ❌ Off $4,100 |
| Avg Odometer | 70,204 | 71,867 | ~OK |
| Avg Condition | 38 | 2.3 | ❌ Display bug (38 = 3.8, Manheim shows 2.3 — different item selected) |
| MMR Range | $16,400 – $23,500 | $14,000 – $17,700 | ❌ Way off + much wider |
| Adjusted MMR | $19,950 | -- | n/a |
| Retail Value | $23,000 | $21,900 | ❌ Off $1,100 |
| Typical Range | $21,300 – $24,700 | $20,000 – $23,700 | ❌ Off |

**Notes:** Base MMR is $4,100 higher than Manheim. Avg Condition mismatch (3.8 vs 2.3) confirms we are selecting a different item from Cox's items[] array — this is Problem A from Item 17.

---

### 2 — 2021 Ford F-150 XL

**Style matched:** 2021 FORD F150 4WD V6 EXT CAB 2.7L XL

| Field | Our App | Manheim | Match? |
|---|---|---|---|
| Base MMR | $19,100 | $19,100 | ✅ |
| Avg Odometer | 104,670 | 104,670 | ✅ |
| Avg Condition | 40 | 4.0 | ⚠️ Display bug (40 should render as 4.0) |
| MMR Range | $17,250 – $20,900 | $17,250 – $20,900 | ✅ |
| Adjusted MMR | $19,100 | -- | n/a |
| Retail Value | $22,900 | $22,900 | ✅ |
| Typical Range | $20,000 – $25,800 | $20,000 – $25,800 | ✅ |

**Notes:** Perfect match on all values. Only issue is the Avg Condition display bug (40 instead of 4.0). This vehicle confirms the YMM item selection CAN be correct — the Camry mismatch is vehicle-specific.

---

### 3 — 2023 Honda CR-V EX

**Style matched:** 2023 HONDA CR-V AWD 4D SUV 1.5L EX

| Field | Our App | Manheim | Match? |
|---|---|---|---|
| Base MMR | $25,100 | $25,100 | ✅ |
| Avg Odometer | 59,661 | 59,661 | ✅ |
| Avg Condition | 39 | 3.9 | ⚠️ Display bug (39 should render as 3.9) |
| MMR Range | $22,200 – $28,100 | $23,900 – $26,300 | ❌ Wider (Problem B) |
| Adjusted MMR | $25,100 | -- | n/a |
| Retail Value | $27,000 | $27,000 | ✅ |
| Typical Range | $25,100 – $28,800 | $25,100 – $28,800 | ✅ |

**Notes:** Base MMR and all values match. MMR Range is wider ($22,200–$28,100 vs $23,900–$26,300) — this is Problem B (our range uses wholesale.below/above; Manheim uses the ci block).

---

## 2 VINs

### 4 — 1FT7W2BT4KED81759 (2019 Ford F-250 PLATINUM)

| Field | Our App | Manheim | Match? |
|---|---|---|---|
| Base MMR | $43,500 | $43,500 | ✅ |
| Avg Odometer | 114,741 | 114,741 | ✅ |
| Avg Condition | 39 | 3.9 | ⚠️ Display bug |
| MMR Range | $39,700 – $47,300 | $41,600 – $45,500 | ❌ Wider (Problem B) |
| Adjusted MMR | $43,600 | $43,600 | ✅ |
| Build Options | +$100 | +$60 | ❌ Off $40 |
| Retail Value | $50,200 | $50,200 | ✅ |
| Typical Range | $45,900 – $54,500 | $45,800 – $54,500 | ✅ (~OK) |

**Notes:** Strong match on all scalar values. MMR Range still wider than Manheim (Problem B). Build delta slightly off ($100 vs $60).

---

### 5 — 1GYTEEKL1SU107843 (2025 Cadillac Escalade IQ)

| Field | Our App | Manheim | Match? |
|---|---|---|---|
| Base MMR | $103,000 | $103,000 | ✅ |
| Avg Odometer | 10,732 | 10,732 | ✅ |
| Avg Condition | 49 | 4.9 | ⚠️ Display bug |
| Avg EV Battery Score | -- | 100% | ❌ Not wired |
| MMR Range | $98,700 – $106,000 | $100,000 – $107,000 | ❌ Off ~$1,300 (Problem B) |
| Adjusted MMR | $104,000 | $104,000 | ✅ |
| Build Options | +$1,000 | +$1,060 | ❌ Off $60 |
| Retail Value | $106,000 | $106,000 | ✅ |
| Typical Range | $98,200 – $113,000 | $97,100 – $112,000 | ✅ (~OK) |

**Notes:** All scalar values match. MMR Range still Problem B. EV Battery Score not wired. Build delta off by $60.

---

## Summary of Issues Confirmed

| Issue | Severity | Vehicles affected |
|---|---|---|
| **Avg Condition displays 10× integer** (38/39/40/49 instead of 3.8/3.9/4.0/4.9) | High | All 5 |
| **Wrong item selected for 2022 Camry SE** — Base MMR $19,950 vs $15,850, condition 3.8 vs 2.3 (Problem A) | High | Camry (at minimum) |
| **MMR Range wider than Manheim** — uses wholesale.below/above, not ci block (Problem B) | High | CR-V, F-250, Escalade |
| **Avg EV Battery Score not wired** | Medium | Escalade (EVs) |
| **Build Options delta slightly off** — $100 vs $60 (F-250), $1,000 vs $1,060 (Escalade) | Low | F-250, Escalade |

## What Passed

- F-150 XL: full match on Base MMR, odometer, range, retail, typical range
- CR-V EX: Base MMR, odometer, retail, typical range all match
- F-250: Base MMR, odometer, adjusted MMR, retail, typical range all match
- Escalade: Base MMR, odometer, adjusted MMR, retail, typical range all match
- YMM auth is working (all 3 lookups succeeded)
- Retail Value now enabled and returning correct data for all 5
