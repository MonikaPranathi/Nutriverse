/**
 * routes/admin.js
 * Owner: Divya (Member 2)
 *
 * Endpoints:
 *   GET  /api/admin/pending - moderation queue (classes awaiting review)
 *   POST /api/admin/review  - approve or reject a pending class
 *
 * Matches Pranathi's actual schema:
 *   classes(id, title, category, budget, time_needed, taste,
 *           skill_level, meal_time, video_url, source_type,
 *           uploader_id, status, created_at)
 *   users(id, name, email, password, role, created_at)
 *   notifications(id, user_id, message, related_class_id, is_read, created_at)
 *
 * Assumes db.js exports a mysql2/promise pool as `pool`.
 *
 * ============================================================
 * IMPORTANT — read before relying on this for real security
 * ============================================================
 * requireAdmin below closes the *functional* gap (there was no
 * check at all before), but it is NOT cryptographically secure.
 * auth.js currently has no session/token system — login just
 * returns { id, name, role } with nothing to prove the caller
 * actually IS that user on later requests. So this middleware
 * trusts whatever admin_id the client sends, the same way every
 * other endpoint in this codebase trusts whatever user_id it's
 * given. Anyone who knows or guesses an admin's user id can pass
 * it and get through.
 *
 * This is fine for a class project demo, but before this is
 * anything real: add a session token (or JWT) issued at login in
 * auth.js, send it in an Authorization header, and have this
 * middleware verify the token instead of trusting a raw id. That's
 * a decision for the whole team / Pranathi's auth.js, not something
 * to bolt on silently here.
 * ============================================================
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// Reads admin_id from the body (POST) or query string (GET), and checks
// that user's role in the DB. See the big warning above before assuming
// this is secure against a malicious client.
async function requireAdmin(req, res, next) {
    const adminId = parseInt((req.body && req.body.admin_id) || req.query.admin_id, 10);

    if (!adminId) {
        return respond(res, false, 'admin_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [adminId]);

        if (rows.length === 0) {
            return respond(res, false, 'admin_id does not match any user.', null, 401);
        }
        if (rows[0].role !== 'admin') {
            return respond(res, false, 'This action requires an admin account.', null, 403);
        }

        next();
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to verify admin access.', null, 500);
    }
}

// ---------------------------------------------------------------------
// GET /api/admin/pending?admin_id=1 - list classes with status = 'pending'
// ---------------------------------------------------------------------
router.get('/admin/pending', requireAdmin, async (req, res) => {
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
// Body: { admin_id, class_id, decision: 'approve' | 'reject' }
// Notifies the uploader of the outcome.
// ---------------------------------------------------------------------
router.post('/admin/review', requireAdmin, async (req, res) => {
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