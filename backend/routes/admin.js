/**
 * routes/admin.js
 * Owner: Divya (Member 2)
 *
 * Endpoints:
 *   GET  /api/admin/pending - moderation queue (classes awaiting review)
 *   POST /api/admin/review  - approve or reject a pending class
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// ---------------------------------------------------------------------
// GET /api/admin/pending - list classes with status = 'pending'
// ---------------------------------------------------------------------
router.get('/admin/pending', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT c.id, c.title, c.category, c.budget, c.time_needed, c.taste,
                    c.skill_level, c.meal_time, c.video_url, c.source_type,
                    c.created_at, u.id AS uploader_id, u.name AS uploader_name
             FROM classes c
             JOIN users u ON u.id = c.uploader_id
             WHERE c.status = 'pending'
             ORDER BY c.created_at ASC`
        );
        return respond(res, true, 'Pending classes retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve pending classes.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/admin/review
// Body: { class_id: number, decision: 'approve' | 'reject' }
// ---------------------------------------------------------------------
router.post('/admin/review', async (req, res) => {
    const classId = parseInt(req.body.class_id, 10);
    const decision = req.body.decision;

    if (!classId || !['approve', 'reject'].includes(decision)) {
        return respond(res, false, "class_id and decision ('approve' or 'reject') are required.", null, 400);
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [classRows] = await conn.query(
            'SELECT uploader_id, title, status FROM classes WHERE id = ?',
            [classId]
        );

        if (classRows.length === 0) {
            await conn.rollback();
            return respond(res, false, 'Class not found.', null, 404);
        }

        if (classRows[0].status !== 'pending') {
            await conn.rollback();
            return respond(res, false, 'This class has already been reviewed.', null, 409);
        }

        await conn.query('UPDATE classes SET status = ? WHERE id = ?', [newStatus, classId]);

        const { uploader_id: uploaderId, title } = classRows[0];
        const message = newStatus === 'approved'
            ? `Your class "${title}" was approved and is now live.`
            : `Your class "${title}" was rejected. Please review the submission guidelines.`;

        await conn.query(
            `INSERT INTO notifications (user_id, message, related_class_id)
             VALUES (?, ?, ?)`,
            [uploaderId, message, classId]
        );

        await conn.commit();
        return respond(res, true, `Class ${newStatus}.`, { class_id: classId, status: newStatus });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to process review decision.', null, 500);
    } finally {
        conn.release();
    }
});

module.exports = router;