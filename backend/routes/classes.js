/**
 * routes/classes.js
 * Owner: Divya (Member 2)
 *
 * Endpoints in this file so far:
 *   GET  /api/classes           - filtered class list          (Checkpoint 1)
 *   POST /api/match-ingredients - classes ranked by ingredient match (Checkpoint 2)
 *   POST /api/add-ingredient    - insert a new ingredient if missing (Checkpoint 2)
 *   POST /api/upload-class      - Contributor class submission  (Checkpoint 3)
 *   POST /api/like-class        - record a like + notify uploader (Checkpoint 3)
 *
 * Matches Pranathi's actual schema:
 *   classes(id, title, category, budget, time_needed, taste,
 *           skill_level, meal_time, video_url, source_type,
 *           uploader_id, status, created_at)
 *   ingredients(id, name, is_user_submitted)
 *   class_ingredients(class_id, ingredient_id)
 *   user_likes(user_id, class_id, liked_at)
 *   notifications(id, user_id, message, related_class_id, is_read, created_at)
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

const FILTERABLE_FIELDS = [
    'category',
    'budget',
    'time_needed',
    'taste',
    'skill_level',
    'meal_time',
];

// Helper: given a comma-separated string of names, find-or-create rows in
// `table` and link each to classId in `junctionTable`. Used for both
// ingredients and moods since the pattern is identical.
async function linkNamesToClass(conn, { rawNames, classId, table, idColumn, junctionTable, extraInsertCols = '', extraInsertVals = [] }) {
    const nameToId = {};
    if (!rawNames) return nameToId;
    const names = rawNames.split(',').map((n) => n.trim()).filter(Boolean);

    for (const name of names) {
        const [existing] = await conn.query(
            `SELECT id FROM ${table} WHERE LOWER(name) = ?`,
            [name.toLowerCase()]
        );

        let rowId;
        if (existing.length > 0) {
            rowId = existing[0].id;
        } else {
            const cols = extraInsertCols ? `name, ${extraInsertCols}` : 'name';
            const placeholders = extraInsertCols ? '?, ' + extraInsertVals.map(() => '?').join(', ') : '?';
            const [inserted] = await conn.query(
                `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
                extraInsertCols ? [name, ...extraInsertVals] : [name]
            );
            rowId = inserted.insertId;
        }

        await conn.query(
            `INSERT IGNORE INTO ${junctionTable} (class_id, ${idColumn}) VALUES (?, ?)`,
            [classId, rowId]
        );

        nameToId[name.toLowerCase()] = rowId;
    }

    return nameToId;
}

const VALID_CATEGORIES = ['gut_health', 'family', 'quick_no_stove', 'veg', 'nonveg_egg', 'seafood'];
const VALID_BUDGETS = ['low', 'medium', 'high'];
const VALID_TIME_NEEDED = ['quick', 'medium', 'long'];
const VALID_TASTES = ['spicy', 'sweet', 'neutral'];
const VALID_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_MEAL_TIMES = ['morning', 'afternoon', 'evening', 'night'];
const VALID_SOURCE_TYPES = ['native', 'youtube', 'external'];

// ---------------------------------------------------------------------
// GET /api/classes
// ---------------------------------------------------------------------
router.get('/classes', async (req, res) => {
    try {
        const status = req.query.status || 'approved';
        const mood = req.query.mood || null;
        const cuisine = req.query.cuisine || null;
        const search = req.query.search || null;
        const excludeAllergensFor = parseInt(req.query.exclude_allergens_for, 10) || null;

        let sql = `
            SELECT DISTINCT c.id, c.title, c.category, c.budget, c.time_needed, c.taste,
                   c.skill_level, c.meal_time, c.video_url, c.source_type,
                   c.prep_time_minutes, c.cook_time_minutes, c.servings,
                   c.uploader_id, c.status, c.created_at
            FROM classes c
        `;

        // Mood Kitchen: join in class_moods/moods only when filtering by mood
        if (mood) {
            sql += `
                JOIN class_moods cm ON cm.class_id = c.id
                JOIN moods m ON m.id = cm.mood_id AND LOWER(m.name) = ?
            `;
        }

        // Cuisine filter: same join pattern as mood
        if (cuisine) {
            sql += `
                JOIN class_cuisines ccu ON ccu.class_id = c.id
                JOIN cuisines cu ON cu.id = ccu.cuisine_id AND LOWER(cu.name) = ?
            `;
        }

        sql += ' WHERE c.status = ?';
        const params = [];
        if (mood) params.push(mood.toLowerCase());
        if (cuisine) params.push(cuisine.toLowerCase());
        params.push(status);

        for (const field of FILTERABLE_FIELDS) {
            if (req.query[field]) {
                sql += ` AND c.${field} = ?`;
                params.push(req.query[field]);
            }
        }

        if (search) {
            sql += ' AND c.title LIKE ?';
            params.push(`%${search}%`);
        }

        // Allergy safety: exclude any class containing an allergen this
        // user is allergic to, rather than just flagging it — a silent
        // warning is easy to miss, filtering it out isn't.
        if (excludeAllergensFor) {
            sql += `
                AND NOT EXISTS (
                    SELECT 1 FROM class_allergens ca
                    JOIN user_allergies ua ON ua.allergen_id = ca.allergen_id
                    WHERE ca.class_id = c.id AND ua.user_id = ?
                )
            `;
            params.push(excludeAllergensFor);
        }

        sql += ' ORDER BY c.created_at DESC';

        const [rows] = await pool.query(sql, params);
        return respond(res, true, 'Classes retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve classes.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/moods - list all moods, for building a mood picker in the UI
// ---------------------------------------------------------------------
router.get('/moods', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM moods ORDER BY name ASC');
        return respond(res, true, 'Moods retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve moods.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/allergens - list all allergens, for the class-upload allergen
// picker and for a user's own allergy selection form.
// ---------------------------------------------------------------------
router.get('/allergens', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM allergens ORDER BY name ASC');
        return respond(res, true, 'Allergens retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve allergens.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/cuisines - list all cuisines, for filtering and for the
// upload/preference forms.
// ---------------------------------------------------------------------
router.get('/cuisines', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM cuisines ORDER BY name ASC');
        return respond(res, true, 'Cuisines retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve cuisines.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/class-steps?class_id=3 - ordered step-by-step instructions
// ---------------------------------------------------------------------
router.get('/class-steps', async (req, res) => {
    const classId = parseInt(req.query.class_id, 10);

    if (!classId) {
        return respond(res, false, 'class_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            'SELECT step_number, instruction FROM class_steps WHERE class_id = ? ORDER BY step_number ASC',
            [classId]
        );
        return respond(res, true, 'Steps retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve steps.', null, 500);
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
// ---------------------------------------------------------------------
router.post('/upload-class', (req, res, next) => {
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
        moods: moodsRaw = '',
        allergens: allergensRaw = '',
        cuisines: cuisinesRaw = '',
        steps: stepsRaw = '',
        ingredient_quantities: ingredientQuantitiesRaw = '',
    } = req.body;

    const prepTimeMinutes = req.body.prep_time_minutes ? parseInt(req.body.prep_time_minutes, 10) : null;
    const cookTimeMinutes = req.body.cook_time_minutes ? parseInt(req.body.cook_time_minutes, 10) : null;
    const servings = req.body.servings ? parseInt(req.body.servings, 10) : null;

    const uploaderId = parseInt(req.body.uploader_id, 10);
    const cleanTitle = (title || '').trim();

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
                 meal_time, video_url, source_type, uploader_id, status,
                 prep_time_minutes, cook_time_minutes, servings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            [cleanTitle, category, budget, timeNeeded, taste, skillLevel, mealTime, videoUrl, sourceType, uploaderId, prepTimeMinutes, cookTimeMinutes, servings]
        );
        const classId = result.insertId;

        const ingredientNameToId = await linkNamesToClass(conn, {
            rawNames: ingredientsRaw,
            classId,
            table: 'ingredients',
            idColumn: 'ingredient_id',
            junctionTable: 'class_ingredients',
            extraInsertCols: 'is_user_submitted',
            extraInsertVals: [true],
        });

        // Optional quantities: ingredient_quantities is a JSON string like
        // {"Rice": {"quantity": 2, "unit": "cup"}, "Onion": {"quantity": 1, "unit": "whole"}}
        // Only ingredients also present in `ingredients` get an amount attached.
        if (ingredientQuantitiesRaw) {
            let parsedQuantities = {};
            try {
                parsedQuantities = JSON.parse(ingredientQuantitiesRaw);
            } catch (parseErr) {
                // Bad JSON isn't fatal to the whole upload — the ingredients
                // themselves are already linked; quantities are best-effort.
                parsedQuantities = {};
            }

            for (const [name, detail] of Object.entries(parsedQuantities)) {
                const ingredientId = ingredientNameToId[name.trim().toLowerCase()];
                if (!ingredientId || !detail) continue;

                const qty = detail.quantity !== undefined ? parseFloat(detail.quantity) : null;
                const unit = detail.unit ? String(detail.unit).trim() : null;

                await conn.query(
                    'UPDATE class_ingredients SET quantity = ?, unit = ? WHERE class_id = ? AND ingredient_id = ?',
                    [qty, unit, classId, ingredientId]
                );
            }
        }

        // Mood Kitchen: tag this class with moods (e.g. "comfort,celebration")
        await linkNamesToClass(conn, {
            rawNames: moodsRaw,
            classId,
            table: 'moods',
            idColumn: 'mood_id',
            junctionTable: 'class_moods',
        });

        // Allergy warnings: tag this class with any allergens it contains
        await linkNamesToClass(conn, {
            rawNames: allergensRaw,
            classId,
            table: 'allergens',
            idColumn: 'allergen_id',
            junctionTable: 'class_allergens',
        });

        // Cuisine tagging
        await linkNamesToClass(conn, {
            rawNames: cuisinesRaw,
            classId,
            table: 'cuisines',
            idColumn: 'cuisine_id',
            junctionTable: 'class_cuisines',
        });

        // Step-by-step instructions: pipe-separated, e.g.
        // "Boil the rice|Saute onions until golden|Mix and simmer for 10 min"
        if (stepsRaw) {
            const steps = stepsRaw.split('|').map((s) => s.trim()).filter(Boolean);
            let stepNumber = 1;
            for (const instruction of steps) {
                await conn.query(
                    'INSERT INTO class_steps (class_id, step_number, instruction) VALUES (?, ?, ?)',
                    [classId, stepNumber, instruction]
                );
                stepNumber += 1;
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

// ---------------------------------------------------------------------
// POST /api/like-class
// Body: { user_id: number, class_id: number }
// Records a like and drops a notification for the class's uploader.
// ---------------------------------------------------------------------
router.post('/like-class', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !classId) {
        return respond(res, false, 'user_id and class_id are required.', null, 400);
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query(
            'SELECT user_id FROM user_likes WHERE user_id = ? AND class_id = ?',
            [userId, classId]
        );

        if (existing.length > 0) {
            await conn.rollback();
            return respond(res, false, 'You already liked this class.', null, 409);
        }

        const [classRows] = await conn.query(
            'SELECT uploader_id, title FROM classes WHERE id = ?',
            [classId]
        );

        if (classRows.length === 0) {
            await conn.rollback();
            return respond(res, false, 'Class not found.', null, 404);
        }

        await conn.query(
            'INSERT INTO user_likes (user_id, class_id) VALUES (?, ?)',
            [userId, classId]
        );

        const { uploader_id: uploaderId, title } = classRows[0];

        // Don't notify someone liking their own class
        if (uploaderId && uploaderId !== userId) {
            await conn.query(
                'INSERT INTO notifications (user_id, message, related_class_id) VALUES (?, ?, ?)',
                [uploaderId, `Someone liked your class "${title}".`, classId]
            );
        }

        await conn.commit();
        return respond(res, true, 'Like recorded.', null, 201);
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return respond(res, false, 'Failed to record like.', null, 500);
    } finally {
        conn.release();
    }
});

module.exports = router;