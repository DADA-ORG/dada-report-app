const BASE = (import.meta.env.VITE_API_BASE_URL || '') + '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (code) => request('POST', '/auth/login', { code }),
  getMyEmployeeRecord: (open_id) => request('GET', `/employees/me?open_id=${encodeURIComponent(open_id)}`),
  checkTodaySubmission: (open_id) => request('GET', `/reports/check-today?open_id=${open_id}`),
  submitReport: (data) => request('POST', '/reports', data),
  getReports: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/reports?${qs}`);
  },
};
