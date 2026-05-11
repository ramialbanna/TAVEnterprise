-- =============================================================================
-- Migration: 0007_year_constraint_alignment
--
-- Align normalized_listings.year CHECK with the adapter business rule.
-- Valid vehicle years are 2000–2035. The facebook adapter (and all future
-- source adapters) reject years outside this range before they reach the DB.
-- The old constraint (1900–2100) was more permissive than the business rule.
-- =============================================================================

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_year_check;

ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_year_check
  CHECK (year BETWEEN 2000 AND 2035);
