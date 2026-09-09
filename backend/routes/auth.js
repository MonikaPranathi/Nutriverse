const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// POST /api/signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: 'All fields are required' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.json({ success: false, message: 'Please enter a valid email address' });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.json({ success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
    res.json({ success: true, message: 'Account created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.json({ success: false, message: 'Email already exists' });
    } else {
      console.log(err);
      res.json({ success: false, message: 'Something went wrong, please try again' });
    }
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: 'Email and password are required' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.json({ success: false, message: 'Please enter a valid email address' });
  }

  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    return res.json({ success: false, message: 'Invalid email or password' });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.json({ success: false, message: 'Invalid email or password' });
  }

  res.json({
    success: true,
    user: { id: user.id, name: user.name, role: user.role },
  });
});

// POST /api/set-meal-time
router.post('/set-meal-time', async (req, res) => {
  const { user_id, meal_time } = req.body;
  const validTimes = ['morning', 'afternoon', 'evening', 'night'];

  if (!user_id || !validTimes.includes(meal_time)) {
    return res.json({ success: false, message: 'Invalid request' });
  }

  res.json({ success: true });
});

module.exports = router;