import { useState, useEffect } from 'react'
import { useUser } from '../App.jsx'
import { api } from '../utils/api.js'

const REPORT_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'All', value: 'all' },
  { label: 'Remote', value: 'Remote' },
  { label: 'Probation', value: 'Probation' },
  { label: 'WFH', value: 'WFH Request' },
]

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function badgeStyle(type) {
  const t = (type || '').toLowerCase()
  if (t === 'remote') return 'badge badge-remote'
  if (t === 'probation') return 'badge badge-probation'
  return 'badge badge-wfh'
}

// ── Submitted Reports view ──────────────────────────────────────
function ReportsView({ role }) {
  const { user } = useUser()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('today')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user?.open_id) return
    setLoading(true)
    const params = role === 'admin' ? {} : { manager_open_id: user.open_id }
    api.getReports(params)
      .then(data => setReports(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, role])

  const filtered = reports.filter(r => {
    if (filter === 'today') {
      const todayStr = new Date().toLocaleDateString('en-CA')
      return new Date(r.date).toLocaleDateString('en-CA') === todayStr
    }
    if (['Remote', 'Probation', 'WFH Request'].includes(filter)) {
      return r.report_type === filter
    }
    return true
  })

  return (
    <>
      <div className="filter-bar">
        {REPORT_FILTERS.map(f => (
          <button
            key={f.value}
            className={`filter-chip ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="center-state" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
          {filter === 'today' ? 'No reports submitted yet today.' : 'No reports found.'}
        </div>
      ) : (
        <>
          <div className="section-title">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</div>
          {filtered.map(r => (
            <div
              key={r.record_id}
              className="report-card"
              onClick={() => setExpanded(expanded === r.record_id ? null : r.record_id)}
            >
              <div className="report-card-header">
                <div>
                  <div className="report-employee">{r.employee_name}</div>
                  <div className="report-date">{formatDate(r.date)}</div>
                </div>
                <span className={badgeStyle(r.report_type)}>{r.report_type}</span>
              </div>
              <div className="report-field"><strong>Roles Focus:</strong> {r.roles_focus || '—'}</div>
              {expanded === r.record_id && (
                <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                  {r.cv_sent > 0 && <div className="report-field"><strong>CVs Sent:</strong> {r.cv_sent}</div>}
                  {r.interviews > 0 && <div className="report-field"><strong>Interviews:</strong> {r.interviews}</div>}
                  {r.calls_notes && <div className="report-field"><strong>Calls & CDD:</strong> {r.calls_notes}</div>}
                  {r.sourcing_channel && <div className="report-field"><strong>Sourcing:</strong> {r.sourcing_channel}</div>}
                  {r.final_update && <div className="report-field"><strong>Final Update:</strong> {r.final_update}</div>}
                </div>
              )}
              <div style={{ textAlign: 'right', fontSize: 11, color: '#ccc', marginTop: 6 }}>
                {expanded === r.record_id ? '▲ less' : '▼ more'}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ── To Submit view ──────────────────────────────────────────────
function ToSubmitView({ role }) {
  const { user } = useUser()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.open_id) return
    setLoading(true)
    const params = role === 'admin' ? {} : { manager_open_id: user.open_id }
    api.getToSubmit(params)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, role])

  if (loading) return <div className="center-state" style={{ minHeight: 200 }}><div className="spinner" /></div>
  if (error) return <div className="empty" style={{ color: '#e53935' }}>{error}</div>

  const employees = data.employees || []

  if (employees.length === 0) {
    return (
      <div className="empty">
        <div style={{ fontSize: 36, marginBottom: 8 }}>{data?.is_workday ? '✅' : '🌴'}</div>
        {data?.is_workday
          ? 'All team members have submitted — great work!'
          : 'Today is a non-working day. No outstanding submissions.'}
      </div>
    )
  }

  const overdue = employees.filter(e => e.overdue)
  const pending = employees.filter(e => !e.overdue)

  return (
    <>
      <div className="section-title">
        {employees.length} pending · {overdue.length} overdue
      </div>

      {overdue.length > 0 && (
        <>
          <div style={{ padding: '8px 16px 4px', fontSize: 12, fontWeight: 700, color: '#e53935', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🚩 Overdue
          </div>
          {overdue.map(e => (
            <div key={e.open_id} className="to-submit-card overdue">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0D2137' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {e.employee_type} {e.manager_name ? `· Manager: ${e.manager_name}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 1 }}>Due: {e.due_date}</div>
              </div>
              <div className="overdue-flag">🚩 Overdue</div>
            </div>
          ))}
        </>
      )}

      {pending.length > 0 && (
        <>
          <div style={{ padding: '8px 16px 4px', fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ⏳ Pending
          </div>
          {pending.map(e => (
            <div key={e.open_id} className="to-submit-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0D2137' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {e.employee_type} {e.manager_name ? `· Manager: ${e.manager_name}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 1 }}>Due: {e.due_date}</div>
              </div>
              <div className="pending-flag">⏳ Pending</div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────
export default function ManagerPage() {
  const { user, role } = useUser()
  const [view, setView] = useState('submitted') // 'submitted' | 'to-submit'
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-brand">
          <div className="brand-dot" />
          <span className="brand-tagline">DADA · Search For Excellence</span>
        </div>
        <h1>Team Reports</h1>
        <p>{today}</p>
        {user && (
          <div className="user-chip">
            <span>👤</span>
            <span>{user.name}</span>
            {role === 'admin' && <span style={{ fontSize: 10, background: 'rgba(0,180,204,0.3)', borderRadius: 10, padding: '1px 6px' }}>Admin</span>}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button
          onClick={() => setView('submitted')}
          style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: view === 'submitted' ? '#0077CC' : '#aaa',
            borderBottom: view === 'submitted' ? '2px solid #0077CC' : '2px solid transparent',
          }}
        >
          📋 Submitted
        </button>
        <button
          onClick={() => setView('to-submit')}
          style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: view === 'to-submit' ? '#e53935' : '#aaa',
            borderBottom: view === 'to-submit' ? '2px solid #e53935' : '2px solid transparent',
          }}
        >
          🚩 To Submit
        </button>
      </div>

      {view === 'submitted' ? <ReportsView role={role} /> : <ToSubmitView role={role} />}
    </div>
  )
}
