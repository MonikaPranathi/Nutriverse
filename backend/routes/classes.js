 /**
 * routes/classes.js
 * Owner: Divya (Member 2)
 *
 * Endpoints:
 *   GET  /api/classes
 *   POST /api/match-ingredients
 *   POST /api/add-ingredient
 *   POST /api/upload-class
 *   POST /api/like-class
 *   GET  /api/classes/:id
 *   GET  /api/my-uploads
 *   GET  /api/liked-classes
 *   PATCH /api/classes/:id
 *
 * Matches the Nutriverse database schema.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const pool = require('../db');

const router = express.Router();

function respond(
    res,
    success,
    message,
    data = null,
    httpCode = 200
) {
    return res.status(httpCode).json({
        success,
        message,
        data,
    });
}

const FILTERABLE_FIELDS = [
    'category',
    'time_needed',
    'taste',
    'skill_level',
    'meal_time',
];

// ---------------------------------------------------------------------
// Helper: find/create names and connect them to a class
// ---------------------------------------------------------------------
async function linkNamesToClass(
    conn,
    {
        rawNames,
        classId,
        table,
        idColumn,
        junctionTable,
        extraInsertCols = '',
        extraInsertVals = [],
    }
) {
    const nameToId = {};

    if (!rawNames) {
        return nameToId;
    }

    const names = rawNames
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);

    for (const name of names) {
        const [existing] = await conn.query(
            `SELECT id
             FROM ${table}
             WHERE LOWER(name) = ?`,
            [name.toLowerCase()]
        );

        let rowId;

        if (existing.length > 0) {
            rowId = existing[0].id;
        } else {
            const cols = extraInsertCols
                ? `name, ${extraInsertCols}`
                : 'name';

            const placeholders = extraInsertCols
                ? '?, ' +
                  extraInsertVals
                      .map(() => '?')
                      .join(', ')
                : '?';

            const [inserted] = await conn.query(
                `INSERT INTO ${table} (${cols})
                 VALUES (${placeholders})`,
                extraInsertCols
                    ? [name, ...extraInsertVals]
                    : [name]
            );

            rowId = inserted.insertId;
        }

        await conn.query(
            `INSERT IGNORE INTO ${junctionTable}
                (class_id, ${idColumn})
             VALUES (?, ?)`,
            [classId, rowId]
        );

        nameToId[name.toLowerCase()] = rowId;
    }

    return nameToId;
}

// ---------------------------------------------------------------------
// Valid values
// ---------------------------------------------------------------------

const VALID_CATEGORIES = [
    'gut_health',
    'family',
    'quick_no_stove',
    'veg',
    'nonveg_egg',
    'seafood',
    'drinks',
    'desserts',
];

const VALID_TIME_NEEDED = [
    'quick',
    'medium',
    'long',
];

const VALID_TASTES = [
    'spicy',
    'sweet',
    'neutral',
];

const VALID_SKILL_LEVELS = [
    'beginner',
    'intermediate',
    'advanced',
];

const VALID_MEAL_TIMES = [
    'morning',
    'afternoon',
    'evening',
    'night',
];

const VALID_SOURCE_TYPES = [
    'native',
    'youtube',
    'external',
];

// ---------------------------------------------------------------------
// GET /api/classes
// ---------------------------------------------------------------------

router.get('/classes', async (req, res) => {
    try {
        const status =
            req.query.status || 'approved';

        const mood =
            req.query.mood || null;

        const cuisine =
            req.query.cuisine || null;

        const search =
            req.query.search || null;

        const excludeAllergensFor =
            parseInt(
                req.query.exclude_allergens_for,
                10
            ) || null;

        let sql = `
            SELECT DISTINCT
                c.id,
                c.title,
                c.category,
                c.time_needed,
                c.taste,
                c.skill_level,
                c.meal_time,
                c.video_url,
                c.image_url,
                c.source_type,
                c.prep_time_minutes,
                c.cook_time_minutes,
                c.servings,
                c.uploader_id,
                c.status,
                c.created_at
            FROM classes c
        `;

        // Mood filter
        if (mood) {
            sql += `
                JOIN class_moods cm
                    ON cm.class_id = c.id
                JOIN moods m
                    ON m.id = cm.mood_id
                    AND LOWER(m.name) = ?
            `;
        }

        // Cuisine filter
        if (cuisine) {
            sql += `
                JOIN class_cuisines ccu
                    ON ccu.class_id = c.id
                JOIN cuisines cu
                    ON cu.id = ccu.cuisine_id
                    AND LOWER(cu.name) = ?
            `;
        }

        sql += `
            WHERE c.status = ?
        `;

        const params = [];

        if (mood) {
            params.push(
                mood.toLowerCase()
            );
        }

        if (cuisine) {
            params.push(
                cuisine.toLowerCase()
            );
        }

        params.push(status);

        // -------------------------------------------------------------
        // Filters
        // -------------------------------------------------------------

        for (const field of FILTERABLE_FIELDS) {
            if (req.query[field]) {

                // Category supports multiple categories.
                //
                // Example:
                // Vegetable Manchurian can have
                // category = veg
                //
                // and also have family in
                // class_categories.

                if (field === 'category') {
                    sql += `
                        AND (
                            c.category = ?
                            OR EXISTS (
                                SELECT 1
                                FROM class_categories cc
                                WHERE cc.class_id = c.id
                                  AND cc.category = ?
                            )
                        )
                    `;

                    params.push(
                        req.query[field],
                        req.query[field]
                    );
                } else {
                    sql += `
                        AND c.${field} = ?
                    `;

                    params.push(
                        req.query[field]
                    );
                }
            }
        }

        // Search by title
        if (search) {
            sql += `
                AND c.title LIKE ?
            `;

            params.push(
                `%${search}%`
            );
        }

        // Allergy safety
        if (excludeAllergensFor) {
            sql += `
                AND NOT EXISTS (
                    SELECT 1
                    FROM class_allergens ca
                    JOIN user_allergies ua
                        ON ua.allergen_id =
                           ca.allergen_id
                    WHERE ca.class_id = c.id
                      AND ua.user_id = ?
                )
            `;

            params.push(
                excludeAllergensFor
            );
        }

        sql += `
            ORDER BY c.created_at DESC
        `;

        const [rows] =
            await pool.query(
                sql,
                params
            );

        return respond(
            res,
            true,
            'Classes retrieved.',
            rows
        );

    } catch (err) {
        console.error(err);

        return respond(
            res,
            false,
            'Failed to retrieve classes.',
            null,
            500
        );
    }
});

// ---------------------------------------------------------------------
// GET /api/moods
// ---------------------------------------------------------------------

router.get('/moods', async (req, res) => {
    try {
        const [rows] =
            await pool.query(
                `SELECT id, name
                 FROM moods
                 ORDER BY name ASC`
            );

        return respond(
            res,
            true,
            'Moods retrieved.',
            rows
        );

    } catch (err) {
        console.error(err);

        return respond(
            res,
            false,
            'Failed to retrieve moods.',
            null,
            500
        );
    }
});

// ---------------------------------------------------------------------
// GET /api/allergens
// ---------------------------------------------------------------------

router.get('/allergens', async (req, res) => {
    try {
        const [rows] =
            await pool.query(
                `SELECT id, name
                 FROM allergens
                 ORDER BY name ASC`
            );

        return respond(
            res,
            true,
            'Allergens retrieved.',
            rows
        );

    } catch (err) {
        console.error(err);

        return respond(
            res,
            false,
            'Failed to retrieve allergens.',
            null,
            500
        );
    }
});

// ---------------------------------------------------------------------
// GET /api/cuisines
// ---------------------------------------------------------------------

router.get('/cuisines', async (req, res) => {
    try {
        const [rows] =
            await pool.query(
                `SELECT id, name
                 FROM cuisines
                 ORDER BY name ASC`
            );

        return respond(
            res,
            true,
            'Cuisines retrieved.',
            rows
        );

    } catch (err) {
        console.error(err);

        return respond(
            res,
            false,
            'Failed to retrieve cuisines.',
            null,
            500
        );
    }
});

// ---------------------------------------------------------------------
// GET /api/class-steps?class_id=3
// ---------------------------------------------------------------------

router.get(
    '/class-steps',
    async (req, res) => {
        const classId =
            parseInt(
                req.query.class_id,
                10
            );

        if (!classId) {
            return respond(
                res,
                false,
                'class_id is required.',
                null,
                400
            );
        }

        try {
            const [rows] =
                await pool.query(
                    `SELECT
                        step_number,
                        instruction
                     FROM class_steps
                     WHERE class_id = ?
                     ORDER BY step_number ASC`,
                    [classId]
                );

            return respond(
                res,
                true,
                'Steps retrieved.',
                rows
            );

        } catch (err) {
            console.error(err);

            return respond(
                res,
                false,
                'Failed to retrieve steps.',
                null,
                500
            );
        }
    }
);

// ---------------------------------------------------------------------
// POST /api/match-ingredients
// ---------------------------------------------------------------------

router.post(
    '/match-ingredients',
    async (req, res) => {

        const ingredientNames =
            Array.isArray(
                req.body.ingredients
            )
                ? req.body.ingredients
                : [];

        const mealTime =
            req.body.meal_time || null;

        const category =
            req.body.category || null;

        if (
            ingredientNames.length === 0
        ) {
            return respond(
                res,
                false,
                'ingredients (array of names) is required.',
                null,
                400
            );
        }

        try {
            const placeholders =
                ingredientNames
                    .map(() => '?')
                    .join(',');

            const [ingredientRows] =
                await pool.query(
                    `SELECT id, name
                     FROM ingredients
                     WHERE LOWER(name)
                     IN (${placeholders})`,
                    ingredientNames.map(
                        (n) =>
                            n.toLowerCase()
                    )
                );

            const matchedIds =
                ingredientRows.map(
                    (r) => r.id
                );

            if (
                matchedIds.length === 0
            ) {
                return respond(
                    res,
                    true,
                    'None of the given ingredients are recognized yet.',
                    []
                );
            }

            const idPlaceholders =
                matchedIds
                    .map(() => '?')
                    .join(',');

            let sql = `
                SELECT
                    c.id AS class_id,
                    c.title,
                    COUNT(
                        ci.ingredient_id
                    ) AS total_required,
                    SUM(
                        CASE
                            WHEN ci.ingredient_id
                            IN (${idPlaceholders})
                            THEN 1
                            ELSE 0
                        END
                    ) AS match_count

                FROM classes c

                JOIN class_ingredients ci
                    ON ci.class_id = c.id

                WHERE c.status = 'approved'
            `;

            const params = [
                ...matchedIds,
            ];

            if (mealTime) {
                sql += `
                    AND c.meal_time = ?
                `;

                params.push(
                    mealTime
                );
            }

            // Multiple-category support
            if (category) {
                sql += `
                    AND (
                        c.category = ?
                        OR EXISTS (
                            SELECT 1
                            FROM class_categories cc
                            WHERE cc.class_id = c.id
                              AND cc.category = ?
                        )
                    )
                `;

                params.push(
                    category,
                    category
                );
            }

            sql += `
                GROUP BY
                    c.id,
                    c.title

                ORDER BY
                    match_count DESC,
                    total_required ASC
            `;

            const [rows] =
                await pool.query(
                    sql,
                    params
                );

            const matches =
                rows.map((row) => {

                    const totalRequired =
                        Number(
                            row.total_required
                        );

                    const matchCount =
                        Number(
                            row.match_count
                        );

                    return {
                        class_id:
                            row.class_id,

                        title:
                            row.title,

                        match_count:
                            matchCount,

                        total_required:
                            totalRequired,

                        match_score:
                            totalRequired > 0
                                ? Math.round(
                                      (
                                          matchCount /
                                          totalRequired
                                      ) * 100
                                  ) / 100
                                : 0,
                    };
                });

            return respond(
                res,
                true,
                'Matched classes retrieved.',
                matches
            );

        } catch (err) {
            console.error(err);

            return respond(
                res,
                false,
                'Failed to compute ingredient matches.',
                null,
                500
            );
        }
    }
);

// ---------------------------------------------------------------------
// POST /api/add-ingredient
// ---------------------------------------------------------------------

router.post(
    '/add-ingredient',
    async (req, res) => {

        const name =
            (req.body.name || '')
                .trim();

        if (!name) {
            return respond(
                res,
                false,
                'name is required.',
                null,
                400
            );
        }

        try {
            const [existing] =
                await pool.query(
                    `SELECT id, name
                     FROM ingredients
                     WHERE LOWER(name) = ?`,
                    [name.toLowerCase()]
                );

            if (
                existing.length > 0
            ) {
                return respond(
                    res,
                    true,
                    'Ingredient already exists.',
                    {
                        id:
                            existing[0].id,

                        name:
                            existing[0].name,

                        created:
                            false,
                    }
                );
            }

            const [result] =
                await pool.query(
                    `INSERT INTO ingredients
                        (
                            name,
                            is_user_submitted
                        )
                     VALUES (?, TRUE)`,
                    [name]
                );

            return respond(
                res,
                true,
                'Ingredient added.',
                {
                    id:
                        result.insertId,

                    name,

                    created:
                        true,
                },
                201
            );

        } catch (err) {
            console.error(err);

            return respond(
                res,
                false,
                'Failed to add ingredient.',
                null,
                500
            );
        }
    }
);
// ---------------------------------------------------------------------
// GET /api/ingredients
//
// IMPORTANT:
// - When there is NO search text, show ALL ingredients.
// - When q is provided, search/filter ingredients.
// - There is NO pantry visibility filtering here.
// ---------------------------------------------------------------------

router.get(
    '/ingredients',
    async (req, res) => {

        const q =
            (req.query.q || '')
                .trim()
                .toLowerCase();

        const limit = Math.min(
            parseInt(
                req.query.limit,
                10
            ) || 20,
            500
        );

        try {
            let rows;

            // ---------------------------------------------------------
            // No search text
            // ---------------------------------------------------------
            // Show all ingredients.
            //
            // This is the behavior you asked for.
            // The ingredient selector should not start empty.
            // ---------------------------------------------------------

            if (!q) {

                [rows] =
                    await pool.query(
                        `SELECT
                            id,
                            name
                         FROM ingredients
                         ORDER BY name ASC
                         LIMIT ?`,
                        [limit]
                    );

            } else {

                // -----------------------------------------------------
                // Search text provided
                // -----------------------------------------------------

                const escaped =
                    q.replace(
                        /[\%_]/g,
                        '\\$&'
                    );

                [rows] =
                    await pool.query(
                        `SELECT
                            id,
                            name
                         FROM ingredients

                         WHERE LOWER(name)
                               LIKE ?

                         ORDER BY
                            (
                                LOWER(name) = ?
                            ) DESC,

                            (
                                LOWER(name)
                                LIKE ?
                            ) DESC,

                            name ASC

                         LIMIT ?`,
                        [
                            `%${escaped}%`,
                            q,
                            `${escaped}%`,
                            limit,
                        ]
                    );
            }

            return respond(
                res,
                true,
                'Ingredients retrieved.',
                rows
            );

        } catch (err) {

            console.error(err);

            return respond(
                res,
                false,
                'Failed to retrieve ingredients.',
                null,
                500
            );
        }
    }
);

// ---------------------------------------------------------------------
// Multer setup
// ---------------------------------------------------------------------

const uploadDir =
    path.join(
        __dirname,
        '..',
        'uploads',
        'classes'
    );

const imageUploadDir =
    path.join(
        __dirname,
        '..',
        'uploads',
        'images'
    );

fs.mkdirSync(
    uploadDir,
    {
        recursive: true,
    }
);

fs.mkdirSync(
    imageUploadDir,
    {
        recursive: true,
    }
);

// ---------------------------------------------------------------------
// Allowed file types
// ---------------------------------------------------------------------

const ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
];

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
];

const MAX_VIDEO_BYTES =
    100 * 1024 * 1024;

const MAX_IMAGE_BYTES =
    10 * 1024 * 1024;

// ---------------------------------------------------------------------
// Multer storage
// ---------------------------------------------------------------------

const storage =
    multer.diskStorage({

        destination: (
            req,
            file,
            cb
        ) => {

            if (
                file.fieldname ===
                'image'
            ) {
                cb(
                    null,
                    imageUploadDir
                );
            } else {
                cb(
                    null,
                    uploadDir
                );
            }
        },

        filename: (
            req,
            file,
            cb
        ) => {

            const ext =
                path.extname(
                    file.originalname
                );

            const prefix =
                file.fieldname ===
                'image'
                    ? 'dish'
                    : 'class';

            cb(
                null,
                `${prefix}_${randomUUID()}${ext}`
            );
        },
    });

// ---------------------------------------------------------------------
// Multer upload configuration
// ---------------------------------------------------------------------

const upload =
    multer({

        storage,

        limits: {
            fileSize:
                Math.max(
                    MAX_VIDEO_BYTES,
                    MAX_IMAGE_BYTES
                ),
        },

        fileFilter: (
            req,
            file,
            cb
        ) => {

            // Video validation
            if (
                file.fieldname ===
                    'video' &&
                !ALLOWED_VIDEO_TYPES.includes(
                    file.mimetype
                )
            ) {
                return cb(
                    new Error(
                        'Unsupported video format. Use mp4, mov, or webm.'
                    )
                );
            }

            // Image validation
            if (
                file.fieldname ===
                    'image' &&
                !ALLOWED_IMAGE_TYPES.includes(
                    file.mimetype
                )
            ) {
                return cb(
                    new Error(
                        'Unsupported image format. Use jpg, png, or webp.'
                    )
                );
            }

            cb(
                null,
                true
            );
        },
    });

// ---------------------------------------------------------------------
// POST /api/upload-class
// ---------------------------------------------------------------------

router.post(
    '/upload-class',

    // ---------------------------------------------------------------
    // Handle uploaded files
    // ---------------------------------------------------------------

    (req, res, next) => {

        upload.fields([
            {
                name: 'video',
                maxCount: 1,
            },
            {
                name: 'image',
                maxCount: 1,
            },
        ])(
            req,
            res,
            (err) => {

                if (err) {

                    return respond(
                        res,
                        false,
                        err.message,
                        null,
                        400
                    );
                }

                next();
            }
        );
    },

    // ---------------------------------------------------------------
    // Save class
    // ---------------------------------------------------------------

    async (req, res) => {

        const videoFile =
            req.files &&
            req.files.video
                ? req.files.video[0]
                : null;

        const imageFile =
            req.files &&
            req.files.image
                ? req.files.image[0]
                : null;

        const {
            title,

            category,

            time_needed:
                timeNeeded = 'quick',

            taste = 'neutral',

            skill_level:
                skillLevel = 'beginner',

            meal_time:
                mealTime = 'morning',

            source_type:
                sourceType = 'native',

            ingredients:
                ingredientsRaw = '',

            moods:
                moodsRaw = '',

            allergens:
                allergensRaw = '',

            cuisines:
                cuisinesRaw = '',

            steps:
                stepsRaw = '',

            ingredient_quantities:
                ingredientQuantitiesRaw = '',
        } = req.body;

        const prepTimeMinutes =
            req.body.prep_time_minutes
                ? parseInt(
                      req.body
                          .prep_time_minutes,
                      10
                  )
                : null;

        const cookTimeMinutes =
            req.body.cook_time_minutes
                ? parseInt(
                      req.body
                          .cook_time_minutes,
                      10
                  )
                : null;

        const servings =
            req.body.servings
                ? parseInt(
                      req.body.servings,
                      10
                  )
                : null;

        const uploaderId =
            parseInt(
                req.body.uploader_id,
                10
            );

        const cleanTitle =
            (title || '').trim();

        // -------------------------------------------------------------
        // Delete uploaded files if validation/database fails
        // -------------------------------------------------------------

        function cleanupUploadedFiles() {

            if (videoFile) {
                fs.unlink(
                    videoFile.path,
                    () => {}
                );
            }

            if (imageFile) {
                fs.unlink(
                    imageFile.path,
                    () => {}
                );
            }
        }

        // -------------------------------------------------------------
        // Required fields
        // -------------------------------------------------------------

        if (
            !uploaderId ||
            !cleanTitle
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                'uploader_id and title are required.',
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Category validation
        // -------------------------------------------------------------

        if (
            !VALID_CATEGORIES.includes(
                category
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Source type validation
        // -------------------------------------------------------------
        //
        // NOTE:
        // Do NOT use VALID_BUDGETS here.
        // That was the accidental code causing an error.
        // -------------------------------------------------------------

        if (
            !VALID_SOURCE_TYPES.includes(
                sourceType
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Time validation
        // -------------------------------------------------------------

        if (
            timeNeeded &&
            !VALID_TIME_NEEDED.includes(
                timeNeeded
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `time_needed must be one of: ${VALID_TIME_NEEDED.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Taste validation
        // -------------------------------------------------------------

        if (
            taste &&
            !VALID_TASTES.includes(
                taste
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `taste must be one of: ${VALID_TASTES.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Skill validation
        // -------------------------------------------------------------

        if (
            skillLevel &&
            !VALID_SKILL_LEVELS.includes(
                skillLevel
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `skill_level must be one of: ${VALID_SKILL_LEVELS.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Meal time validation
        // -------------------------------------------------------------

        if (
            mealTime &&
            !VALID_MEAL_TIMES.includes(
                mealTime
            )
        ) {

            cleanupUploadedFiles();

            return respond(
                res,
                false,
                `meal_time must be one of: ${VALID_MEAL_TIMES.join(', ')}`,
                null,
                400
            );
        }

        // -------------------------------------------------------------
        // Video handling
        // -------------------------------------------------------------

        let videoUrl;

        if (
            sourceType ===
            'native'
        ) {

            if (!videoFile) {

                cleanupUploadedFiles();

                return respond(
                    res,
                    false,
                    'A video file is required when source_type is "native".',
                    null,
                    400
                );
            }

            videoUrl =
                path
                    .join(
                        'uploads',
                        'classes',
                        videoFile.filename
                    )
                    .replace(
                        /\\/g,
                        '/'
                    );

        } else {

            const providedUrl =
                (
                    req.body.video_url ||
                    ''
                ).trim();

            if (!providedUrl) {

                cleanupUploadedFiles();

                return respond(
                    res,
                    false,
                    'video_url is required when source_type is "youtube" or "external".',
                    null,
                    400
                );
            }

            videoUrl =
                providedUrl;
        }

        // -------------------------------------------------------------
        // Image URL
        // -------------------------------------------------------------

        const imageUrl =
            imageFile
                ? path
                      .join(
                          'uploads',
                          'images',
                          imageFile.filename
                      )
                      .replace(
                          /\\/g,
                          '/'
                      )
                : null;

        // -------------------------------------------------------------
        // Database connection
        // -------------------------------------------------------------

        const conn =
            await pool.getConnection();

        try {

            await conn.beginTransaction();

            // ---------------------------------------------------------
            // Insert class
            // ---------------------------------------------------------

            const [result] =
                await conn.query(
                    `INSERT INTO classes
                        (
                            title,
                            category,
                            time_needed,
                            taste,
                            skill_level,
                            meal_time,
                            video_url,
                            source_type,
                            uploader_id,
                            status,
                            prep_time_minutes,
                            cook_time_minutes,
                            servings,
                            image_url
                        )

                     VALUES
                        (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            'pending',
                            ?,
                            ?,
                            ?,
                            ?
                        )`,
                    [
                        cleanTitle,

                        category,

                        timeNeeded,

                        taste,

                        skillLevel,

                        mealTime,

                        videoUrl,

                        sourceType,

                        uploaderId,

                        prepTimeMinutes,

                        cookTimeMinutes,

                        servings,

                        imageUrl,
                    ]
                );

            const classId =
                result.insertId;

            // ---------------------------------------------------------
            // Ingredients
            // ---------------------------------------------------------

            const ingredientNameToId =
                await linkNamesToClass(
                    conn,
                    {
                        rawNames:
                            ingredientsRaw,

                        classId,

                        table:
                            'ingredients',

                        idColumn:
                            'ingredient_id',

                        junctionTable:
                            'class_ingredients',

                        extraInsertCols:
                            'is_user_submitted',

                        extraInsertVals:
                            [true],
                    }
                );

            // ---------------------------------------------------------
            // Ingredient quantities
            // ---------------------------------------------------------

            if (
                ingredientQuantitiesRaw
            ) {

                let parsedQuantities =
                    {};

                try {

                    parsedQuantities =
                        JSON.parse(
                            ingredientQuantitiesRaw
                        );

                } catch (
                    parseErr
                ) {

                    parsedQuantities =
                        {};
                }

                for (
                    const [
                        name,
                        detail,
                    ]
                    of Object.entries(
                        parsedQuantities
                    )
                ) {

                    const ingredientId =
                        ingredientNameToId[
                            name
                                .trim()
                                .toLowerCase()
                        ];

                    if (
                        !ingredientId ||
                        !detail
                    ) {
                        continue;
                    }

                    const qty =
                        detail.quantity !==
                        undefined
                            ? parseFloat(
                                  detail.quantity
                              )
                            : null;

                    const unit =
                        detail.unit
                            ? String(
                                  detail.unit
                              ).trim()
                            : null;

                    await conn.query(
                        `UPDATE class_ingredients

                         SET
                            quantity = ?,
                            unit = ?

                         WHERE
                            class_id = ?

                         AND
                            ingredient_id = ?`,
                        [
                            qty,
                            unit,
                            classId,
                            ingredientId,
                        ]
                    );
                }
            }

            // ---------------------------------------------------------
            // Moods
            // ---------------------------------------------------------

            await linkNamesToClass(
                conn,
                {
                    rawNames:
                        moodsRaw,

                    classId,

                    table:
                        'moods',

                    idColumn:
                        'mood_id',

                    junctionTable:
                        'class_moods',
                }
            );

            // ---------------------------------------------------------
            // Allergens
            // ---------------------------------------------------------

            await linkNamesToClass(
                conn,
                {
                    rawNames:
                        allergensRaw,

                    classId,

                    table:
                        'allergens',

                    idColumn:
                        'allergen_id',

                    junctionTable:
                        'class_allergens',
                }
            );

            // ---------------------------------------------------------
            // Cuisines
            // ---------------------------------------------------------

            await linkNamesToClass(
                conn,
                {
                    rawNames:
                        cuisinesRaw,

                    classId,

                    table:
                        'cuisines',

                    idColumn:
                        'cuisine_id',

                    junctionTable:
                        'class_cuisines',
                }
            );

            // ---------------------------------------------------------
            // Steps
            // ---------------------------------------------------------

            if (stepsRaw) {

                const steps =
                    stepsRaw
                        .split('|')
                        .map(
                            (s) =>
                                s.trim()
                        )
                        .filter(Boolean);

                let stepNumber = 1;

                for (
                    const instruction
                    of steps
                ) {

                    await conn.query(
                        `INSERT INTO class_steps
                            (
                                class_id,
                                step_number,
                                instruction
                            )

                         VALUES
                            (?, ?, ?)`,
                        [
                            classId,
                            stepNumber,
                            instruction,
                        ]
                    );

                    stepNumber += 1;
                }
            }

            // ---------------------------------------------------------
            // Finish transaction
            // ---------------------------------------------------------

            await conn.commit();

            return respond(
                res,
                true,
                'Class submitted and pending review.',
                {
                    class_id:
                        classId,
                },
                201
            );

        } catch (err) {

            await conn.rollback();

            cleanupUploadedFiles();

            console.error(err);

            return respond(
                res,
                false,
                'Upload failed while saving to the database.',
                null,
                500
            );

        } finally {

            conn.release();
        }
    }
);
// ============================================================
// POST /api/like-class
// ============================================================

router.post('/like-class', async (req, res) => {
    const { user_id, class_id } = req.body;

    if (!user_id || !class_id) {
        return respond(
            res,
            false,
            'user_id and class_id are required.',
            null,
            400
        );
    }

    try {
        const [existing] = await pool.query(
            `SELECT id
             FROM user_favorites
             WHERE user_id = ? AND class_id = ?
             LIMIT 1`,
            [user_id, class_id]
        );

        if (existing.length > 0) {
            await pool.query(
                `DELETE FROM user_favorites
                 WHERE user_id = ? AND class_id = ?`,
                [user_id, class_id]
            );

            return respond(res, true, 'Class unliked.', {
                liked: false,
            });
        }

        await pool.query(
            `INSERT INTO user_favorites (user_id, class_id)
             VALUES (?, ?)`,
            [user_id, class_id]
        );

        return respond(res, true, 'Class liked.', {
            liked: true,
        });
    } catch (err) {
        console.error('Like class error:', err);

        return respond(
            res,
            false,
            'Failed to update like.',
            null,
            500
        );
    }
});


// ============================================================
// GET /api/classes/:id
// ============================================================

router.get('/classes/:id', async (req, res) => {
    const classId = parseInt(req.params.id, 10);

    if (Number.isNaN(classId)) {
        return respond(
            res,
            false,
            'Invalid class ID.',
            null,
            400
        );
    }

    try {
        const [classRows] = await pool.query(
            `SELECT
                c.*,
                u.name AS uploader_name
             FROM classes c
             LEFT JOIN users u
                ON u.id = c.uploader_id
             WHERE c.id = ?
             LIMIT 1`,
            [classId]
        );

        if (classRows.length === 0) {
            return respond(
                res,
                false,
                'Class not found.',
                null,
                404
            );
        }

        const classData = classRows[0];

        const [
            ingredients,
            steps,
            moods,
            allergens,
            cuisines,
            categories,
        ] = await Promise.all([
            pool.query(
                `SELECT
                    i.id,
                    i.name,
                    ci.quantity
                 FROM class_ingredients ci
                 JOIN ingredients i
                    ON i.id = ci.ingredient_id
                 WHERE ci.class_id = ?
                 ORDER BY i.name ASC`,
                [classId]
            ),

            pool.query(
                `SELECT
                    step_number,
                    instruction
                 FROM class_steps
                 WHERE class_id = ?
                 ORDER BY step_number ASC`,
                [classId]
            ),

            pool.query(
                `SELECT
                    m.id,
                    m.name
                 FROM class_moods cm
                 JOIN moods m
                    ON m.id = cm.mood_id
                 WHERE cm.class_id = ?
                 ORDER BY m.name ASC`,
                [classId]
            ),

            pool.query(
                `SELECT
                    a.id,
                    a.name
                 FROM class_allergens ca
                 JOIN allergens a
                    ON a.id = ca.allergen_id
                 WHERE ca.class_id = ?
                 ORDER BY a.name ASC`,
                [classId]
            ),

            pool.query(
                `SELECT
                    cu.id,
                    cu.name
                 FROM class_cuisines cc
                 JOIN cuisines cu
                    ON cu.id = cc.cuisine_id
                 WHERE cc.class_id = ?
                 ORDER BY cu.name ASC`,
                [classId]
            ),

            pool.query(
                `SELECT
                    category
                 FROM class_categories
                 WHERE class_id = ?
                 ORDER BY category ASC`,
                [classId]
            ),
        ]);

        classData.ingredients = ingredients[0];
        classData.steps = steps[0];
        classData.moods = moods[0];
        classData.allergens = allergens[0];
        classData.cuisines = cuisines[0];
        classData.categories = categories[0];

        return respond(
            res,
            true,
            'Class retrieved successfully.',
            classData
        );
    } catch (err) {
        console.error('Get class by ID error:', err);

        return respond(
            res,
            false,
            'Failed to retrieve class.',
            null,
            500
        );
    }
});


// ============================================================
// GET /api/my-uploads
// ============================================================

router.get('/my-uploads', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (Number.isNaN(userId)) {
        return respond(
            res,
            false,
            'Valid user_id is required.',
            null,
            400
        );
    }

    try {
        const [rows] = await pool.query(
            `SELECT
                c.*
             FROM classes c
             WHERE c.uploader_id = ?
             ORDER BY c.created_at DESC`,
            [userId]
        );

        return respond(
            res,
            true,
            'Your uploads retrieved.',
            rows
        );
    } catch (err) {
        console.error('My uploads error:', err);

        return respond(
            res,
            false,
            'Failed to retrieve your uploads.',
            null,
            500
        );
    }
});


// ============================================================
// GET /api/liked-classes
// ============================================================

router.get('/liked-classes', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (Number.isNaN(userId)) {
        return respond(
            res,
            false,
            'Valid user_id is required.',
            null,
            400
        );
    }

    try {
        const [rows] = await pool.query(
            `SELECT
                c.*
             FROM user_favorites f
             JOIN classes c
                ON c.id = f.class_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return respond(
            res,
            true,
            'Liked classes retrieved.',
            rows
        );
    } catch (err) {
        console.error('Liked classes error:', err);

        return respond(
            res,
            false,
            'Failed to retrieve liked classes.',
            null,
            500
        );
    }
});


// ============================================================
// PATCH /api/classes/:id
// ============================================================

const EDITABLE_CLASS_FIELDS = [
    'title',
    'category',
    'time_needed',
    'taste',
    'skill_level',
    'meal_time',
    'video_url',
    'image_url',
    'source_type',
    'prep_time_minutes',
    'cook_time_minutes',
    'servings',
];

router.patch('/classes/:id', async (req, res) => {
    const classId = parseInt(req.params.id, 10);

    if (Number.isNaN(classId)) {
        return respond(
            res,
            false,
            'Invalid class ID.',
            null,
            400
        );
    }

    const updates = {};
    const params = [];

    for (const field of EDITABLE_CLASS_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
            updates[field] = req.body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return respond(
            res,
            false,
            'No valid fields provided for update.',
            null,
            400
        );
    }

    // Validate enum-style fields if they are being updated.
    if (
        updates.category !== undefined &&
        !VALID_CATEGORIES.includes(updates.category)
    ) {
        return respond(
            res,
            false,
            'Invalid category.',
            null,
            400
        );
    }

    if (
        updates.time_needed !== undefined &&
        !VALID_TIME_NEEDED.includes(updates.time_needed)
    ) {
        return respond(
            res,
            false,
            'Invalid time_needed value.',
            null,
            400
        );
    }

    if (
        updates.taste !== undefined &&
        !VALID_TASTES.includes(updates.taste)
    ) {
        return respond(
            res,
            false,
            'Invalid taste.',
            null,
            400
        );
    }

    if (
        updates.skill_level !== undefined &&
        !VALID_SKILL_LEVELS.includes(updates.skill_level)
    ) {
        return respond(
            res,
            false,
            'Invalid skill_level.',
            null,
            400
        );
    }

    if (
        updates.meal_time !== undefined &&
        !VALID_MEAL_TIMES.includes(updates.meal_time)
    ) {
        return respond(
            res,
            false,
            'Invalid meal_time.',
            null,
            400
        );
    }

    if (
        updates.source_type !== undefined &&
        !VALID_SOURCE_TYPES.includes(updates.source_type)
    ) {
        return respond(
            res,
            false,
            'Invalid source_type.',
            null,
            400
        );
    }

    try {
        const fields = Object.keys(updates);

        const setClause = fields
            .map(field => `${field} = ?`)
            .join(', ');

        for (const field of fields) {
            params.push(updates[field]);
        }

        params.push(classId);

        const [result] = await pool.query(
            `UPDATE classes
             SET ${setClause}
             WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return respond(
                res,
                false,
                'Class not found.',
                null,
                404
            );
        }

        const [rows] = await pool.query(
            `SELECT *
             FROM classes
             WHERE id = ?
             LIMIT 1`,
            [classId]
        );

        return respond(
            res,
            true,
            'Class updated successfully.',
            rows[0]
        );
    } catch (err) {
        console.error('Update class error:', err);

        return respond(
            res,
            false,
            'Failed to update class.',
            null,
            500
        );
    }
});


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;