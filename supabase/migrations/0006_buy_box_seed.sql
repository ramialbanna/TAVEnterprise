-- =============================================================================
-- Migration 0006 — Seed default buy_box_rules for v1
--
-- Three default rules covering the Texas markets:
--   bbr-all-2018-2023-100k    : broad rule, any make, price < 85% MMR
--   bbr-truck-2017-2023-120k  : trucks, higher mileage tolerance, tighter MMR
--   bbr-luxury-2019-2023-75k  : luxury sources, lower mileage, looser MMR
--
-- Rules are additive. Add new rules without removing old ones.
-- Update via SQL UPDATE — do not re-seed.
-- =============================================================================

INSERT INTO tav.buy_box_rules (
  rule_id,
  version,
  make,
  model,
  year_min,
  year_max,
  max_mileage,
  min_mileage,
  target_price_pct_of_mmr,
  regions,
  sources,
  priority_score,
  notes,
  is_active
) VALUES
  (
    'bbr-all-2018-2023-100k',
    1,
    NULL,
    NULL,
    2018, 2023,
    100000, NULL,
    85.00,
    ARRAY['dallas_tx','houston_tx','austin_tx','san_antonio_tx'],
    ARRAY['facebook','craigslist','autotrader','cars_com','offerup'],
    50,
    'Default: any make/model 2018–2023, under 100k miles, price < 85% MMR',
    true
  ),
  (
    'bbr-truck-2017-2023-120k',
    1,
    'ford,chevrolet,ram,gmc,toyota,nissan',
    NULL,
    2017, 2023,
    120000, NULL,
    80.00,
    ARRAY['dallas_tx','houston_tx','austin_tx','san_antonio_tx'],
    ARRAY['facebook','craigslist'],
    70,
    'Trucks 2017–2023, higher mileage tolerance, tighter price < 80% MMR',
    true
  ),
  (
    'bbr-luxury-2019-2023-75k',
    1,
    'mercedes-benz,bmw,audi,lexus,acura,genesis,volvo',
    NULL,
    2019, 2023,
    75000, NULL,
    88.00,
    ARRAY['dallas_tx','houston_tx'],
    ARRAY['autotrader','cars_com'],
    80,
    'Luxury segment 2019–2023, lower mileage ceiling, Dallas/Houston only',
    true
  )
ON CONFLICT (rule_id) DO NOTHING;
