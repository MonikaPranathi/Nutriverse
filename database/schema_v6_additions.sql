-- ============================================================
-- Nutriverse — Schema Additions (v6)
-- Closes frontend-blocking gaps flagged by Member 4's apiclient.js
-- comments: dish photos, and meal_time never being persisted.
--
-- Run AFTER schema.sql through v5:
--   mysql -u root -p nutriverse < database/schema_v6_additions.sql
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- DISH PHOTOS
-- upload.html already sends an "image" file field in anticipation
-- of this — see apiclient.js gap #5.
-- ------------------------------------------------------------
ALTER TABLE classes
    ADD COLUMN image_url VARCHAR(255);

-- ------------------------------------------------------------
-- MEAL TIME PERSISTENCE
-- /api/set-meal-time (auth.js) currently validates and returns
-- success but writes nowhere — login.html/mealtime.html have been
-- working around this with sessionStorage. This column plus the
-- auth.js update below closes that gap for real.
-- ------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN meal_time ENUM('morning', 'afternoon', 'evening', 'night');