-- ============================================================
-- Nutriverse — Schema Additions (v2)
-- Added by Divya for the new feature set.
--
-- Kept separate from schema.sql so Pranathi can review before
-- these are folded into the main schema. Run AFTER schema.sql:
--   mysql -u root -p nutriverse < database/schema_v2_additions.sql
-- ============================================================

USE nutriverse;

-- ------------------------------------------------------------
-- COOKING TIP OF THE DAY
-- Rotates daily. `tip_type` groups them so the UI can show an icon
-- or label per kind of tip.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cooking_tips (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    tip_text   VARCHAR(500) NOT NULL,
    tip_type   ENUM('storage', 'fix_mistake', 'substitution', 'general') NOT NULL DEFAULT 'general',
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- FAVORITES (separate from likes — a like is a signal, a favorite
-- is a personal saved collection)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id     INT,
    class_id    INT,
    favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, class_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- RATINGS & REVIEWS
-- One review per user per class (enforced by the composite PK).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_reviews (
    user_id     INT,
    class_id    INT,
    rating      TINYINT NOT NULL,
    review_text VARCHAR(1000),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, class_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5)
);

-- ------------------------------------------------------------
-- INGREDIENT SUBSTITUTIONS
-- "If you don't have X, use Y." Directional: X -> Y.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredient_substitutions (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id       INT NOT NULL,
    substitute_id       INT NOT NULL,
    notes               VARCHAR(255),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_sub (ingredient_id, substitute_id),
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
    FOREIGN KEY (substitute_id) REFERENCES ingredients(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- SKILL LADDER — track completed classes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_completed_classes (
    user_id      INT,
    class_id     INT,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, class_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
CREATE INDEX idx_reviews_class ON class_reviews(class_id);
CREATE INDEX idx_completed_user ON user_completed_classes(user_id);
CREATE INDEX idx_tips_active ON cooking_tips(is_active);

-- ------------------------------------------------------------
-- SEED: Cooking tips
-- ------------------------------------------------------------
INSERT INTO cooking_tips (tip_text, tip_type) VALUES
('Added too much salt? Drop in a peeled raw potato and simmer for 10 minutes, then remove it.', 'fix_mistake'),
('Curry too spicy? Stir in a spoon of curd, cream, or a little jaggery to balance the heat.', 'fix_mistake'),
('Burnt the bottom of a dish? Move it to a fresh pan immediately without scraping the burnt layer.', 'fix_mistake'),
('Over-sweetened a dish? A pinch of salt or a squeeze of lemon will cut the sweetness.', 'fix_mistake'),
('Dough too sticky? Rest it for 15 minutes before adding more flour — hydration evens out on its own.', 'fix_mistake'),
('Store coriander and mint upright in a glass of water, loosely covered, to keep them fresh for a week.', 'storage'),
('Keep onions and potatoes apart — onions make potatoes sprout faster.', 'storage'),
('Store ginger in the freezer and grate it straight from frozen. It keeps for months.', 'storage'),
('Keep curry leaves in an airtight box lined with a dry cloth — no moisture, no mold.', 'storage'),
('Store dals and rice with a couple of dried red chillies to keep bugs away.', 'storage'),
('No curd? Mix a little lemon juice into milk and let it sit for 5 minutes.', 'substitution'),
('Out of paneer? Firm tofu works in almost any gravy with the same cook time.', 'substitution'),
('No coconut milk? Blend soaked cashews with warm water for a similar richness.', 'substitution'),
('Out of garlic? Use a pinch of asafoetida (hing) for a similar savoury depth.', 'substitution'),
('No fresh tomatoes? Use tamarind pulp or amchur for the sourness instead.', 'substitution'),
('Taste as you cook, not just at the end — seasoning is easier to build than to fix.', 'general'),
('Let meat and paneer rest 5 minutes after cooking so the juices settle.', 'general'),
('Heat the pan before adding oil — it stops food from sticking.', 'general');

-- ------------------------------------------------------------
-- SEED: A few common substitutions (linked to existing seeded ingredients)
-- ------------------------------------------------------------
INSERT IGNORE INTO ingredient_substitutions (ingredient_id, substitute_id, notes)
SELECT a.id, b.id, 'Similar texture in gravies'
FROM ingredients a, ingredients b
WHERE a.name = 'Paneer' AND b.name = 'Egg';

INSERT IGNORE INTO ingredient_substitutions (ingredient_id, substitute_id, notes)
SELECT a.id, b.id, 'Use for creaminess'
FROM ingredients a, ingredients b
WHERE a.name = 'Milk' AND b.name = 'Coconut';

INSERT IGNORE INTO ingredient_substitutions (ingredient_id, substitute_id, notes)
SELECT a.id, b.id, 'Both add sourness'
FROM ingredients a, ingredients b
WHERE a.name = 'Tomato' AND b.name = 'Curd';