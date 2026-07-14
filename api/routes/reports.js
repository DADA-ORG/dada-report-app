const express = require('express');
const router = express.Router();
const { listRecords, createRecord } = require('../utils/larkClient');
const { notifyManager, lookupManagerOpenId } = require('../utils/notifications');
const { getUserRole } = require('../utils/roles');

// GET /api/reports?open_id=xxx&date=YYYY-MM-DD
// Returns reports scoped to the caller's own role — role and manager scope
// are ALWAYS re-derived server-side from open_id, never trusted from the
// client. employee role gets 403; manager sees only their own team; admin
// sees everything. (2026-07-14 — closes an authorization gap where any
// authenticated caller could pass/omit manager_open_id directly and read
// every employee's reports regardless of their actual role.)
router.get('/', async (req, res) => {
  try {
    const { open_id, date, employee_open_id } = req.query;
    if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

    const { role } = await getUserRole(open_id);
    if (role === 'employee') return res.status(403).json({ error: 'Forbidden' });

    // Admin may optionally narrow to one employee via employee_open_id.
    // (Not currently used by the frontend, kept admin-only to avoid a
    // manager/employee using it to read someone outside their own scope.)
    const filter = (role === 'admin' && employee_open_id)
      ? `CurrentValue.[员工姓名].id = "${employee_open_id}"`
      : '';

    const records = await listRecords(process.env.TABLE_REPORT_STORAGE, filter, 1000);

    // Manager filtering happens here in app code, after fetching, rather
    // than via a Bitable filter formula. "Direct Manager" is Lark Base's
    // built-in auto-computed field (resolves the manager from the company
    // org chart off the 员工姓名 field) — reading it directly from a fetched
    // record works fine (this is how the notification path already reads
    // it from Remote/Probation successfully), but Bitable's filter formula
    // doesn't support querying `.id` on this field type, so passing it into
    // `filter` silently matches nothing. Read-then-filter-in-JS sidesteps
    // that entirely.
    const filteredRecords = role === 'manager'
      ? records.filter(r => r.fields['Direct Manager']?.[0]?.id === open_id)
      : records;

    const reports = filteredRecords.map(r => ({
      record_id: r.record_id,
      date: r.fields['日期'] || null,
      employee_name: r.fields['员工姓名']?.[0]?.name || '',
      employee_open_id: r.fields['员工姓名']?.[0]?.id || '',
      report_type: r.fields['Report Type']?.[0]?.text || r.fields['Report Type'] || '',
      roles_focus: r.fields['Roles Focus Today'] || '',
      cv_sent: r.fields['CV Sent:'] || 0,
      calls_notes: r.fields['No of Calls & CDD Name'] || '',
      interviews: r.fields['No of itw today:'] || 0,
      sourcing_channel: r.fields['Channel of Sourcing & Results'] || '',
      final_update: r.fields['Final case update (if any):'] || '',
      submitted_on: r.fields['Submitted on'] || null,
      report_date: r.fields['Report Date'] || null,
    }));

    // Sort by date desc
    reports.sort((a, b) => (b.date || 0) - (a.date || 0));
    res.json(reports);
  } catch (err) {
    console.error('Reports GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports
// Body: report form data + open_id of submitter
router.post('/', async (req, res) => {
  try {
    const {
      open_id,
      name,
      report_type,
      roles_focus,
      cv_sent,
      calls_notes,
      interviews,
      sourcing_channel,
      final_update,
      report_date,
    } = req.body;

    if (!open_id || !report_type || !roles_focus || !report_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const SGT_OFFSET = 8 * 60 * 60 * 1000;
    const todayStr = new Date(Date.now() + SGT_OFFSET).toISOString().split('T')[0];
    const todayMidnight = new Date(todayStr + 'T00:00:00+08:00').getTime();
    // Report Date is the date the employee says this report covers (may
    // differ from the actual submission timestamp, e.g. a catch-up entry).
    const reportDateMidnight = new Date(report_date + 'T00:00:00+08:00').getTime();

    const fields = {
      '日期': todayMidnight,
      'Report Date': reportDateMidnight,
      '员工姓名': [{ id: open_id }],
      'Report Type': report_type,
      'Roles Focus Today': roles_focus,
    };
    if (cv_sent !== undefined && cv_sent !== '') fields['CV Sent:'] = Number(cv_sent);
    if (calls_notes) fields['No of Calls & CDD Name'] = calls_notes;
    if (interviews !== undefined && interviews !== '') fields['No of itw today:'] = Number(interviews);
    if (sourcing_channel) fields['Channel of Sourcing & Results'] = sourcing_channel;
    if (final_update) fields['Final case update (if any):'] = final_update;

    const record = await createRecord(process.env.TABLE_REPORT_STORAGE, fields);
    res.json({ success: true, record_id: record.record_id });

    // Async: notify the employee's direct manager (non-blocking)
    lookupManagerOpenId(open_id)
      .then(managerOpenId => notifyManager(name, managerOpenId))
      .catch(err => console.error('Manager notification error:', err.message));
  } catch (err) {
    console.error('Reports POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SG public holidays 2026 (YYYY-MM-DD in SGT)
const SG_HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-29', // Chinese New Year Day 1
  '2026-01-30', // Chinese New Year Day 2
  '2026-04-03', // Good Friday
  '2026-05-01', // Labour Day
  '2026-05-12', // Vesak Day
  '2026-06-02', // Hari Raya Haji
  '2026-08-09', // National Day
  '2026-10-20', // Deepavali
  '2026-12-25', // Christmas
]);

const SGT_OFFSET = 8 * 60 * 60 * 1000;

function toSGTDateStr(ts) {
  return new Date(Number(ts) + SGT_OFFSET).toISOString().split('T')[0];
}

function isSGTWorkday(dateStr) {
  if (SG_HOLIDAYS_2026.has(dateStr)) return false;
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC to avoid edge cases
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  return day >= 1 && day <= 5;
}

// GET /api/reports/to-submit?open_id=xxx
// Returns all missed submissions from CUTOFF to today (not just today),
// scoped server-side to the caller's real role — same reasoning as GET /
// above. (2026-07-14)
router.get('/to-submit', async (req, res) => {
  try {
    const { open_id } = req.query;
    if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

    const { role } = await getUserRole(open_id);
    if (role === 'employee') return res.status(403).json({ error: 'Forbidden' });
    const manager_open_id = role === 'manager' ? open_id : null;

    const CUTOFF = '2026-07-06';
    const todayStr = toSGTDateStr(Date.now());
    const sgtHour = new Date(Date.now() + SGT_OFFSET).getUTCHours();
    const isPastDeadline = sgtHour >= 18;

    // Build list of all working days from CUTOFF to today (inclusive)
    const workingDays = [];
    let cursor = new Date(CUTOFF + 'T00:00:00Z');
    const todayEnd = new Date(todayStr + 'T00:00:00Z');
    while (cursor <= todayEnd) {
      const ds = cursor.toISOString().split('T')[0];
      if (isSGTWorkday(ds)) workingDays.push(ds);
      cursor = new Date(cursor.getTime() + 86400000);
    }

    // 1. Remote & Probation employees (same set for every Mon-Fri)
    const empRecords = await listRecords(process.env.TABLE_REMOTE_PROBATION);
    const remoteProb = empRecords
      .map(r => ({
        open_id: r.fields['Employee']?.[0]?.id || '',
        name: r.fields['Employee']?.[0]?.name || '',
        employee_type: r.fields['Employee Type']?.[0]?.text || r.fields['Employee Type'] || '',
        manager_open_id: r.fields['Direct Manager']?.[0]?.id || '',
        manager_name: r.fields['Direct Manager']?.[0]?.name || '',
      }))
      .filter(e => e.open_id);

    // 2. All WFH records from CUTOFF onwards
    const wfhRecords = await listRecords(process.env.TABLE_WFH_REQUEST, '', 500);

    // 3. All submissions from CUTOFF to today — key: "open_id|YYYY-MM-DD"
    const allReports = await listRecords(process.env.TABLE_REPORT_STORAGE, '', 1000);
    const submittedKeys = new Set(
      allReports
        .map(r => {
          const oid = r.fields['员工姓名']?.[0]?.id;
          // Determine which working day this report satisfies using the
          // employee-selected "Report Date" — not the raw submission
          // timestamp ("日期"). Records submitted before the Report Date
          // field existed fall back to 日期.
          const effectiveDate = r.fields['Report Date'] || r.fields['日期'];
          const ds = effectiveDate ? toSGTDateStr(effectiveDate) : null;
          return oid && ds ? `${oid}|${ds}` : null;
        })
        .filter(Boolean)
    );

    // 4. For each working day, find who should have submitted but didn't
    const missed = [];
    for (const dayStr of workingDays) {
      const isToday = dayStr === todayStr;
      const overdue = dayStr < todayStr || (isToday && isPastDeadline);

      // Build expected set for this day
      const byId = new Map();
      remoteProb.forEach(e => byId.set(e.open_id, e));
      wfhRecords
        .filter(r => {
          const start = r.fields['Start time'];
          const end = r.fields['End time'];
          if (!start || !end) return false;
          const startStr = toSGTDateStr(start);
          const endStr = toSGTDateStr(end);
          if (startStr < CUTOFF) return false;
          return dayStr >= startStr && dayStr <= endStr;
        })
        .forEach(r => {
          const open_id = r.fields['Requester']?.[0]?.id || '';
          if (open_id && !byId.has(open_id)) {
            byId.set(open_id, {
              open_id,
              name: r.fields['Requester']?.[0]?.name || '',
              employee_type: 'WFH Request',
              manager_open_id: r.fields['Direct Manager']?.[0]?.id || '',
              manager_name: r.fields['Direct Manager']?.[0]?.name || '',
            });
          }
        });

      let expected = Array.from(byId.values());
      if (manager_open_id) {
        expected = expected.filter(e => e.manager_open_id === manager_open_id);
      }

      for (const emp of expected) {
        if (!submittedKeys.has(`${emp.open_id}|${dayStr}`)) {
          missed.push({ ...emp, due_date: dayStr, overdue });
        }
      }
    }

    // Sort: overdue first, then by date asc (oldest missed at top)
    missed.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.due_date < b.due_date ? -1 : 1;
    });

    const isWorkday = isSGTWorkday(todayStr);
    res.json({ employees: missed, is_workday: isWorkday, today: todayStr });
  } catch (err) {
    console.error('To-submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
