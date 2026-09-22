/**
 * routes/profile.js
 * Owner: Divya (Member 2) — covering profile/health scope
 *
 * Endpoints:
 *   GET  /api/profile                - a user's profile + health fields
 *   POST /api/profile                - update profile/health fields
 *   GET  /api/dietary-options        - all preferences + allergens (for dropdowns)
 *   POST /api/dietary-preferences    - set a user's dietary preferences
 *   GET  /api/dietary-preferences    - a user's dietary preferences
 *   POST /api/allergies              - set a user's allergies
 *   GET  /api/allergies              - a user's allergies
 *   POST /api/body-metrics           - log a new weight/BMI entry
 *   GET  /api/body-metrics           - a user's metric history
 *
 * Requires: database/schema_v3_additions.sql
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

const VALID_GENDERS = ['male', 'female', 'other'];
const VALID_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const VALID_GOALS = ['weight_loss', 'maintenance', 'muscle_gain', 'diabetes_management', 'general_health'];
const VALID_SPICE_TOLERANCE = ['mild', 'medium', 'hot', 'extra_hot'];

// Fields the client is allowed to update via POST /api/profile
const EDITABLE_PROFILE_FIELDS = [
    'age', 'gender', 'height_cm', 'weight_kg', 'activity_level', 'goal', 'spice_tolerance',
];

// ---------------------------------------------------------------------
// GET /api/profile?user_id=1
// ---------------------------------------------------------------------
router.get('/profile', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, name, email, role, age, gender, height_cm, weight_kg,
                    activity_level, goal, spice_tolerance, created_at
             FROM users WHERE id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return respond(res, false, 'User not found.', null, 404);
        }

        return respond(res, true, 'Profile retrieved.', rows[0]);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve profile.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/profile
// Body: { user_id, age?, gender?, height_cm?, weight_kg?, activity_level?, goal?, spice_tolerance? }
// Only the fields provided are updated; everything else is left as-is.
// ---------------------------------------------------------------------
router.post('/profile', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    if (req.body.gender && !VALID_GENDERS.includes(req.body.gender)) {
        return respond(res, false, `gender must be one of: ${VALID_GENDERS.join(', ')}`, null, 400);
    }
    if (req.body.activity_level && !VALID_ACTIVITY_LEVELS.includes(req.body.activity_level)) {
        return respond(res, false, `activity_level must be one of: ${VALID_ACTIVITY_LEVELS.join(', ')}`, null, 400);
    }
    if (req.body.goal && !VALID_GOALS.includes(req.body.goal)) {
        return respond(res, false, `goal must be one of: ${VALID_GOALS.join(', ')}`, null, 400);
    }
    if (req.body.spice_tolerance && !VALID_SPICE_TOLERANCE.includes(req.body.spice_tolerance)) {
        return respond(res, false, `spice_tolerance must be one of: ${VALID_SPICE_TOLERANCE.join(', ')}`, null, 400);
    }
    if (req.body.age !== undefined && (req.body.age < 0 || req.body.age > 120)) {
        return respond(res, false, 'age must be between 0 and 120.', null, 400);
    }

    const updates = [];
    const params = [];
    for (const field of EDITABLE_PROFILE_FIELDS) {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(req.body[field]);
        }
    }

    if (updates.length === 0) {
        return respond(res, false, 'No profile fields provided to update.', null, 400);
    }

    params.push(userId);

    try {
        const [result] = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return respond(res, false, 'User not found.', null, 404);
        }

        return respond(res, true, 'Profile updated.', { user_id: userId, updated_fields: Object.keys(req.body).filter((f) => EDITABLE_PROFILE_FIELDS.includes(f)) });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to update profile.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/dietary-options
// Lists all available dietary preferences and allergens, for building
// the selection UI at signup/profile-edit time.
// ---------------------------------------------------------------------
router.get('/dietary-options', async (req, res) => {
    try {
        const [preferences] = await pool.query('SELECT id, name FROM dietary_preferences ORDER BY name ASC');
        const [allergens] = await pool.query('SELECT id, name FROM allergens ORDER BY name ASC');
        return respond(res, true, 'Dietary options retrieved.', { preferences, allergens });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve dietary options.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/dietary-preferences
// Body: { user_id, preferences: string[] }
// Replaces the user's full set of preferences with the given list.
// ---------------------------------------------------------------------
router.post('/dietary-preferences', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const preferenceNames = Array.isArray(req.body.preferences) ? req.body.preferences : null;

    if (!userId || !preferenceNames) {
        return respond(res, false, 'user_id and preferences (array) are required.', null, 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query('DELETE FROM user_dietary_preferences WHERE user_id = ?', [userId]);

        for (const name of preferenceNames) {
            const [rows] = await conn.query(
                'SELECT id FROM dietary_preferences WHERE LOWER(name) = ?',
                [String(name).trim().toLowerCase()]
            );
            if (rows.length > 0) {
                await conn.query(
                    'INSERT IGNORE INTO user_dietary_preferences (user_id, preference_id) VALUES (?, ?)',
                    [userId, rows[0].id]
                );
            }
        }

        await conn.commit();
        return respond(res, true, 'Dietary preferences updated.', { user_id: userId, preferences: preferenceNames });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to update dietary preferences.', null, 500);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------
// GET /api/dietary-preferences?user_id=1
// ---------------------------------------------------------------------
router.get('/dietary-preferences', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT p.id, p.name
             FROM user_dietary_preferences up
             JOIN dietary_preferences p ON p.id = up.preference_id
             WHERE up.user_id = ?
             ORDER BY p.name ASC`,
            [userId]
        );
        return respond(res, true, 'Dietary preferences retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve dietary preferences.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/allergies
// Body: { user_id, allergies: string[] }
// Replaces the user's full set of allergies with the given list.
// ---------------------------------------------------------------------
router.post('/allergies', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const allergyNames = Array.isArray(req.body.allergies) ? req.body.allergies : null;

    if (!userId || !allergyNames) {
        return respond(res, false, 'user_id and allergies (array) are required.', null, 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query('DELETE FROM user_allergies WHERE user_id = ?', [userId]);

        for (const name of allergyNames) {
            const [rows] = await conn.query(
                'SELECT id FROM allergens WHERE LOWER(name) = ?',
                [String(name).trim().toLowerCase()]
            );
            if (rows.length > 0) {
                await conn.query(
                    'INSERT IGNORE INTO user_allergies (user_id, allergen_id) VALUES (?, ?)',
                    [userId, rows[0].id]
                );
            }
        }

        await conn.commit();
        return respond(res, true, 'Allergies updated.', { user_id: userId, allergies: allergyNames });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to update allergies.', null, 500);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------
// GET /api/allergies?user_id=1
// ---------------------------------------------------------------------
router.get('/allergies', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT a.id, a.name
             FROM user_allergies ua
             JOIN allergens a ON a.id = ua.allergen_id
             WHERE ua.user_id = ?
             ORDER BY a.name ASC`,
            [userId]
        );
        return respond(res, true, 'Allergies retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve allergies.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/body-metrics
// Body: { user_id, weight_kg, height_cm?, body_fat_pct? }
// Computes BMI automatically if height is available (either passed in
// or already on the user's profile).
// ---------------------------------------------------------------------
router.post('/body-metrics', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const weightKg = parseFloat(req.body.weight_kg);
    const bodyFatPct = req.body.body_fat_pct !== undefined ? parseFloat(req.body.body_fat_pct) : null;
    let heightCm = req.body.height_cm !== undefined ? parseFloat(req.body.height_cm) : null;

    if (!userId || !weightKg || weightKg <= 0) {
        return respond(res, false, 'user_id and a positive weight_kg are required.', null, 400);
    }

    try {
        if (!heightCm) {
            const [userRows] = await pool.query('SELECT height_cm FROM users WHERE id = ?', [userId]);
            if (userRows.length === 0) {
                return respond(res, false, 'User not found.', null, 404);
            }
            heightCm = userRows[0].height_cm;
        }

        let bmi = null;
        if (heightCm) {
            const heightM = heightCm / 100;
            bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
        }

        const [result] = await pool.query(
            `INSERT INTO user_body_metrics (user_id, weight_kg, height_cm, bmi, body_fat_pct)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, weightKg, heightCm, bmi, bodyFatPct]
        );

        return respond(res, true, 'Body metrics logged.', {
            id: result.insertId,
            weight_kg: weightKg,
            height_cm: heightCm,
            bmi,
            body_fat_pct: bodyFatPct,
        }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to log body metrics.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/body-metrics?user_id=1
// ---------------------------------------------------------------------
router.get('/body-metrics', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, weight_kg, height_cm, bmi, body_fat_pct, recorded_at
             FROM user_body_metrics
             WHERE user_id = ?
             ORDER BY recorded_at ASC`,
            [userId]
        );
        return respond(res, true, 'Body metrics history retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve body metrics.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/cuisine-preferences
// Body: { user_id, cuisines: string[] }
// Replaces the user's full set of preferred cuisines with the given list.
// ---------------------------------------------------------------------
router.post('/cuisine-preferences', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const cuisineNames = Array.isArray(req.body.cuisines) ? req.body.cuisines : null;

    if (!userId || !cuisineNames) {
        return respond(res, false, 'user_id and cuisines (array) are required.', null, 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query('DELETE FROM user_cuisine_preferences WHERE user_id = ?', [userId]);

        for (const name of cuisineNames) {
            const [rows] = await conn.query(
                'SELECT id FROM cuisines WHERE LOWER(name) = ?',
                [String(name).trim().toLowerCase()]
            );
            if (rows.length > 0) {
                await conn.query(
                    'INSERT IGNORE INTO user_cuisine_preferences (user_id, cuisine_id) VALUES (?, ?)',
                    [userId, rows[0].id]
                );
            }
        }

        await conn.commit();
        return respond(res, true, 'Cuisine preferences updated.', { user_id: userId, cuisines: cuisineNames });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to update cuisine preferences.', null, 500);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------
// GET /api/cuisine-preferences?user_id=1
// ---------------------------------------------------------------------
router.get('/cuisine-preferences', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT cu.id, cu.name
             FROM user_cuisine_preferences ucp
             JOIN cuisines cu ON cu.id = ucp.cuisine_id
             WHERE ucp.user_id = ?
             ORDER BY cu.name ASC`,
            [userId]
        );
        return respond(res, true, 'Cuisine preferences retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve cuisine preferences.', null, 500);
    }
});

module.exports = router;