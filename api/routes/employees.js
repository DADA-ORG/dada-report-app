const express = require('express');
const router = express.Router();
const { listRecords } = require('../utils/larkClient');

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
// Returns the employee record for the current user
router.get('/me', async (req, res) => {
  try {
    const { open_id, name } = req.query;
    if (!open_id && !name) return res.status(400).json({ error: 'Missing open_id or name' });

    const records = await listRecords(process.env.TABLE_REMOTE_PROBATION);
    const match = records.find(r => {
      if (open_id) {
        return r.fields['Employee']?.[0]?.id === open_id;
      }
      // Name lookup — case-insensitive
      const empName = r.fields['Employee']?.[0]?.name || '';
      return empName.toLowerCase() === name.toLowerCase();
    });

    if (!match) return res.json({ found: false });
    res.json({
      found: true,
      record_id: match.record_id,
      employee_open_id: match.fields['Employee']?.[0]?.id || '',
      employee_type: match.fields['Employee Type']?.[0]?.text || match.fields['Employee Type'] || '',
      manager_open_id: match.fields['Direct Manager']?.[0]?.id || '',
      manager_name: match.fields['Direct Manager']?.[0]?.name || '',
    });
  } catch (err) {
    console.error('Employee /me error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
