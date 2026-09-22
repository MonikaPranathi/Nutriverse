/**
 * routes/cookbooks.js
 * Owner: Divya (Member 2)
 *
 * Custom cookbooks — user-created, user-named collections. Different
 * from recipe_collections (v3), which are admin-curated themes.
 *
 * Endpoints:
 *   POST   /api/cookbooks           - create a cookbook
 *   GET    /api/cookbooks           - a user's cookbooks
 *   POST   /api/cookbook-classes    - add a class to a cookbook
 *   GET    /api/cookbook-classes    - classes in a cookbook
 *   DELETE /api/cookbook-classes    - remove a class from a cookbook
 *
 * Requires: database/schema_v4_additions.sql
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// ---------------------------------------------------------------------
// POST /api/cookbooks
// Body: { user_id, name, description? }
// ---------------------------------------------------------------------
router.post('/cookbooks', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim() || null;

    if (!userId || !name) {
        return respond(res, false, 'user_id and name are required.', null, 400);
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO user_cookbooks (user_id, name, description) VALUES (?, ?, ?)',
            [userId, name, description]
        );
        return respond(res, true, 'Cookbook created.', { id: result.insertId, name, description }, 201);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return respond(res, false, 'You already have a cookbook with that name.', null, 409);
        }
        console.error(err);
        return respond(res, false, 'Failed to create cookbook.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/cookbooks?user_id=1
// ---------------------------------------------------------------------
router.get('/cookbooks', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT uc.id, uc.name, uc.description, uc.created_at,
                    COUNT(cc.class_id) AS class_count
             FROM user_cookbooks uc
             LEFT JOIN cookbook_classes cc ON cc.cookbook_id = uc.id
             WHERE uc.user_id = ?
             GROUP BY uc.id
             ORDER BY uc.created_at DESC`,
            [userId]
        );
        return respond(res, true, 'Cookbooks retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve cookbooks.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/cookbook-classes
// Body: { user_id, cookbook_id, class_id }
// user_id must own the cookbook.
// ---------------------------------------------------------------------
router.post('/cookbook-classes', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const cookbookId = parseInt(req.body.cookbook_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !cookbookId || !classId) {
        return respond(res, false, 'user_id, cookbook_id, and class_id are required.', null, 400);
    }

    try {
        const [cookbookRows] = await pool.query(
            'SELECT id, user_id FROM user_cookbooks WHERE id = ?',
            [cookbookId]
        );

        if (cookbookRows.length === 0) {
            return respond(res, false, 'Cookbook not found.', null, 404);
        }
        if (cookbookRows[0].user_id !== userId) {
            return respond(res, false, 'You do not own this cookbook.', null, 403);
        }

        const [classRows] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
        if (classRows.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        const [result] = await pool.query(
            'INSERT IGNORE INTO cookbook_classes (cookbook_id, class_id) VALUES (?, ?)',
            [cookbookId, classId]
        );

        if (result.affectedRows === 0) {
            return respond(res, true, 'That class is already in this cookbook.', { created: false });
        }

        return respond(res, true, 'Class added to cookbook.', { created: true }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to add class to cookbook.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/cookbook-classes?cookbook_id=1
// ---------------------------------------------------------------------
router.get('/cookbook-classes', async (req, res) => {
    const cookbookId = parseInt(req.query.cookbook_id, 10);

    if (!cookbookId) {
        return respond(res, false, 'cookbook_id is required.', null, 400);
    }

    try {
        const [cookbookRows] = await pool.query(
            'SELECT id, name, description, user_id FROM user_cookbooks WHERE id = ?',
            [cookbookId]
        );

        if (cookbookRows.length === 0) {
            return respond(res, false, 'Cookbook not found.', null, 404);
        }

        const [classes] = await pool.query(
            `SELECT c.id, c.title, c.category, c.meal_time, c.video_url, cc.added_at
             FROM cookbook_classes cc
             JOIN classes c ON c.id = cc.class_id
             WHERE cc.cookbook_id = ?
             ORDER BY cc.added_at DESC`,
            [cookbookId]
        );

        return respond(res, true, 'Cookbook classes retrieved.', {
            cookbook: cookbookRows[0],
            classes,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve cookbook classes.', null, 500);
    }
});

// ---------------------------------------------------------------------
// DELETE /api/cookbook-classes
// Body: { user_id, cookbook_id, class_id }
// ---------------------------------------------------------------------
router.delete('/cookbook-classes', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const cookbookId = parseInt(req.body.cookbook_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !cookbookId || !classId) {
        return respond(res, false, 'user_id, cookbook_id, and class_id are required.', null, 400);
    }

    try {
        const [cookbookRows] = await pool.query(
            'SELECT user_id FROM user_cookbooks WHERE id = ?',
            [cookbookId]
        );

        if (cookbookRows.length === 0) {
            return respond(res, false, 'Cookbook not found.', null, 404);
        }
        if (cookbookRows[0].user_id !== userId) {
            return respond(res, false, 'You do not own this cookbook.', null, 403);
        }

        const [result] = await pool.query(
            'DELETE FROM cookbook_classes WHERE cookbook_id = ? AND class_id = ?',
            [cookbookId, classId]
        );

        if (result.affectedRows === 0) {
            return respond(res, false, 'That class was not in this cookbook.', null, 404);
        }

        return respond(res, true, 'Class removed from cookbook.');
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to remove class from cookbook.', null, 500);
    }
});

module.exports = router;