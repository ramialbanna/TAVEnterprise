-- =============================================================================
-- Migration 0070 — purge invalid / empty-trim mmr_style_aliases (alias quality)
-- Removes aliases whose Cox tokens don't exist in cox_catalog_tree and
-- catch-all empty-trim keys that caused wrong MMR (e.g. Wrangler → Sahara).
-- =============================================================================

UPDATE tav.mmr_style_aliases
SET canonical_make = UPPER(canonical_make)
WHERE canonical_make <> UPPER(canonical_make);

DELETE FROM tav.mmr_style_aliases a
WHERE NOT EXISTS (
  SELECT 1
  FROM tav.cox_catalog_tree c
  WHERE UPPER(c.make) = UPPER(a.canonical_make)
    AND c.model = a.canonical_model
    AND c.style = a.canonical_style
);

-- Empty trim segment: alias ends with "|" (make|model|)
DELETE FROM tav.mmr_style_aliases
WHERE alias ~ '\|$';
