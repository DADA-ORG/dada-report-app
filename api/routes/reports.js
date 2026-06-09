const express = require('express');
const router = express.Router();
const { listRecords, createRecord } = require('../utils/larkClient');

// GET /api/reports?manager_open_id=xxx&date=YYYY-MM-DD
// Returns reports filtered by manager and/or date
router.get('/', async (req, res) => {
  try {
    const { manager_open_id, date, employee_open_id } = req.query;

    // Build Lark Bitable filter formula
    const filters = [];
    if (manager_open_id) {
      filters.push(`CurrentValue.[Direct Manager].id = "${manager_open_id}"`);
    }
    if (employee_open_id) {
      filters.push(`CurrentValue.[员工姓名].id = "${employee_open_id}"`);
    }
    // Date filtering is handled client-side to avoid timezone issues
    const filter = filters.length > 1
      ? `AND(${filters.join(',')})`
      : filters[0] || '';

    console.log('Reports GET params:', { manager_open_id, date, employee_open_id }, 'filter:', filter);
    const records = await listRecords(process.env.TABLE_REPORT_STORAGE, filter, 200);
    console.log('Records fetched:', records.length);

    const reports = records.map(r => ({
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
    } = req.body;

    if (!open_id || !report_type || !roles_focus) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fields = {
      '日期': today.getTime(),
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

// GET /api/reports/to-submit?manager_open_id=xxx (optional)
// Returns employees who should have submitted today but haven't
router.get('/to-submit', async (req, res) => {
  try {
    const { manager_open_id } = req.query;
    const todayStr = toSGTDateStr(Date.now());

    // Only show on workdays
    if (!isSGTWorkday(todayStr)) {
      return res.json({ employees: [], is_workday: false });
    }

    // 1. Remote & Probation employees (submit every Mon-Fri)
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

    // 2. WFH employees for today (from WFH Request table, from June 9 2026 onwards)
    const wfhRecords = await listRecords(process.env.TABLE_WFH_REQUEST, '', 500);
    const CUTOFF = '2026-06-09';
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
        open_id: r.fields['Current assignee']?.[0]?.id || '',
        name: r.fields['Current assignee']?.[0]?.name || '',
        employee_type: 'WFH Request',
        manager_open_id: '',
        manager_name: '',
      }))
      .filter(e => e.open_id);

    // Merge, deduplicate by open_id (Remote/Probation takes priority for manager info)
    const byId = new Map();
    remoteProb.forEach(e => byId.set(e.open_id, e));
    wfhToday.forEach(e => { if (!byId.has(e.open_id)) byId.set(e.open_id, e); });
    let allExpected = Array.from(byId.values());

    // Filter by manager if not admin
    if (manager_open_id) {
      allExpected = allExpected.filter(e => e.manager_open_id === manager_open_id);
    }

    // 3. Who has submitted today?
    const allReports = await listRecords(process.env.TABLE_REPORT_STORAGE, '', 500);
    const submittedToday = new Set(
      allReports
        .filter(r => toSGTDateStr(r.fields['日期']) === todayStr)
        .map(r => r.fields['员工姓名']?.[0]?.id)
        .filter(Boolean)
    );

    // 4. Past end-of-business in SGT? (18:00 = 6PM SGT)
    const sgtHour = new Date(Date.now() + SGT_OFFSET).getUTCHours();
    const isPastDeadline = sgtHour >= 18;

    const notSubmitted = allExpected
      .filter(e => !submittedToday.has(e.open_id))
      .map(e => ({ ...e, due_date: todayStr, overdue: isPastDeadline }));

    res.json({ employees: notSubmitted, is_workday: true });
  } catch (err) {
    console.error('To-submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/check-today?open_id=xxx
// Check if user already submitted today
router.get('/check-today', async (req, res) => {
  try {
    const { open_id } = req.query;
    if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = today.getTime() + 86400000;

    const filter = `AND(CurrentValue.[员工姓名].id = "${open_id}", CurrentValue.[日期] >= ${today.getTime()}, CurrentValue.[日期] < ${tomorrow})`;
    const records = await listRecords(process.env.TABLE_REPORT_STORAGE, filter, 1);
    res.json({ submitted: records.length > 0 });
  } catch (err) {
    console.error('Check today error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
