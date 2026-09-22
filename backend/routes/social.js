/**
 * routes/social.js
 * Owner: Divya (Member 2)
 *
 * Favorites (personal saved collection) + ratings & reviews.
 * Kept separate from like-class: a like is a lightweight signal used
 * for notifications; a favorite is the user's own saved list.
 *
 * Endpoints:
 *   POST   /api/favorite-class       - save a class to favorites
 *   DELETE /api/favorite-class       - remove from favorites
 *   GET    /api/favorites            - a user's saved classes
 *   POST   /api/review-class         - add or update a rating + review
 *   GET    /api/reviews              - reviews for a class, with average
 *   GET    /api/top-rated            - highest-rated approved classes
 *
 * Requires: database/schema_v2_additions.sql
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

// ---------------------------------------------------------------------
// Multer setup for review photos. Only kicks in for multipart requests —
// a plain JSON POST (no photo) passes straight through untouched, so this
// stays backward-compatible with review-class calls that don't attach one.
// ---------------------------------------------------------------------
const reviewUploadDir = path.join(__dirname, '..', 'uploads', 'reviews');
fs.mkdirSync(reviewUploadDir, { recursive: true });

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

const reviewPhotoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, reviewUploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `review_${randomUUID()}${ext}`);
        },
    }),
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_PHOTO_TYPES.includes(file.mimetype)) {
            return cb(new Error('Unsupported image format. Use jpg, png, or webp.'));
        }
        cb(null, true);
    },
});

// ---------------------------------------------------------------------
// POST /api/favorite-class
// Body: { user_id, class_id }
// ---------------------------------------------------------------------
router.post('/favorite-class', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !classId) {
        return respond(res, false, 'user_id and class_id are required.', null, 400);
    }

    try {
        const [classRows] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
        if (classRows.length === 0) {
            return respond(res, false, 'Class not found.', null, 404);
        }

        const [result] = await pool.query(
            'INSERT IGNORE INTO user_favorites (user_id, class_id) VALUES (?, ?)',
            [userId, classId]
        );

        if (result.affectedRows === 0) {
            return respond(res, true, 'Already in favorites.', { created: false });
        }

        return respond(res, true, 'Added to favorites.', { created: true }, 201);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to add favorite.', null, 500);
    }
});

// ---------------------------------------------------------------------
// DELETE /api/favorite-class
// Body: { user_id, class_id }
// ---------------------------------------------------------------------
router.delete('/favorite-class', async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);

    if (!userId || !classId) {
        return respond(res, false, 'user_id and class_id are required.', null, 400);
    }

    try {
        const [result] = await pool.query(
            'DELETE FROM user_favorites WHERE user_id = ? AND class_id = ?',
            [userId, classId]
        );

        if (result.affectedRows === 0) {
            return respond(res, false, 'That class was not in favorites.', null, 404);
        }

        return respond(res, true, 'Removed from favorites.');
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to remove favorite.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/favorites?user_id=1
// ---------------------------------------------------------------------
router.get('/favorites', async (req, res) => {
    const userId = parseInt(req.query.user_id, 10);

    if (!userId) {
        return respond(res, false, 'user_id is required.', null, 400);
    }

    try {
        const [rows] = await pool.query(
            `SELECT c.id, c.title, c.category, c.budget, c.time_needed, c.taste,
                    c.skill_level, c.meal_time, c.video_url, c.source_type,
                    f.favorited_at
             FROM user_favorites f
             JOIN classes c ON c.id = f.class_id
             WHERE f.user_id = ?
             ORDER BY f.favorited_at DESC`,
            [userId]
        );
        return respond(res, true, 'Favorites retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve favorites.', null, 500);
    }
});

// ---------------------------------------------------------------------
// POST /api/review-class
// Body (JSON or multipart/form-data): { user_id, class_id, rating (1-5), review_text? }
// Optional multipart file field `photo` (jpg/png/webp, max 10MB).
// A plain JSON request with no photo still works exactly as before.
// Re-reviewing the same class updates the existing review; if no new
// photo is sent on a re-review, the existing photo is kept, not cleared.
// ---------------------------------------------------------------------
router.post('/review-class', (req, res, next) => {
    reviewPhotoUpload.single('photo')(req, res, (err) => {
        if (err) {
            return respond(res, false, err.message, null, 400);
        }
        next();
    });
}, async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const classId = parseInt(req.body.class_id, 10);
    const rating = parseInt(req.body.rating, 10);
    const reviewText = (req.body.review_text || '').trim() || null;
    const photoUrl = req.file
        ? path.join('uploads', 'reviews', req.file.filename).replace(/\\/g, '/')
        : null;

    if (!userId || !classId) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, 'user_id and class_id are required.', null, 400);
    }
    if (!rating || rating < 1 || rating > 5) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, 'rating must be a whole number from 1 to 5.', null, 400);
    }
    if (reviewText && reviewText.length > 1000) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return respond(res, false, 'review_text must be 1000 characters or fewer.', null, 400);
    }

    try {
        const [classRows] = await pool.query('SELECT id FROM classes WHERE id = ?', [classId]);
        if (classRows.length === 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return respond(res, false, 'Class not found.', null, 404);
        }

        // COALESCE keeps the existing photo_url on a re-review that
        // doesn't attach a new photo, instead of wiping it to NULL.
        await pool.query(
            `INSERT INTO class_reviews (user_id, class_id, rating, review_text, photo_url)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                rating = VALUES(rating),
                review_text = VALUES(review_text),
                photo_url = COALESCE(VALUES(photo_url), photo_url)`,
            [userId, classId, rating, reviewText, photoUrl]
        );

        return respond(res, true, 'Review saved.', { user_id: userId, class_id: classId, rating, photo_url: photoUrl }, 201);
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error(err);
        return respond(res, false, 'Failed to save review.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/reviews?class_id=3
// ---------------------------------------------------------------------
router.get('/reviews', async (req, res) => {
    const classId = parseInt(req.query.class_id, 10);

    if (!classId) {
        return respond(res, false, 'class_id is required.', null, 400);
    }

    try {
        const [reviews] = await pool.query(
            `SELECT r.rating, r.review_text, r.photo_url, r.created_at, u.id AS user_id, u.name AS user_name
             FROM class_reviews r
             JOIN users u ON u.id = r.user_id
             WHERE r.class_id = ?
             ORDER BY r.created_at DESC`,
            [classId]
        );

        const [[summary]] = await pool.query(
            `SELECT COUNT(*) AS review_count, ROUND(AVG(rating), 2) AS average_rating
             FROM class_reviews WHERE class_id = ?`,
            [classId]
        );

        return respond(res, true, 'Reviews retrieved.', {
            class_id: classId,
            review_count: Number(summary.review_count),
            average_rating: summary.average_rating ? Number(summary.average_rating) : null,
            reviews,
        });
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve reviews.', null, 500);
    }
});

// ---------------------------------------------------------------------
// GET /api/top-rated?limit=10
// Highest-rated approved classes, requiring at least one review.
// ---------------------------------------------------------------------
router.get('/top-rated', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    try {
        const [rows] = await pool.query(
            `SELECT c.id, c.title, c.category, c.meal_time, c.video_url,
                    COUNT(r.rating) AS review_count,
                    ROUND(AVG(r.rating), 2) AS average_rating
             FROM classes c
             JOIN class_reviews r ON r.class_id = c.id
             WHERE c.status = 'approved'
             GROUP BY c.id
             ORDER BY average_rating DESC, review_count DESC
             LIMIT ?`,
            [limit]
        );
        return respond(res, true, 'Top rated classes retrieved.', rows);
    } catch (err) {
        console.error(err);
        return respond(res, false, 'Failed to retrieve top rated classes.', null, 500);
    }
});

module.exports = router;