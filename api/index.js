require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

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

// ── Manual notification trigger (for external cron / testing) ─────────────
// POST /api/notify/remind?type=morning|evening&secret=<NOTIFY_SECRET>
app.post('/api/notify/remind', async (req, res) => {
  const secret = req.query.secret || req.body.secret;
  const expected = process.env.NOTIFY_SECRET;
  if (expected && secret !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const isSecond = req.query.type === 'evening';
  try {
    const result = await sendDailyReminders(isSecond);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Manual reminder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduled reminders (SGT = UTC+8) ────────────────────────────────────
// 9am SGT  = 1am UTC  → cron: 0 1 * * 1-5
// 5pm SGT  = 9am UTC  → cron: 0 9 * * 1-5
cron.schedule('0 1 * * 1-5', () => {
  console.log('[cron] 9am SGT — sending morning reminders');
  sendDailyReminders(false).catch(console.error);
}, { timezone: 'UTC' });

cron.schedule('0 9 * * 1-5', () => {
  console.log('[cron] 5pm SGT — sending evening reminders');
  sendDailyReminders(true).catch(console.error);
}, { timezone: 'UTC' });

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`DADA Report API running on port ${PORT}`));
}
module.exports = app;
