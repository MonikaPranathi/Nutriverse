/**
 * routes/discovery.js
 * Owner: Divya (Member 2)
 *
 * The three "new idea" features:
 *
 *   Waste-Not Chains — after cooking one class, suggest a follow-up that
 *   reuses the leftovers, so ingredients get used up across meals instead
 *   of each recipe being recommended in isolation.
 *
 *   Skill Ladder — track completed classes and unlock higher skill levels
 *   as beginners build up experience.
 *
 *   Substitutions — "no paneer? use tofu" lookups.
 *
 * Endpoints:
 *   GET  /api/waste-not-chain?class_id=3  - follow-up classes reusing leftovers
 *   POST /api/complete-class              - mark a class as completed
 *   GET  /api/skill-ladder?user_id=1      - progress + unlocked levels
 *   GET  /api/substitutions?ingredient=Paneer - what to use instead
 *
 * Requires: database/schema_v2_additions.sql
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// How many classes at a level before the next one unlocks
const LADDER_THRESHOLDS = {
    beginner: 0,      // always available
    intermediate: 3,  // 3 completed beginner classes
    advanced: 5,      // 5 completed intermediate classes
};

// ---------------------------------------------------------------------
// GET /api/waste-not-chain?class_id=3&limit=5
//
// Finds approved classes that share ingredients with the given class.
// The shared ingredients are the "leftovers" — things you already bought
// and opened for the first recipe. Ranked by overlap, but we deliberately
// exclude perfect-overlap duplicates so you get a genuinely different meal.
// ---------------------------------------------------------------------
router.get('/waste-not-chain', async (req, res) => {
    const classId = parseInt(req.query.class_id, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);

    if (!classId) {
        return respond(res, false, 'class_id is required.', null, 400);
    }

    try {
        const [sourceClass] = await pool.query(
            'SELECT id, title FROM classes WHERE id = ?',
            [classId]
        );

        if (sourceClass.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        const [sourceIngredients] = await pool.query(
            `SELECT i.id, i.name
             FROM class_ingredients ci
             JOIN ingredients i ON i.id = ci.ingredient_id
             WHERE ci.class_id = ?`,
            [classId]
        );

        if (sourceIngredients.length === 0) {
            return respond(res, true, 'That class has no ingredients tagged, so no chain can be built.', {
                source_class: sourceClass[0],
                leftovers: [],
                suggestions: [],
            });
        }

        const sourceIds = sourceIngredients.map((r) => r.id);
        const placeholders = sourceIds.map(() => '?').join(',');

        const [rows] = await pool.query(
            `SELECT
                 c.id AS class_id,
                 c.title,
                 c.category,
                 c.meal_time,
                 c.video_url,
                 COUNT(ci.ingredient_id) AS total_required,
                 SUM(CASE WHEN ci.ingredient_id IN (${placeholders}) THEN 1 ELSE 0 END) AS reused_count,
                 GROUP_CONCAT(
                     CASE WHEN ci.ingredient_id IN (${placeholders}) THEN i.name END
                     ORDER BY i.name SEPARATOR ', '
                 ) AS reused_ingredients
             FROM classes c
             JOIN class_ingredients ci ON ci.class_id = c.id
             JOIN ingredients i ON i.id = ci.ingredient_id
             WHERE c.status = 'approved' AND c.id != ?
             GROUP BY c.id
             HAVING reused_count > 0
             ORDER BY reused_count DESC, total_required ASC
             LIMIT ?`,
            [...sourceIds, ...sourceIds, classId, limit]
        );

        const suggestions = rows.map((row) => {
            const totalRequired = Number(row.total_required);
            const reusedCount = Number(row.reused_count);
            return {
                class_id: row.class_id,
                title: row.title,
                category: row.category,
                meal_time: row.meal_time,
                video_url: row.video_url,
                reused_count: reusedCount,
                total_required: totalRequired,
                need_to_buy: totalRequired - reusedCount,
                reused_ingredients: row.reused_ingredients ? row.reused_ingredients.split(', ') : [],
            };
        });

        return respond(res, true, 'Waste-not chain built.', {
            source_class: sourceClass[0],
            leftovers: sourceIngredients.map((r) => r.name),
            suggestions,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to build waste-not chain.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/complete-class
// Body: { user_id, class_id }
// ---------------------------------------------------------------------
router.post('/complete-class', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !classId) {
        return respond(res, false, 'user_id and class_id are required.', null, 400);
    }

    try {
        const [classRows] = await pool.query(
            'SELECT id, title, skill_level FROM classes WHERE id = ?',
            [classId]
        );

        if (classRows.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        const [result] = await pool.query(
            'INSERT IGNORE INTO user_completed_classes (user_id, class_id) VALUES (?, ?)',
            [userId, classId]
        );

        if (result.affectedRows === 0) {
            return respond(res, true, 'You already completed this class.', { created: false });
        }

        return respond(res, true, 'Class marked as completed.', {
            created: true,
            class_id: classId,
            skill_level: classRows[0].skill_level,
        }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to mark class as completed.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/skill-ladder?user_id=1
//
// Returns how many classes the user has completed at each level and
// which levels are unlocked.
// ---------------------------------------------------------------------
router.get('/skill-ladder', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT c.skill_level, COUNT(*) AS completed
             FROM user_completed_classes uc
             JOIN classes c ON c.id = uc.class_id
             WHERE uc.user_id = ?
             GROUP BY c.skill_level`,
            [userId]
        );

        const completed = { beginner: 0, intermediate: 0, advanced: 0 };
        for (const row of rows) {
            completed[row.skill_level] = Number(row.completed);
        }

        const intermediateUnlocked = completed.beginner >= LADDER_THRESHOLDS.intermediate;
        const advancedUnlocked = intermediateUnlocked && completed.intermediate >= LADDER_THRESHOLDS.advanced;

        let currentLevel = 'beginner';
        if (advancedUnlocked) currentLevel = 'advanced';
        else if (intermediateUnlocked) currentLevel = 'intermediate';

        let nextGoal = null;
        if (!intermediateUnlocked) {
            nextGoal = {
                unlocks: 'intermediate',
                completed: completed.beginner,
                needed: LADDER_THRESHOLDS.intermediate,
                remaining: LADDER_THRESHOLDS.intermediate - completed.beginner,
            };
        } else if (!advancedUnlocked) {
            nextGoal = {
                unlocks: 'advanced',
                completed: completed.intermediate,
                needed: LADDER_THRESHOLDS.advanced,
                remaining: LADDER_THRESHOLDS.advanced - completed.intermediate,
            };
        }

        return respond(res, true, 'Skill ladder retrieved.', {
            user_id: userId,
            current_level: currentLevel,
            total_completed: completed.beginner + completed.intermediate + completed.advanced,
            completed_by_level: completed,
            unlocked: {
                beginner: true,
                intermediate: intermediateUnlocked,
                advanced: advancedUnlocked,
            },
            next_goal: nextGoal,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve skill ladder.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/substitutions?ingredient=Paneer
// ---------------------------------------------------------------------
router.get('/substitutions', async (req, res) => {
    const ingredientName = (req.query.ingredient || '').trim();

    if (!ingredientName) {
        return respond(res, false, 'ingredient is required.', null, 400);
    }

    try {
        const [ingredientRows] = await pool.query(
            'SELECT id, name FROM ingredients WHERE LOWER(name) = ?',
            [ingredientName.toLowerCase()]
        );

        if (ingredientRows.length === 0) {
            return respond(res, true, 'That ingredient is not in the list yet.', {
                ingredient: ingredientName,
                substitutes: [],
            });
        }

        const { id, name } = ingredientRows[0];

        const [subs] = await pool.query(
            `SELECT i.id, i.name, s.notes
             FROM ingredient_substitutions s
             JOIN ingredients i ON i.id = s.substitute_id
             WHERE s.ingredient_id = ?
             ORDER BY i.name ASC`,
            [id]
        );

        return respond(res, true, 'Substitutions retrieved.', {
            ingredient: name,
            substitutes: subs,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve substitutions.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/substitutions
// Body: { ingredient: string, substitute: string, notes?: string }
// ---------------------------------------------------------------------
router.post('/substitutions', async (req, res) => {
    const ingredientName = (req.body.ingredient || '').trim();
    const substituteName = (req.body.substitute || '').trim();
    const notes = (req.body.notes || '').trim() || null;

    if (!ingredientName || !substituteName) {
        return respond(res, false, 'ingredient and substitute are required.', null, 400);
    }
    if (ingredientName.toLowerCase() === substituteName.toLowerCase()) {
        return respond(res, false, 'An ingredient cannot substitute for itself.', null, 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Find or create both ingredients
        const resolveId = async (name) => {
            const [existing] = await conn.query(
                'SELECT id FROM ingredients WHERE LOWER(name) = ?',
                [name.toLowerCase()]
            );
            if (existing.length > 0) return existing[0].id;

            const [inserted] = await conn.query(
                'INSERT INTO ingredients (name, is_user_submitted) VALUES (?, TRUE)',
                [name]
            );
            return inserted.insertId;
        };

        const ingredientId = await resolveId(ingredientName);
        const substituteId = await resolveId(substituteName);

        await conn.query(
            'INSERT IGNORE INTO ingredient_substitutions (ingredient_id, substitute_id, notes) VALUES (?, ?, ?)',
            [ingredientId, substituteId, notes]
        );

        await conn.commit();
        return respond(res, true, 'Substitution saved.', {
            ingredient: ingredientName,
            substitute: substituteName,
            notes,
        }, 201);
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to save substitution.', null, 500);
    } finally {
        conn.release();
    }
});

module.exports = router;