/**
 * routes/planner.js
 * Owner: Divya (Member 2)
 *
 * Endpoints:
 *   POST   /api/meal-plan     - add/update a planned meal for a date+slot
 *   GET    /api/meal-plan     - a user's plan for a date range
 *   DELETE /api/meal-plan     - remove a planned meal
 *   GET    /api/shopping-list - aggregated ingredient list for a date range
 *
 * Requires: database/schema_v3_additions.sql, database/schema_v5_additions.sql
 *
 * Ingredient amounts come from class_ingredients.quantity/unit (added in
 * v5). Classes uploaded before v5, or without quantities filled in, show
 * "amount not specified" instead of a number — see /api/shopping-list.
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

const VALID_MEAL_TIMES = ['morning', 'afternoon', 'evening', 'night'];

// ---------------------------------------------------------------------
// POST /api/meal-plan
// Body: { user_id, plan_date (YYYY-MM-DD), meal_time, class_id }
// Overwrites whatever was already planned for that user+date+slot.
// ---------------------------------------------------------------------
router.post('/meal-plan', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);
    const planDate = req.body.plan_date;
    const mealTime = req.body.meal_time;

    if (!userId || !classId || !planDate || !mealTime) {
        return respond(res, false, 'user_id, class_id, plan_date, and meal_time are required.', null, 400);
    }
    if (!VALID_MEAL_TIMES.includes(mealTime)) {
        return respond(res, false, `meal_time must be one of: ${VALID_MEAL_TIMES.join(', ')}`, null, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
        return respond(res, false, 'plan_date must be in YYYY-MM-DD format.', null, 400);
    }

    try {
        const [classRows] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
        if (classRows.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        await pool.query(
            `INSERT INTO meal_plans (user_id, plan_date, meal_time, class_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE class_id = VALUES(class_id)`,
            [userId, planDate, mealTime, classId]
        );

        return respond(res, true, 'Meal plan saved.', { user_id: userId, plan_date: planDate, meal_time: mealTime, class_id: classId }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to save meal plan.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/meal-plan?user_id=1&start_date=2026-09-15&end_date=2026-09-21
// ---------------------------------------------------------------------
router.get('/meal-plan', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    if (!userId || !startDate || !endDate) {
        return respond(res, false, 'user_id, start_date, and end_date are required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT mp.plan_date, mp.meal_time, c.id AS class_id, c.title, c.category, c.video_url
             FROM meal_plans mp
             JOIN classes c ON c.id = mp.class_id
             WHERE mp.user_id = ? AND mp.plan_date BETWEEN ? AND ?
             ORDER BY mp.plan_date ASC, FIELD(mp.meal_time, 'morning','afternoon','evening','night')`,
            [userId, startDate, endDate]
        );
        return respond(res, true, 'Meal plan retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve meal plan.', null, 500);
    }
});

// ---------------------------------------------------------------------
// DELETE /api/meal-plan
// Body: { user_id, plan_date, meal_time }
// ---------------------------------------------------------------------
router.delete('/meal-plan', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const planDate = req.body.plan_date;
    const mealTime = req.body.meal_time;

    if (!userId || !planDate || !mealTime) {
        return respond(res, false, 'user_id, plan_date, and meal_time are required.', null, 400);
    }

    try {
        const [result] = await pool.query(
            'DELETE FROM meal_plans WHERE user_id = ? AND plan_date = ? AND meal_time = ?',
            [userId, planDate, mealTime]
        );

        if (result.affectedRows === 0) {
            return respond(res, false, 'No meal plan entry found for that date and slot.', null, 404);
        }

        return respond(res, true, 'Meal plan entry removed.');
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to remove meal plan entry.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/shopping-list?user_id=1&start_date=2026-09-15&end_date=2026-09-21
//
// Aggregates ingredients across every planned meal in the range. When a
// class has quantity/unit data, amounts are summed per (ingredient, unit)
// pair — different units for the same ingredient (e.g. "cups" from one
// recipe, "grams" from another) can't be safely added together, so they
// show as separate lines rather than a wrong combined number. Ingredients
// with no quantity recorded show as "amount not specified".
// ---------------------------------------------------------------------
router.get('/shopping-list', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    if (!userId || !startDate || !endDate) {
        return respond(res, false, 'user_id, start_date, and end_date are required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT i.id, i.name, ci.unit,
                    SUM(ci.quantity) AS total_quantity,
                    SUM(CASE WHEN ci.quantity IS NULL THEN 1 ELSE 0 END) AS unspecified_count,
                    GROUP_CONCAT(DISTINCT c.title ORDER BY c.title SEPARATOR ', ') AS needed_for
             FROM meal_plans mp
             JOIN classes c ON c.id = mp.class_id
             JOIN class_ingredients ci ON ci.class_id = c.id
             JOIN ingredients i ON i.id = ci.ingredient_id
             WHERE mp.user_id = ? AND mp.plan_date BETWEEN ? AND ?
             GROUP BY i.id, i.name, ci.unit
             ORDER BY i.name ASC`,
            [userId, startDate, endDate]
        );

        const shoppingList = rows.map((row) => {
            const hasAnyQuantity = row.total_quantity !== null;
            return {
                ingredient_id: row.id,
                name: row.name,
                amount: hasAnyQuantity
                    ? `${row.total_quantity}${row.unit ? ' ' + row.unit : ''}`
                    : 'amount not specified',
                partially_unspecified: hasAnyQuantity && Number(row.unspecified_count) > 0,
                needed_for: row.needed_for.split(', '),
            };
        });

        return respond(res, true, 'Shopping list generated.', {
            user_id: userId,
            start_date: startDate,
            end_date: endDate,
            item_count: shoppingList.length,
            items: shoppingList,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to generate shopping list.', null, 500);
    }
});

module.exports = router;