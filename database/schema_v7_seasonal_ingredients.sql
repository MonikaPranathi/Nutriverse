-- ============================================================
-- Nutriverse — Schema Additions (v6)
-- Closes: the seasonal-ingredients feature only had 3 ingredients
-- tagged (Spinach, Green Chili, Coconut) out of 18 — the "in
-- season" widget on the home page and cookbooks.html had almost
-- nothing to show for most months.
--
-- Adds ~16 real seasonal Indian ingredients (peas, methi, mango,
-- okra, pomegranate, etc. — the fresh produce that actually swings
-- by season) and re-tags a few existing pantry staples that do
-- have a real peak window (tomato, potato, garlic, ginger).
-- Deliberately leaves things like rice, dal, milk, paneer, curd,
-- egg, and curry leaves untagged (NULL) — they're available
-- year-round, which is exactly what NULL means to
-- GET /api/seasonal-ingredients (it's excluded from every month's
-- results rather than wrongly forced into one).
--
-- Month windows are approximate — they're the common North/Central
-- Indian mandi season for each item, given as a starting point;
-- shift them if your region's calendar runs differently.
--
-- Run AFTER schema.sql, v2, v3, v4, v5:
--   mysql -u root -p nutriverse < database/schema_v6_additions.sql
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- NEW SEASONAL PRODUCE
-- (INSERT IGNORE so this is safe to re-run / run alongside any
-- ingredient a contributor may have already added by hand.)
-- ------------------------------------------------------------
INSERT IGNORE INTO ingredients (name, in_season_months) VALUES
-- Winter (Dec–Feb): peak of the Indian produce calendar
('Green Peas', '11,12,1,2'),
('Methi', '11,12,1,2'),
('Carrot', '11,12,1,2,3'),
('Mustard Greens', '11,12,1,2'),
('Cauliflower', '10,11,12,1,2'),
('Amla', '10,11,12,1'),
-- Summer (Mar–Jun): mango season, plus the cooling gourds
('Mango', '3,4,5,6'),
('Raw Mango', '3,4,5'),
('Bottle Gourd', '3,4,5,6'),
('Cucumber', '3,4,5,6'),
-- Monsoon (Jun–Sep): corn on the coals, bitter gourd, okra, jamun
('Sweet Corn', '7,8,9'),
('Bitter Gourd', '6,7,8,9'),
('Okra', '6,7,8,9'),
('Jamun', '6,7'),
-- Festive (Sep–Nov): pomegranate and custard apple arrive with the festivals
('Pomegranate', '9,10,11'),
('Custard Apple', '9,10,11');

-- ------------------------------------------------------------
-- RE-TAG EXISTING PANTRY STAPLES THAT DO HAVE A REAL PEAK WINDOW
-- (Onion, Rice, Dal, Egg, Paneer, Milk, Curd, Peanuts, Millet,
-- and Curry Leaves are left untagged on purpose — see note above.)
-- ------------------------------------------------------------
UPDATE ingredients SET in_season_months = '11,12,1,2'     WHERE name = 'Tomato';
UPDATE ingredients SET in_season_months = '10,11,12,1,2,3' WHERE name = 'Potato';
UPDATE ingredients SET in_season_months = '2,3,4'          WHERE name = 'Garlic';
UPDATE ingredients SET in_season_months = '8,9,10,11,12'   WHERE name = 'Ginger';
UPDATE ingredients SET in_season_months = '10,11,12,1,2,3' WHERE name = 'Fish';

-- Existing tags from schema_v3_additions.sql, unchanged:
--   Spinach      '11,12,1,2'
--   Green Chili  '3,4,5'
--   Coconut      '6,7,8,9'