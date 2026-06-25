-- =============================================================================
-- Migration 0061 — Opportunity detail: contact info, salesperson/appraisal,
--                   title information blocks; drop seller_notes.
--
-- Splits the hero into a 2-column layout (hero + Contact Info), replaces the
-- Seller/listing notes block with Salesperson/Appraisal Information + Title
-- Information, and drops the seller_notes column from both normalized_listings
-- and manual_opportunity_submissions (the field is removed end-to-end).
-- =============================================================================

-- Contact info (right side of hero)
ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS contact_first_name text,
  ADD COLUMN IF NOT EXISTS contact_last_name text,
  ADD COLUMN IF NOT EXISTS contact_home_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS contact_postal_code text;

-- Salesperson / Appraisal Information (left side of renamed block)
ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS salesperson text,
  ADD COLUMN IF NOT EXISTS appraiser text;

-- Title Information (right side of renamed block)
ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS title_owner text,
  ADD COLUMN IF NOT EXISTS title_state_region text,
  ADD COLUMN IF NOT EXISTS lien_holder text,
  ADD COLUMN IF NOT EXISTS lien_account_number text,
  ADD COLUMN IF NOT EXISTS lien_payoff numeric(12, 2),
  ADD COLUMN IF NOT EXISTS tag_or_plate text,
  ADD COLUMN IF NOT EXISTS tag_state_region text,
  ADD COLUMN IF NOT EXISTS tag_expiration date,
  ADD COLUMN IF NOT EXISTS certified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extended_warranty boolean NOT NULL DEFAULT false;

-- Drop seller_notes end-to-end (detail page UI, manual submit, persistence).
ALTER TABLE tav.normalized_listings
  DROP COLUMN IF EXISTS seller_notes;

ALTER TABLE tav.manual_opportunity_submissions
  DROP COLUMN IF EXISTS seller_notes;
