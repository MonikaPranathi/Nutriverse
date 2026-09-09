/**
 * routes/classes.js
 * Owner: Divya (Member 2)
 *
 * Endpoints in this file so far:
 *   GET  /api/classes           - filtered class list          (Checkpoint 1)
 *   POST /api/match-ingredients - classes ranked by ingredient match (Checkpoint 2)
 *   POST /api/add-ingredient    - insert a new ingredient if missing (Checkpoint 2)
 *   POST /api/upload-class      - Contributor class submission  (Checkpoint 3)
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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
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

// Values must match the schema's ENUM definitions exactly
const VALID_CATEGORIES = ['gut_health', 'family', 'quick_no_stove', 'veg', 'nonveg_egg', 'seafood'];
const VALID_BUDGETS = ['low', 'medium', 'high'];
const VALID_TIME_NEEDED = ['quick', 'medium', 'long'];
const VALID_TASTES = ['spicy', 'sweet', 'neutral'];
const VALID_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_MEAL_TIMES = ['morning', 'afternoon', 'evening', 'night'];
const VALID_SOURCE_TYPES = ['native', 'youtube', 'external'];

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
// ---------------------------------------------------------------------
router.post('/match-ingredients', async (req, res) => {
    const ingredientNames = Array.isArray(req.body.ingredients) ? req.body.ingredients : [];
    const mealTime = req.body.meal_time || null;
    const category = req.body.category || null;

    if (ingredientNames.length === 0) {
        return respond(res, false, 'ingredients (array of names) is required.', null, 400);
    }

    try {
        const placeholders = ingredientNames.map(() => '?').join(',');
        const [ingredientRows] = await pool.query(
            `SELECT id, name FROM ingredients WHERE LOWER(name) IN (${placeholders})`,
            ingredientNames.map((n) => n.toLowerCase())
        );

        const matchedIds = ingredientRows.map((r) => r.id);

        if (matchedIds.length === 0) {
            return respond(res, true, 'None of the given ingredients are recognized yet.', []);
        }

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

// ---------------------------------------------------------------------
// Multer setup — only used when source_type = 'native'
// ---------------------------------------------------------------------
const uploadDir = path.join(__dirname, '..', 'uploads', 'classes');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_BYTES = 100 * 1024 * 1024; // 100MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `class_${randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Unsupported video format. Use mp4, mov, or webm.'));
        }
        cb(null, true);
    },
});

// ---------------------------------------------------------------------
// POST /api/upload-class
//
// If source_type = 'native': multipart/form-data with a `video` file field.
// If source_type = 'youtube' | 'external': JSON or form body with a
//   `video_url` string field, no file needed.
//
// Common fields (form or JSON):
//   title, category, budget, time_needed, taste, skill_level,
//   meal_time, uploader_id, source_type, ingredients (comma-separated
//   names, optional)
// ---------------------------------------------------------------------
router.post('/upload-class', (req, res, next) => {
    // Multer only actually needs to run for native (file) uploads, but it's
    // harmless to run for all multipart requests — it just won't find a file
    // for youtube/external submissions sent as multipart too.
    upload.single('video')(req, res, (err) => {
        if (err) {
            return respond(res, false, err.message, null, 400);
        }
        next();
    });
}, async (req, res) => {
    const {
        title,
        category,
        budget = 'low',
        time_needed: timeNeeded = 'quick',
        taste = 'neutral',
        skill_level: skillLevel = 'beginner',
        meal_time: mealTime = 'morning',
        source_type: sourceType = 'native',
        ingredients: ingredientsRaw = '',
    } = req.body;

    const uploaderId = parseInt(req.body.uploader_id, 10);
    const cleanTitle = (title || '').trim();

    // --- Validation -----------------------------------------------------
    if (!uploaderId || !cleanTitle) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, 'uploader_id and title are required.', null, 400);
    }
    if (!VALID_CATEGORIES.includes(category)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, `category must be one of: ${VALID_CATEGORIES.join(', ')}`, null, 400);
    }
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, `source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`, null, 400);
    }
    if (budget && !VALID_BUDGETS.includes(budget)) {
        return respond(res, false, `budget must be one of: ${VALID_BUDGETS.join(', ')}`, null, 400);
    }
    if (timeNeeded && !VALID_TIME_NEEDED.includes(timeNeeded)) {
        return respond(res, false, `time_needed must be one of: ${VALID_TIME_NEEDED.join(', ')}`, null, 400);
    }
    if (taste && !VALID_TASTES.includes(taste)) {
        return respond(res, false, `taste must be one of: ${VALID_TASTES.join(', ')}`, null, 400);
    }
    if (skillLevel && !VALID_SKILL_LEVELS.includes(skillLevel)) {
        return respond(res, false, `skill_level must be one of: ${VALID_SKILL_LEVELS.join(', ')}`, null, 400);
    }
    if (mealTime && !VALID_MEAL_TIMES.includes(mealTime)) {
        return respond(res, false, `meal_time must be one of: ${VALID_MEAL_TIMES.join(', ')}`, null, 400);
    }

    // --- Resolve the video URL -------------------------------------------
    let videoUrl;
    if (sourceType === 'native') {
        if (!req.file) {
            return respond(res, false, 'A video file is required when source_type is "native".', null, 400);
        }
        videoUrl = path.join('uploads', 'classes', req.file.filename).replace(/\\/g, '/');
    } else {
        const providedUrl = (req.body.video_url || '').trim();
        if (!providedUrl) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return respond(res, false, 'video_url is required when source_type is "youtube" or "external".', null, 400);
        }
        videoUrl = providedUrl;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            `INSERT INTO classes
                (title, category, budget, time_needed, taste, skill_level,
                 meal_time, video_url, source_type, uploader_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [cleanTitle, category, budget, timeNeeded, taste, skillLevel, mealTime, videoUrl, sourceType, uploaderId]
        );
        const classId = result.insertId;

        if (ingredientsRaw) {
            const names = ingredientsRaw
                .split(',')
                .map((n) => n.trim())
                .filter(Boolean);

            for (const name of names) {
                const [existingIngredient] = await conn.query(
                    'SELECT id FROM ingredients WHERE LOWER(name) = ?',
                    [name.toLowerCase()]
                );

                let ingredientId;
                if (existingIngredient.length > 0) {
                    ingredientId = existingIngredient[0].id;
                } else {
                    const [inserted] = await conn.query(
                        'INSERT INTO ingredients (name, is_user_submitted) VALUES (?, TRUE)',
                        [name]
                    );
                    ingredientId = inserted.insertId;
                }

                await conn.query(
                    'INSERT IGNORE INTO class_ingredients (class_id, ingredient_id) VALUES (?, ?)',
                    [classId, ingredientId]
                );
            }
        }

        await conn.commit();
        return respond(res, true, 'Class submitted and pending review.', { class_id: classId }, 201);
    } catch (err) {
        await conn.rollback();
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error(err);
        return respond(res, false, 'Upload failed while saving to the database.', null, 500);
    } finally {
        conn.release();
    }
});

module.exports = router;