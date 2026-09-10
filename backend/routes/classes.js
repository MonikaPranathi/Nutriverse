/**
 * routes/classes.js
 * Owner: Divya (Member 2)
 *
 * Checkpoint 1 endpoint:
 *   GET /api/classes - filtered class list
 *
 * Updated to match the actual schema pushed by Pranathi:
 *   classes(id, title, category, budget, time_needed, taste,
 *           skill_level, meal_time, video_url, source_type,
 *           uploader_id, status, created_at)
 *
 * Filters supported (all optional query params):
 *   category, budget, time_needed, taste, skill_level, meal_time, status
 * status defaults to 'approved' so unmoderated content isn't public.
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

module.exports = router;