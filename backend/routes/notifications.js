/**
 * routes/notifications.js
 * Owner: Divya (Member 2)
 *
 * Endpoint:
 *   GET /api/notifications?user_id=123 - unread notifications for a user
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// ---------------------------------------------------------------------
// GET /api/notifications - unread notifications for a user
// ---------------------------------------------------------------------
router.get('/notifications', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT id, message, related_class_id, is_read, created_at
             FROM notifications
             WHERE user_id = ? AND is_read = FALSE
             ORDER BY created_at DESC`,
            [userId]
        );
        return respond(res, true, 'Unread notifications retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve notifications.', null, 500);
    }
});

module.exports = router;