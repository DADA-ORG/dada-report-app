import { useState, useEffect } from 'react'
import { useUser } from '../App.jsx'
import { api } from '../utils/api.js'

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

function getTodayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function getMondayStr() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toLocaleDateString('en-CA')
}

// ── Shared report card ──────────────────────────────────────────
function ReportCard({ r, expanded, onToggle }) {
  return (
    <div className="report-card" onClick={onToggle}>
      <div className="report-card-header">
        <div>
          <div className="report-employee">{r.employee_name}</div>
          <div className="report-date">
            {formatDate(r.report_date || r.date)}
            {r.report_date && r.date && new Date(r.report_date).toLocaleDateString('en-CA') !== new Date(r.date).toLocaleDateString('en-CA') && (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}> · catch-up (submitted {formatDate(r.date)})</span>
            )}
          </div>
        </div>
        <span className={badgeStyle(r.report_type)}>{r.report_type}</span>
      </div>
      <div className="report-field"><strong>Roles Focus:</strong> {r.roles_focus || '—'}</div>
      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
          {r.cv_sent > 0 && <div className="report-field"><strong>CVs Sent:</strong> {r.cv_sent}</div>}
          {r.interviews > 0 && <div className="report-field"><strong>Interviews:</strong> {r.interviews}</div>}
          {r.calls_notes && <div className="report-field"><strong>Calls & CDD:</strong> {r.calls_notes}</div>}
          {r.sourcing_channel && <div className="report-field"><strong>Sourcing:</strong> {r.sourcing_channel}</div>}
          {r.final_update && <div className="report-field"><strong>Final Update:</strong> {r.final_update}</div>}
        </div>
      )}
      <div style={{ textAlign: 'right', fontSize: 11, color: '#ccc', marginTop: 6 }}>
        {expanded ? '▲ less' : '▼ more'}
      </div>
    </div>
  )
}

// ── Submitted — main view (Today + This Week) ───────────────────
function ReportsView({ role, onMoreReports }) {
  const { user } = useUser()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user?.open_id) return
    setLoading(true)
    // Server derives role/scope from open_id itself — never trust the
    // client's `role` to decide what data to ask for. (2026-07-14)
    const params = { open_id: user.open_id }
    api.getReports(params)
      .then(d => setReports(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, role])

  if (loading) {
    return <div className="center-state" style={{ minHeight: 200 }}><div className="spinner" /></div>
  }

  const todayStr = getTodayStr()
  const mondayStr = getMondayStr()

  const todayReports = reports.filter(r =>
    new Date(r.date).toLocaleDateString('en-CA') === todayStr
  )
  const weekReports = reports.filter(r => {
    const d = new Date(r.date).toLocaleDateString('en-CA')
    return d >= mondayStr && d < todayStr
  })

  function toggle(id) { setExpanded(e => e === id ? null : id) }

  return (
    <>
      {/* Today section */}
      <div className="section-title">Today · {todayReports.length} report{todayReports.length !== 1 ? 's' : ''}</div>
      {todayReports.length === 0
        ? <div className="empty" style={{ padding: '10px 16px 4px', fontSize: 13 }}>No reports yet today.</div>
        : todayReports.map(r => (
            <ReportCard key={r.record_id} r={r} expanded={expanded === r.record_id} onToggle={() => toggle(r.record_id)} />
          ))
      }

      {/* This Week section */}
      <div className="section-title" style={{ marginTop: 8 }}>
        This Week · {weekReports.length} report{weekReports.length !== 1 ? 's' : ''}
      </div>
      {weekReports.length === 0
        ? <div className="empty" style={{ padding: '10px 16px 4px', fontSize: 13 }}>No earlier reports this week.</div>
        : weekReports.map(r => (
            <ReportCard key={r.record_id} r={r} expanded={expanded === r.record_id} onToggle={() => toggle(r.record_id)} />
          ))
      }

      {/* More Reports */}
      <div style={{ padding: '16px 16px 24px' }}>
        <button className="btn-secondary" onClick={onMoreReports}>
          More Reports →
        </button>
      </div>
    </>
  )
}

