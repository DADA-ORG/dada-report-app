// Shared role-lookup logic — used by both the /employees/role endpoint and
// by any route that needs to authorize a request server-side (never trust a
// role or manager_open_id passed in from the client; always re-derive it
// here from the caller's own open_id). (2026-07-14)
const { listRecords } = require('./larkClient');

// Returns { role: 'admin' | 'manager' | 'employee', is_developer: boolean }
async function getUserRole(open_id) {
  const adminRecords = await listRecords(process.env.TABLE_ADMIN_TEAM);
  const isAdmin = adminRecords.some(r => {
    const people = r.fields['People'] || [];
    return people.some(p => p.id === open_id);
  });
  if (isAdmin) {
    return { role: 'admin', is_developer: true };
  }

  const empRecords = await listRecords(process.env.TABLE_REMOTE_PROBATION);
  const isManager = empRecords.some(r => {
    const mgr = r.fields['Direct Manager'] || [];
    return mgr.some(m => m.id === open_id);
  });
  if (isManager) {
    return { role: 'manager', is_developer: false };
  }

  return { role: 'employee', is_developer: false };
}

module.exports = { getUserRole };
