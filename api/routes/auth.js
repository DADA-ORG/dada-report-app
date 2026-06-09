const express = require('express');
const router = express.Router();
const { getUserInfo } = require('../utils/larkClient');

// POST /api/auth/login
// Body: { code: string }  — auth code from Lark JSAPI on frontend
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing auth code' });

    const user = await getUserInfo(code);
    // Return open_id and name — frontend stores in memory for the session
    res.json({
      open_id: user.open_id,
      name: user.name,
      avatar_url: user.avatar_url,
      email: user.enterprise_email || user.email || '',
    });
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
