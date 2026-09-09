/**
 * routes/classes.js
 * Owner: Divya (Member 2)
 *
 * Endpoints in this file so far:
 *   GET  /api/classes           - filtered class list          (Checkpoint 1)
 *   POST /api/match-ingredients - classes ranked by ingredient match (Checkpoint 2)
 *   POST /api/add-ingredient    - insert a new ingredient if missing (Checkpoint 2)
 *
 * Matches Pranathi's actual schema:
 *   classes(id, title, category, budget, time_needed, taste,
 *           skill_level, meal_time, video_url, source_type,
 *           uploader_id, status, created_at)
 *   ingredients(id, name, is_user_submitted)
 *   class_ingredients(class_id, ingredient_id)
 *
 * Assumes db.js exports a mysql2/promise pool as `pool`.
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// Whitelist of filterable columns -> avoids building SQL from arbitrary keys
const FILTERABLE_FIELDS = [
    'category',
    'budget',
    'time_needed',
    'taste',
    'skill_level',
    'meal_time',
];

// ---------------------------------------------------------------------
// GET /api/classes - filtered class list
// ---------------------------------------------------------------------
router.get('/classes', async (req, res) => {
    try {
        const status = req.query.status || 'approved';

        let sql = `
            SELECT id, title, category, budget, time_needed, taste,
                   skill_level, meal_time, video_url, source_type,
                   uploader_id, status, created_at
            FROM classes
            WHERE status = ?
        `;
        const params = [status];

        for (const field of FILTERABLE_FIELDS) {
            if (req.query[field]) {
                sql += ` AND ${field} = ?`;
                params.push(req.query[field]);
            }
        }

        sql += ' ORDER BY created_at DESC';

        const [rows] = await pool.query(sql, params);
        return respond(res, true, 'Classes retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve classes.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/match-ingredients
// Body: { ingredients: string[], meal_time?: string, category?: string }
//   ingredients - names the user has on hand, e.g. ["Rice", "Onion", "Egg"]
// Returns approved classes ranked by how many of their required
// ingredients the user already has.
// ---------------------------------------------------------------------
router.post('/match-ingredients', async (req, res) => {
    const ingredientNames = Array.isArray(req.body.ingredients) ? req.body.ingredients : [];
    const mealTime = req.body.meal_time || null;
    const category = req.body.category || null;

    if (ingredientNames.length === 0) {
        return respond(res, false, 'ingredients (array of names) is required.', null, 400);
    }

    try {
        // 1. Resolve the given ingredient names to IDs (case-insensitive)
        const placeholders = ingredientNames.map(() => '?').join(',');
        const [ingredientRows] = await pool.query(
            `SELECT id, name FROM ingredients WHERE LOWER(name) IN (${placeholders})`,
            ingredientNames.map((n) => n.toLowerCase())
        );

        const matchedIds = ingredientRows.map((r) => r.id);

        if (matchedIds.length === 0) {
            return respond(res, true, 'None of the given ingredients are recognized yet.', []);
        }

        // 2. Score each approved class by how many of its required
        //    ingredients overlap with the ones the user has
        const idPlaceholders = matchedIds.map(() => '?').join(',');

        let sql = `
            SELECT
                c.id AS class_id,
                c.title,
                COUNT(ci.ingredient_id) AS total_required,
                SUM(CASE WHEN ci.ingredient_id IN (${idPlaceholders}) THEN 1 ELSE 0 END) AS match_count
            FROM classes c
            JOIN class_ingredients ci ON ci.class_id = c.id
            WHERE c.status = 'approved'
        `;
        const params = [...matchedIds];

        if (mealTime) {
            sql += ' AND c.meal_time = ?';
            params.push(mealTime);
        }
        if (category) {
            sql += ' AND c.category = ?';
            params.push(category);
        }

        sql += ' GROUP BY c.id, c.title ORDER BY match_count DESC, total_required ASC';

        const [rows] = await pool.query(sql, params);

        const matches = rows.map((row) => {
            const totalRequired = Number(row.total_required);
            const matchCount = Number(row.match_count);
            return {
                class_id: row.class_id,
                title: row.title,
                match_count: matchCount,
                total_required: totalRequired,
                match_score: totalRequired > 0 ? Math.round((matchCount / totalRequired) * 100) / 100 : 0,
            };
        });

        return respond(res, true, 'Matched classes retrieved.', matches);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to compute ingredient matches.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/add-ingredient
// Body: { name: string }
// Inserts a new ingredient (flagged is_user_submitted = true) if it
// doesn't already exist (case-insensitive check).
// ---------------------------------------------------------------------
router.post('/add-ingredient', async (req, res) => {
    const name = (req.body.name || '').trim();

    if (!name) {
        return respond(res, false, 'name is required.', null, 400);
    }

    try {
        const [existing] = await pool.query(
            'SELECT id, name FROM ingredients WHERE LOWER(name) = ?',
            [name.toLowerCase()]
        );

        if (existing.length > 0) {
            return respond(res, true, 'Ingredient already exists.', {
                id: existing[0].id,
                name: existing[0].name,
                created: false,
            });
        }

        const [result] = await pool.query(
            'INSERT INTO ingredients (name, is_user_submitted) VALUES (?, TRUE)',
            [name]
        );

        return respond(
            res,
            true,
            'Ingredient added.',
            { id: result.insertId, name, created: true },
            201
        );
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to add ingredient.', null, 500);
    }
});

module.exports = router;