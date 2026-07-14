require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const employeeRoutes = require('./routes/employees');
const { sendDailyReminders } = require('./utils/notifications');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/employees', employeeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Notification trigger ────────────────────────────────────────────────
// Triggered by Vercel Cron (GET, see vercel.json "crons") or manually
// (GET/POST) for testing.
// Vercel Cron sends the CRON_SECRET as `Authorization: Bearer <secret>`.
// Manual calls can instead pass ?secret=<NOTIFY_SECRET or CRON_SECRET>.
// Schedule (SGT = UTC+8): 9am SGT = 1am UTC (morning), 5pm SGT = 9am UTC (evening)
app.all('/api/notify/remind', async (req, res) => {
  const authHeader = req.headers.authorization;
  const querySecret = req.query.secret || req.body?.secret;
  const expected = process.env.CRON_SECRET || process.env.NOTIFY_SECRET;

  const authorized =
    !expected ||
    authHeader === `Bearer ${expected}` ||
    querySecret === expected;

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSecond = req.query.type === 'evening';
  try {
    const result = await sendDailyReminders(isSecond);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`DADA Report API running on port ${PORT}`));
}
module.exports = app;
