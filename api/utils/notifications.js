// Notification helpers — Lark card messages to employees and managers
const { listRecords, sendCard } = require('./larkClient');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dada-report-frontend.onrender.com';
const SGT_OFFSET = 8 * 60 * 60 * 1000;
const CUTOFF = '2026-06-09';

const SG_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-29', '2026-01-30', '2026-04-03',
  '2026-05-01', '2026-05-12', '2026-06-02', '2026-08-09',
  '2026-10-20', '2026-12-25',
]);

function toSGTDateStr(ts) {
  return new Date(Number(ts) + SGT_OFFSET).toISOString().split('T')[0];
}

function isSGTWorkday(dateStr) {
  if (SG_HOLIDAYS_2026.has(dateStr)) return false;
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

// Build an interactive card with a single action button
function buildCard({ title, template, body, buttonText, buttonUrl }) {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template,
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: body },
      },
      {
        tag: 'action',
        actions: [{
          tag: 'button',
          text: { tag: 'plain_text', content: buttonText },
          url: buttonUrl,
          type: 'primary',
        }],
      },
    ],
  };
}

// Send daily reminders to employees who haven't submitted today
// isSecondReminder: false = 9am reminder, true = 5pm reminder
async function sendDailyReminders(isSecondReminder = false) {
  const todayStr = toSGTDateStr(Date.now());

  if (!isSGTWorkday(todayStr)) {
    console.log('[notify] Not a SGT workday, skipping reminders for', todayStr);
    return { skipped: true, reason: 'non-workday' };
  }

  console.log(`[notify] Sending ${isSecondReminder ? '5pm' : '9am'} reminders for ${todayStr}`);

  // 1. All Remote/Probation employees
  const empRecords = await listRecords(process.env.TABLE_REMOTE_PROBATION);
  const remoteProb = empRecords
    .map(r => ({
      open_id: r.fields['Employee']?.[0]?.id || '',
      name: r.fields['Employee']?.[0]?.name || '',
    }))
    .filter(e => e.open_id);

  // 2. WFH employees active today
  const wfhRecords = await listRecords(process.env.TABLE_WFH_REQUEST, '', 500);
  const wfhToday = wfhRecords
    .filter(r => {
      const start = r.fields['Start time'];
      const end = r.fields['End time'];
      if (!start || !end) return false;
      const startStr = toSGTDateStr(start);
      const endStr = toSGTDateStr(end);
      if (startStr < CUTOFF) return false;
      return todayStr >= startStr && todayStr <= endStr;
    })
    .map(r => ({
      open_id: r.fields['Requester']?.[0]?.id || '',
      name: r.fields['Requester']?.[0]?.name || '',
    }))
    .filter(e => e.open_id);

  // Merge, deduplicate by open_id
  const byId = new Map();
  remoteProb.forEach(e => byId.set(e.open_id, e));
  wfhToday.forEach(e => { if (!byId.has(e.open_id)) byId.set(e.open_id, e); });
  const allExpected = Array.from(byId.values());

  // 3. Who has already submitted today?
  const allReports = await listRecords(process.env.TABLE_REPORT_STORAGE, '', 500);
  const submittedToday = new Set(
    allReports
      .filter(r => r.fields['日期'] && toSGTDateStr(r.fields['日期']) === todayStr)
      .map(r => r.fields['员工姓名']?.[0]?.id)
      .filter(Boolean)
  );

  const toRemind = allExpected.filter(e => !submittedToday.has(e.open_id));
  console.log(`[notify] ${toRemind.length}/${allExpected.length} employees need a reminder`);

  const title = isSecondReminder
    ? '⏰ Final Reminder: Daily Report Due Today'
    : '📝 Daily Report Reminder';
  const body = isSecondReminder
    ? `Hi there! This is your **final reminder** — please submit your daily work report before end of day.`
    : `Hi there! Just a friendly reminder to submit your **daily work report** for today.`;

  let sent = 0;
  for (const emp of toRemind) {
    const card = buildCard({
      title,
      template: isSecondReminder ? 'orange' : 'blue',
      body: body.replace('Hi there!', `Hi **${emp.name || 'there'}**!`),
      buttonText: '📝 Submit My Report',
      buttonUrl: FRONTEND_URL,
    });
    try {
      await sendCard(emp.open_id, card);
      sent++;
    } catch (err) {
      console.error(`[notify] Failed to remind ${emp.name} (${emp.open_id}):`, err.message);
    }
  }

  console.log(`[notify] Sent ${sent} reminders`);
  return { sent, skipped: toRemind.length - sent, total: allExpected.length };
}

// Notify a manager that a report was just submitted
async function notifyManager(employeeName, managerOpenId) {
  if (!managerOpenId) return;

  const card = buildCard({
    title: '✅ New Report Submitted',
    template: 'green',
    body: `**${employeeName}** has just submitted their daily work report.`,
    buttonText: '📋 View Team Reports',
    buttonUrl: FRONTEND_URL,
  });

  try {
    await sendCard(managerOpenId, card);
    console.log(`[notify] Manager ${managerOpenId} notified about ${employeeName}`);
  } catch (err) {
    console.error(`[notify] Failed to notify manager ${managerOpenId}:`, err.message);
  }
}

// Look up an employee's manager open_id from Remote/Probation or WFH tables
async function lookupManagerOpenId(employeeOpenId) {
  try {
    const empRecords = await listRecords(process.env.TABLE_REMOTE_PROBATION);
    const match = empRecords.find(r => r.fields['Employee']?.[0]?.id === employeeOpenId);
    if (match) {
      return match.fields['Direct Manager']?.[0]?.id || null;
    }

    // Fallback: check WFH table for active record today
    const todayStr = toSGTDateStr(Date.now());
    const wfhRecords = await listRecords(process.env.TABLE_WFH_REQUEST, '', 500);
    const wfhMatch = wfhRecords.find(r => {
      const assignee = r.fields['Requester']?.[0]?.id;
      if (assignee !== employeeOpenId) return false;
      const start = r.fields['Start time'];
      const end = r.fields['End time'];
      if (!start || !end) return false;
      const startStr = toSGTDateStr(start);
      const endStr = toSGTDateStr(end);
      return todayStr >= startStr && todayStr <= endStr;
    });
    return wfhMatch ? wfhMatch.fields['Direct Manager']?.[0]?.id || null : null;
  } catch (err) {
    console.error('[notify] lookupManagerOpenId error:', err.message);
    return null;
  }
}

module.exports = { sendDailyReminders, notifyManager, lookupManagerOpenId };
