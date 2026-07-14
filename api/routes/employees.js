const express = require('express');
const router = express.Router();
const { listRecords } = require('../utils/larkClient');
const { getUserRole } = require('../utils/roles');

// GET /api/employees
// Returns all records from Remote and Probation table
router.get('/', async (req, res) => {
  try {
    const records = await listRecords(process.env.TABLE_REMOTE_PROBATION);
    const employees = records.map(r => ({
      record_id: r.record_id,
      employee_type: r.fields['Employee Type']?.[0]?.text || r.fields['Employee Type'] || '',
      employee_name: r.fields['Employee']?.[0]?.name || '',
      employee_open_id: r.fields['Employee']?.[0]?.id || '',
      manager_name: r.fields['Direct Manager']?.[0]?.name || '',
      manager_open_id: r.fields['Direct Manager']?.[0]?.id || '',
    }));
    res.json(employees);
  } catch (err) {
    console.error('Employees error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/me?open_id=xxx OR ?name=xxx
// Returns the employee record + effective_type for today
// Priority: WFH Request > Probation > Remote
router.get('/me', async (req, res) => {
  try {
    const { open_id, name } = req.query;
    if (!open_id && !name) return res.status(400).json({ error: 'Missing open_id or name' });

    const SGT_OFFSET = 8 * 60 * 60 * 1000;
    function toSGTDateStr(ts) {
      return new Date(Number(ts) + SGT_OFFSET).toISOString().split('T')[0];
    }
    const todayStr = toSGTDateStr(Date.now());

    // 1. Fetch both tables in parallel
    const [empRecords, wfhRecords] = await Promise.all([
      listRecords(process.env.TABLE_REMOTE_PROBATION),
      listRecords(process.env.TABLE_WFH_REQUEST, '', 500),
    ]);

    // Check Remote/Probation table — collect ALL matches (employee may have both rows)
    const matches = empRecords.filter(r => {
      if (open_id) return r.fields['Employee']?.[0]?.id === open_id;
      const empName = r.fields['Employee']?.[0]?.name || '';
      return empName.toLowerCase() === name.toLowerCase();
    });

    // Probation takes priority over Remote when both exist
    const probationMatch = matches.find(r => {
      const t = r.fields['Employee Type']?.[0]?.text || r.fields['Employee Type'] || '';
      return t === 'Probation';
    });
    const baseMatch = probationMatch || matches[0] || null;
    const base_type = baseMatch
      ? (baseMatch.fields['Employee Type']?.[0]?.text || baseMatch.fields['Employee Type'] || '')
      : null;

    // 2. Check WFH Request table for an active record today
    const activeWfh = wfhRecords.find(r => {
      const assigneeId = r.fields['Requester']?.[0]?.id;
      const assigneeName = r.fields['Requester']?.[0]?.name || '';
      const isMatch = open_id
        ? assigneeId === open_id
        : assigneeName.toLowerCase() === name.toLowerCase();
      if (!isMatch) return false;
      const start = r.fields['Start time'];
      const end = r.fields['End time'];
      if (!start || !end) return false;
      return todayStr >= toSGTDateStr(start) && todayStr <= toSGTDateStr(end);
    });

    if (!baseMatch && !activeWfh) return res.json({ found: false });

    // WFH overrides base type for today
    const effective_type = activeWfh ? 'WFH Request' : base_type;

    const managerFromBase = baseMatch?.fields['Direct Manager']?.[0];
    const managerFromWfh  = activeWfh?.fields['Direct Manager']?.[0];
    const manager = managerFromBase || managerFromWfh || null;

    res.json({
      found: true,
      record_id: baseMatch?.record_id || null,
      employee_open_id: baseMatch?.fields['Employee']?.[0]?.id || open_id || '',
      employee_type: base_type,    // standing type (Remote / Probation)
      effective_type,               // what to submit as today
      manager_open_id: manager?.id || '',
      manager_name: manager?.name || '',
    });
  } catch (err) {
    console.error('Employee /me error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/role?open_id=xxx
// Returns role: 'admin' | 'manager' | 'employee'
router.get('/role', async (req, res) => {
  try {
    const { open_id } = req.query;
    if (!open_id) return res.status(400).json({ error: 'Missing open_id' });

    const { role, is_developer } = await getUserRole(open_id);
    console.log(`${open_id} => ${role}`);
    return res.json({ role, is_developer });
  } catch (err) {
    console.error('Role check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
