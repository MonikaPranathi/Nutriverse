/**
 * routes/collections.js
 * Owner: Divya (Member 2)
 *
 * Endpoints:
 *   GET  /api/collections              - list curated collections
 *   POST /api/collections              - create a new collection
 *   GET  /api/collection-classes       - classes in a given collection
 *   POST /api/collection-classes       - add a class to a collection
 *   GET  /api/seasonal-ingredients     - ingredients in season this month
 *
 * Requires: database/schema_v3_additions.sql
 */

const express = require('express');
const pool = require('../db');

const router = express.Router();

function respond(res, success, message, data = null, httpCode = 200) {
    return res.status(httpCode).json({ success, message, data });
}

// ---------------------------------------------------------------------
// GET /api/collections
// ---------------------------------------------------------------------
router.get('/collections', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT rc.id, rc.name, rc.description, COUNT(cc.class_id) AS class_count
             FROM recipe_collections rc
             LEFT JOIN class_collections cc ON cc.collection_id = rc.id
             GROUP BY rc.id
             ORDER BY rc.name ASC`
        );
        return respond(res, true, 'Collections retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve collections.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/collections
// Body: { name, description? }
// ---------------------------------------------------------------------
router.post('/collections', async (req, res) => {
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim() || null;

    if (!name) {
        return respond(res, false, 'name is required.', null, 400);
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO recipe_collections (name, description) VALUES (?, ?)',
            [name, description]
        );
        return respond(res, true, 'Collection created.', { id: result.insertId, name, description }, 201);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return respond(res, false, 'A collection with that name already exists.', null, 409);
        }
        console.error(err);
        return respond(res, false, 'Failed to create collection.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/collection-classes?collection_id=1
// ---------------------------------------------------------------------
router.get('/collection-classes', async (req, res) => {
    const collectionId = parseInt(req.query.collection_id, 10);

    if (!collectionId) {
        return respond(res, false, 'collection_id is required.', null, 400);
    }

    try {
        const [collectionRows] = await pool.query(
            'SELECT id, name, description FROM recipe_collections WHERE id = ?',
            [collectionId]
        );

        if (collectionRows.length === 0) {
            return respond(res, false, 'Collection not found.', null, 404);
        }

        const [classes] = await pool.query(
            `SELECT c.id, c.title, c.category, c.meal_time, c.video_url, c.skill_level
             FROM class_collections cc
             JOIN classes c ON c.id = cc.class_id
             WHERE cc.collection_id = ? AND c.status = 'approved'
             ORDER BY c.created_at DESC`,
            [collectionId]
        );

        return respond(res, true, 'Collection classes retrieved.', {
            collection: collectionRows[0],
            classes,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve collection classes.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/collection-classes
// Body: { collection_id, class_id }
// ---------------------------------------------------------------------
router.post('/collection-classes', async (req, res) => {
    const collectionId = parseInt(req.body.collection_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!collectionId || !classId) {
        return respond(res, false, 'collection_id and class_id are required.', null, 400);
    }

    try {
        const [collectionRows] = await pool.query('SELECT id FROM recipe_collections WHERE id = ?', [collectionId]);
        if (collectionRows.length === 0) {
            return respond(res, false, 'Collection not found.', null, 404);
        }

        const [classRows] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
        if (classRows.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        const [result] = await pool.query(
            'INSERT IGNORE INTO class_collections (class_id, collection_id) VALUES (?, ?)',
            [classId, collectionId]
        );

        if (result.affectedRows === 0) {
            return respond(res, true, 'That class is already in this collection.', { created: false });
        }

        return respond(res, true, 'Class added to collection.', { created: true }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to add class to collection.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/seasonal-ingredients?month=9
// Defaults to the current month if not provided.
// ---------------------------------------------------------------------
router.get('/seasonal-ingredients', async (req, res) => {
    const month = parseInt(req.query.month, 10) || (new Date().getMonth() + 1);

    if (month < 1 || month > 12) {
        return respond(res, false, 'month must be between 1 and 12.', null, 400);
    }

    try {
        // FIND_IN_SET checks whether `month` appears in the comma-separated list
        const [rows] = await pool.query(
            `SELECT id, name, in_season_months
             FROM ingredients
             WHERE in_season_months IS NOT NULL AND FIND_IN_SET(?, in_season_months)
             ORDER BY name ASC`,
            [month]
        );
        return respond(res, true, 'Seasonal ingredients retrieved.', { month, ingredients: rows });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve seasonal ingredients.', null, 500);
    }
});

module.exports = router;