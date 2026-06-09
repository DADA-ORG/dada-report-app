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
    if (date) {
      // date format: YYYY-MM-DD
      const ts = new Date(date).getTime();
      const nextDay = ts + 86400000;
      filters.push(`AND(CurrentValue.[日期] >= ${ts}, CurrentValue.[日期] < ${nextDay})`);
    }
    const filter = filters.length > 1
      ? `AND(${filters.join(',')})`
      : filters[0] || '';

    const records = await listRecords(process.env.TABLE_REPORT_STORAGE, filter, 200);

    const reports = records.map(r => ({
      record_id: r.record_id,
      date: r.fields['日期'] || null,
      employee_name: r.fields['员工姓名']?.[0]?.name || '',
      employee_open_id: r.fields['员工姓名']?.[0]?.id || '',
      report_type: r.fields['Report Type']?.[0]?.text || r.fields['Report Type'] || '',
      roles_focus: r.fields['Roles Focus Today'] || '',
      cv_sent: r.fields['CV Sent'] || 0,
      calls_notes: r.fields['No of Calls & CDD Name'] || '',
      interviews: r.fields['No of ITW Today'] || 0,
      sourcing_channel: r.fields['Channel of Sourcing & Results'] || '',
      final_update: r.fields['Final Case Update'] || '',
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
    if (cv_sent !== undefined && cv_sent !== '') fields['CV Sent'] = Number(cv_sent);
    if (calls_notes) fields['No of Calls & CDD Name'] = calls_notes;
    if (interviews !== undefined && interviews !== '') fields['No of ITW Today'] = Number(interviews);
    if (sourcing_channel) fields['Channel of Sourcing & Results'] = sourcing_channel;
    if (final_update) fields['Final Case Update'] = final_update;

    const record = await createRecord(process.env.TABLE_REPORT_STORAGE, fields);
    res.json({ success: true, record_id: record.record_id });
  } catch (err) {
    console.error('Reports POST error:', err.message);
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
