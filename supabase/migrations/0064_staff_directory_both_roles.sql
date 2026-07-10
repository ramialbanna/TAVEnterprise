-- =============================================================================
-- Migration 0064 — Same roster for salesperson + appraiser pickers
-- =============================================================================
-- Buyer confirmed the seeded salespeople list should also populate Appraiser.
-- Role `both` is included by listStaffDirectory for either picker type.

UPDATE tav.staff_directory
SET role = 'both',
    updated_at = now()
WHERE role = 'salesperson';
