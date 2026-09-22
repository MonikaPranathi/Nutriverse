-- ============================================================
-- Nutriverse — Schema Additions (v3)
-- Added by Divya. Covers: user profile/health data, dietary
-- preferences & allergies, meal planner, recipe collections,
-- seasonal ingredients.
--
-- Run AFTER schema.sql and schema_v2_additions.sql:
--   mysql -u root -p nutriverse < database/schema_v3_additions.sql
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- USER PROFILE / HEALTH DATA
-- Extends the existing users table with optional health fields.
-- All nullable — a user can sign up without filling these in.
-- ------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN age INT,
    ADD COLUMN gender ENUM('male', 'female', 'other'),
    ADD COLUMN height_cm DECIMAL(5,2),
    ADD COLUMN weight_kg DECIMAL(5,2),
    ADD COLUMN activity_level ENUM('sedentary', 'light', 'moderate', 'active', 'very_active'),
    ADD COLUMN goal ENUM('weight_loss', 'maintenance', 'muscle_gain', 'diabetes_management', 'general_health'),
    ADD COLUMN spice_tolerance ENUM('mild', 'medium', 'hot', 'extra_hot') DEFAULT 'medium';

-- ------------------------------------------------------------
-- BODY METRICS HISTORY (weight/BMI over time, for progress charts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_body_metrics (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    weight_kg    DECIMAL(5,2),
    height_cm    DECIMAL(5,2),
    bmi          DECIMAL(4,1),
    body_fat_pct DECIMAL(4,1),
    recorded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- DIETARY PREFERENCES (vegetarian, vegan, keto, etc.)
-- Lookup table + junction, same pattern as moods/cuisines.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dietary_preferences (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_dietary_preferences (
    user_id       INT,
    preference_id INT,
    PRIMARY KEY (user_id, preference_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (preference_id) REFERENCES dietary_preferences(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- ALLERGIES
-- allergens = the master list. class_allergens = what a class
-- contains. user_allergies = what a user is allergic to. Used
-- together to warn/filter.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS allergens (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS class_allergens (
    class_id    INT,
    allergen_id INT,
    PRIMARY KEY (class_id, allergen_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (allergen_id) REFERENCES allergens(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_allergies (
    user_id     INT,
    allergen_id INT,
    PRIMARY KEY (user_id, allergen_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (allergen_id) REFERENCES allergens(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- MEAL PLANNER
-- One planned class per user, per date, per meal slot.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    plan_date  DATE NOT NULL,
    meal_time  ENUM('morning', 'afternoon', 'evening', 'night') NOT NULL,
    class_id   INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_plan_slot (user_id, plan_date, meal_time),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- RECIPE COLLECTIONS ("High-Protein Breakfasts", etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_collections (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) UNIQUE NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_collections (
    class_id      INT,
    collection_id INT,
    PRIMARY KEY (class_id, collection_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES recipe_collections(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- SEASONAL INGREDIENTS
-- Comma-separated month numbers (1-12) when an ingredient is in
-- season. NULL / empty means "available year-round".
-- ------------------------------------------------------------
ALTER TABLE ingredients
    ADD COLUMN in_season_months VARCHAR(50) DEFAULT NULL;

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX idx_meal_plans_user_date ON meal_plans(user_id, plan_date);
CREATE INDEX idx_body_metrics_user ON user_body_metrics(user_id);

-- ------------------------------------------------------------
-- SEED DATA
-- ------------------------------------------------------------
INSERT IGNORE INTO dietary_preferences (name) VALUES
('Vegetarian'), ('Vegan'), ('Keto'), ('Paleo'), ('Mediterranean'),
('Low-Carb'), ('Low-Sodium'), ('Gluten-Free'), ('Dairy-Free');

INSERT IGNORE INTO allergens (name) VALUES
('Peanuts'), ('Tree Nuts'), ('Dairy'), ('Egg'), ('Gluten'),
('Soy'), ('Shellfish'), ('Fish'), ('Sesame');

INSERT IGNORE INTO recipe_collections (name, description) VALUES
('High-Protein Breakfasts', 'Start the day with protein-forward meals.'),
('30-Minute Weeknight Meals', 'Fast, simple dinners for busy days.'),
('Diabetes-Friendly', 'Lower glycemic-impact meals.'),
('Anti-Inflammatory', 'Meals built around anti-inflammatory ingredients.'),
('Comfort Classics', 'Cozy, familiar dishes for a rough day.');

-- A few illustrative seasonal tags on existing seeded ingredients
UPDATE ingredients SET in_season_months = '11,12,1,2' WHERE name = 'Spinach';
UPDATE ingredients SET in_season_months = '3,4,5' WHERE name = 'Green Chili';
UPDATE ingredients SET in_season_months = '6,7,8,9' WHERE name = 'Coconut';