// ── All Reports page ────────────────────────────────────────────
const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Remote', value: 'Remote' },
  { label: 'Probation', value: 'Probation' },
  { label: 'WFH', value: 'WFH Request' },
]

function AllReportsView({ role, onBack }) {
  const { user } = useUser()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user?.open_id) return
    setLoading(true)
    // Server derives role/scope from open_id itself — never trust the
    // client's `role` to decide what data to ask for. (2026-07-14)
    const params = { open_id: user.open_id }
    api.getReports(params)
      .then(d => setReports(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, role])

  const filtered = filter === 'all'
    ? reports
    : reports.filter(r => r.report_type === filter)

  function toggle(id) { setExpanded(e => e === id ? null : id) }

  return (
    <div>
      {/* Back bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', background: '#fff',
        borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#0077CC', padding: '0 4px' }}
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#0D2137' }}>All Reports</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>{filtered.length} records</span>
      </div>

      {/* Type filter */}
      <div className="filter-bar">
        {TYPE_FILTERS.map(f => (
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
        <div className="center-state" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>No reports found.</div>
      ) : (
        filtered.map(r => (
          <ReportCard key={r.record_id} r={r} expanded={expanded === r.record_id} onToggle={() => toggle(r.record_id)} />
        ))
      )}
    </div>
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
    // Server derives role/scope from open_id itself — never trust the
    // client's `role` to decide what data to ask for. (2026-07-14)
    const params = { open_id: user.open_id }
    api.getToSubmit(params)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, role])

  if (loading) return <div className="center-state" style={{ minHeight: 200 }}><div className="spinner" /></div>
  if (error) return <div className="empty" style={{ color: '#e53935' }}>{error}</div>

  const employees = data?.employees || []

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
          {overdue.map((e, i) => (
            <div key={`${e.open_id}-${e.due_date}-${i}`} className="to-submit-card overdue">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0D2137' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {e.employee_type}{e.manager_name ? ` · Manager: ${e.manager_name}` : ''}
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
          {pending.map((e, i) => (
            <div key={`${e.open_id}-${e.due_date}-${i}`} className="to-submit-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0D2137' }}>{e.name}</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {e.employee_type}{e.manager_name ? ` · Manager: ${e.manager_name}` : ''}
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
  const [tab, setTab] = useState('submitted')       // 'submitted' | 'to-submit'
  const [showAllReports, setShowAllReports] = useState(false)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  // All-reports page overrides the normal layout
  if (showAllReports) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-brand"><div className="brand-dot" /><span className="brand-tagline">DADA · Search For Excellence</span></div>
          <h1>Team Reports</h1>
          <p>{today}</p>
        </div>
        <AllReportsView role={role} onBack={() => setShowAllReports(false)} />
      </div>
    )
  }

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
            {role === 'admin' && (
              <span style={{ fontSize: 10, background: 'rgba(0,180,204,0.3)', borderRadius: 10, padding: '1px 6px' }}>Admin</span>
            )}
            <a
              href="https://dadaconsultants.sg.larksuite.com/base/X50rbYTrbaF7bNswGMalxuwOglB?table=tblkeUm5tSXaECuD&view=vewQ99yLOI"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#fff', textDecoration: 'underline', marginLeft: 8 }}
            >
              📊 Data Source
            </a>
          </div>
        )}
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button
          onClick={() => setTab('submitted')}
          style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: tab === 'submitted' ? '#0077CC' : '#aaa',
            borderBottom: tab === 'submitted' ? '2px solid #0077CC' : '2px solid transparent',
          }}
        >
          📋 Submitted
        </button>
        <button
          onClick={() => setTab('to-submit')}
          style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: tab === 'to-submit' ? '#e53935' : '#aaa',
            borderBottom: tab === 'to-submit' ? '2px solid #e53935' : '2px solid transparent',
          }}
        >
          🚩 To Submit
        </button>
      </div>

      {tab === 'submitted'
        ? <ReportsView role={role} onMoreReports={() => setShowAllReports(true)} />
        : <ToSubmitView role={role} />
      }
    </div>
  )
}
