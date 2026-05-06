-- =============================================================================
-- repair-functions.sql
-- Run this in the Supabase SQL editor to install the three stored functions
-- that were marked as applied during migration repair but never executed.
-- All statements use CREATE OR REPLACE — safe to run multiple times.
-- =============================================================================

-- ── 1. set_updated_at trigger helper (migration 0001) ─────────────────────────
CREATE OR REPLACE FUNCTION tav.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 2. upsert_normalized_listing (migration 0004) ─────────────────────────────
CREATE OR REPLACE FUNCTION tav.upsert_normalized_listing(
  p_source             text,
  p_source_run_id      uuid,
  p_listing_url        text,
  p_source_listing_id  text,
  p_title              text,
  p_price              integer,
  p_mileage            integer,
  p_year               smallint,
  p_make               text,
  p_model              text,
  p_trim               text,
  p_vin                text,
  p_region             text,
  p_scraped_at         timestamptz,
  p_seller_name        text,
  p_seller_url         text,
  p_images             text[],
  p_posted_at          timestamptz,
  p_raw_listing_id     uuid
) RETURNS TABLE (
  listing_id      uuid,
  is_new          boolean,
  price_changed   boolean,
  mileage_changed boolean
) AS $$
DECLARE
  v_id              uuid;
  v_existing_price  integer;
  v_existing_mileage integer;
  v_is_new          boolean := false;
  v_price_changed   boolean := false;
  v_mileage_changed boolean := false;
BEGIN
  SELECT nl.id, nl.price, nl.mileage
  INTO v_id, v_existing_price, v_existing_mileage
  FROM tav.normalized_listings nl
  WHERE nl.source = p_source AND nl.listing_url = p_listing_url;

  IF NOT FOUND THEN
    INSERT INTO tav.normalized_listings (
      source, source_run_id, listing_url, source_listing_id,
      title, price, mileage, year, make, model, trim, vin, region,
      scraped_at, seller_name, seller_url, images, posted_at,
      raw_listing_id, freshness_status, scrape_count,
      first_seen_at, last_seen_at
    ) VALUES (
      p_source, p_source_run_id, p_listing_url, p_source_listing_id,
      p_title, p_price, p_mileage, p_year, p_make, p_model, p_trim, p_vin, p_region,
      p_scraped_at, p_seller_name, p_seller_url, p_images, p_posted_at,
      p_raw_listing_id, 'new', 1,
      p_scraped_at, p_scraped_at
    )
    RETURNING tav.normalized_listings.id INTO v_id;
    v_is_new := true;
  ELSE
    v_price_changed   := p_price IS NOT NULL AND v_existing_price IS DISTINCT FROM p_price;
    v_mileage_changed := p_mileage IS NOT NULL AND v_existing_mileage IS DISTINCT FROM p_mileage;

    UPDATE tav.normalized_listings SET
      source_run_id     = p_source_run_id,
      source_listing_id = COALESCE(p_source_listing_id, source_listing_id),
      title             = p_title,
      price             = p_price,
      last_price        = CASE WHEN v_price_changed THEN v_existing_price ELSE last_price END,
      price_changed_at  = CASE WHEN v_price_changed THEN now() ELSE price_changed_at END,
      price_changed     = v_price_changed,
      mileage           = p_mileage,
      mileage_changed   = v_mileage_changed,
      year              = p_year,
      make              = p_make,
      model             = p_model,
      trim              = p_trim,
      vin               = COALESCE(p_vin, vin),
      seller_name       = COALESCE(p_seller_name, seller_name),
      seller_url        = COALESCE(p_seller_url, seller_url),
      images            = COALESCE(p_images, images),
      posted_at         = COALESCE(p_posted_at, posted_at),
      raw_listing_id    = COALESCE(p_raw_listing_id, raw_listing_id),
      last_seen_at      = p_scraped_at,
      scrape_count      = scrape_count + 1,
      freshness_status  = 'active',
      stale_score       = 0,
      updated_at        = now()
    WHERE id = v_id;
  END IF;

  RETURN QUERY SELECT v_id, v_is_new, v_price_changed, v_mileage_changed;
END;
$$ LANGUAGE plpgsql;

-- ── 3. run_stale_sweep (migration 0010 — fixed version) ──────────────────────
CREATE OR REPLACE FUNCTION tav.run_stale_sweep()
RETURNS integer AS $$
DECLARE
  v_total integer := 0;
  v_count integer;
BEGIN
  -- 1. Mark aging (3–7 days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'aging',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 25),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active')
    AND last_seen_at < now() - interval '3 days'
    AND last_seen_at >= now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 2. Mark stale_suspected (7–14 days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'stale_suspected',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 50),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active', 'aging')
    AND last_seen_at < now() - interval '7 days'
    AND last_seen_at >= now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 3. Mark stale_confirmed (14+ days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'stale_confirmed',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 75),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active', 'aging', 'stale_suspected')
    AND last_seen_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 4. Stale out leads whose listing is now stale_confirmed
  UPDATE tav.leads l
  SET status     = 'stale',
      updated_at = now()
  FROM tav.normalized_listings nl
  WHERE l.normalized_listing_id = nl.id
    AND nl.freshness_status = 'stale_confirmed'
    AND l.status IN ('new', 'assigned');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
