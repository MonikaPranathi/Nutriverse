/**
 * routes/tips.js
 * Owner: Divya (Member 2)
 *
 * Cooking Tip of the Day — a rotating daily tip shown on the home page
 * after login.
 *
 * Endpoints:
 *   GET  /api/tip-of-the-day  - today's tip (same for everyone, all day)
 *   GET  /api/tips            - browse all tips, optional ?type= filter
 *   POST /api/tips            - add a new tip (admin/contributor)
 *
 * Requires: database/schema_v2_additions.sql
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

const VALID_TIP_TYPES = ['storage', 'fix_mistake', 'substitution', 'general'];

// ---------------------------------------------------------------------
// GET /api/tip-of-the-day
//
// Picks a tip deterministically from the date, so every user sees the
// same tip all day and it changes at midnight — without needing a cron
// job or a "current tip" column to update.
// ---------------------------------------------------------------------
router.get('/tip-of-the-day', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, tip_text, tip_type FROM cooking_tips WHERE is_active = TRUE ORDER BY id ASC'
        );

        if (rows.length === 0) {
            return respond(res, true, 'No tips available yet.', null);
        }

        // Days since epoch -> rotates once per day, wraps around the list
        const daysSinceEpoch = Math.floor(Date.now() / 86400000);
        const tip = rows[daysSinceEpoch % rows.length];

        return respond(res, true, 'Tip of the day retrieved.', {
            ...tip,
            date: new Date().toISOString().split('T')[0],
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve tip of the day.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/tips?type=storage
// ---------------------------------------------------------------------
router.get('/tips', async (req, res) => {
    const type = req.query.type || null;

    if (type && !VALID_TIP_TYPES.includes(type)) {
        return respond(res, false, `type must be one of: ${VALID_TIP_TYPES.join(', ')}`, null, 400);
    }

    try {
        let sql = 'SELECT id, tip_text, tip_type, created_at FROM cooking_tips WHERE is_active = TRUE';
        const params = [];

        if (type) {
            sql += ' AND tip_type = ?';
            params.push(type);
        }

        sql += ' ORDER BY created_at DESC';

        const [rows] = await pool.query(sql, params);
        return respond(res, true, 'Tips retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve tips.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/tips
// Body: { tip_text: string, tip_type?: string }
// ---------------------------------------------------------------------
router.post('/tips', async (req, res) => {
    const tipText = (req.body.tip_text || '').trim();
    const tipType = req.body.tip_type || 'general';

    if (!tipText) {
        return respond(res, false, 'tip_text is required.', null, 400);
    }
    if (tipText.length > 500) {
        return respond(res, false, 'tip_text must be 500 characters or fewer.', null, 400);
    }
    if (!VALID_TIP_TYPES.includes(tipType)) {
        return respond(res, false, `tip_type must be one of: ${VALID_TIP_TYPES.join(', ')}`, null, 400);
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO cooking_tips (tip_text, tip_type) VALUES (?, ?)',
            [tipText, tipType]
        );
        return respond(res, true, 'Tip added.', { id: result.insertId, tip_text: tipText, tip_type: tipType }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to add tip.', null, 500);
    }
});

module.exports = router;