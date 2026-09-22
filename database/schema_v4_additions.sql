-- ============================================================
-- Nutriverse — Schema Additions (v4)
-- Closes 4 gaps: cuisine preferences, prep/cook time + servings,
-- step-by-step instructions, user-created custom cookbooks.
--
-- Run AFTER schema.sql, schema_v2_additions.sql, schema_v3_additions.sql:
--   mysql -u root -p nutriverse < database/schema_v4_additions.sql
--
-- Assumes Pranathi's schema.sql already has `cuisines` and
-- `class_cuisines` tables (they were in the original schema but
-- unused until now).
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- PREP TIME / COOK TIME / SERVINGS
-- time_needed (quick/medium/long) stays as a rough filter bucket;
-- these give the actual numbers for a recipe detail page.
-- ------------------------------------------------------------
ALTER TABLE classes
    ADD COLUMN prep_time_minutes INT,
    ADD COLUMN cook_time_minutes INT,
    ADD COLUMN servings INT;

-- ------------------------------------------------------------
-- STEP-BY-STEP INSTRUCTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_steps (
    class_id    INT NOT NULL,
    step_number INT NOT NULL,
    instruction VARCHAR(500) NOT NULL,
    PRIMARY KEY (class_id, step_number),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- CUISINE PREFERENCES (per user)
-- Uses the existing `cuisines` table from schema.sql.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cuisine_preferences (
    user_id    INT,
    cuisine_id INT,
    PRIMARY KEY (user_id, cuisine_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- CUSTOM COOKBOOKS
-- User-created, user-named collections (vs. admin-curated
-- recipe_collections from v3).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cookbooks (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    name        VARCHAR(150) NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_cookbook_name (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cookbook_classes (
    cookbook_id INT NOT NULL,
    class_id    INT NOT NULL,
    added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cookbook_id, class_id),
    FOREIGN KEY (cookbook_id) REFERENCES user_cookbooks(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE INDEX idx_cookbooks_user ON user_cookbooks(user_id);