-- ============================================================
-- Nutriverse — Schema Additions (v5)
-- Closes: shopping list quantities, review photos.
--
-- Run AFTER schema.sql, v2, v3, v4:
--   mysql -u root -p nutriverse < database/schema_v5_additions.sql
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- INGREDIENT QUANTITIES
-- Adds optional amount + unit to the existing class_ingredients
-- junction. Nullable — classes uploaded before this exists just
-- won't have amounts, which the shopping list handles gracefully.
-- ------------------------------------------------------------
ALTER TABLE class_ingredients
    ADD COLUMN quantity DECIMAL(6,2),
    ADD COLUMN unit VARCHAR(20);

-- ------------------------------------------------------------
-- REVIEW PHOTOS
-- ------------------------------------------------------------
ALTER TABLE class_reviews
    ADD COLUMN photo_url VARCHAR(255);