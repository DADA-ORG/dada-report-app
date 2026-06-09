import { useState, useEffect } from 'react'
import { useUser } from '../App.jsx'
import { api } from '../utils/api.js'

const FILTERS = [
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

function badgeClass(type) {
  const t = (type || '').toLowerCase()
  if (t === 'remote') return 'badge badge-remote'
  if (t === 'probation') return 'badge badge-probation'
  if (t === 'wfh') return 'badge badge-wfh'
  return 'badge'
}

export default function ManagerPage() {
  const { user, role } = useUser()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('today')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user?.open_id) return
    setLoading(true)

    // Admins see all reports; managers see only their team
    const params = role === 'admin' ? {} : { manager_open_id: user.open_id }
    if (filter === 'today') {
      params.date = new Date().toISOString().split('T')[0]
    }

    api.getReports(params)
      .then(data => setReports(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, role, filter])

  const filtered = reports.filter(r => {
    if (filter === 'today') {
      const today = new Date(); today.setHours(0,0,0,0)
      return r.date >= today.getTime()
    }
    if (['Remote', 'Probation', 'WFH Request'].includes(filter)) {
      return r.report_type === filter
    }
    return true
  })

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <div className="page-header">
        <h1>Team Reports</h1>
        <p>{today}</p>
        {user && (
          <div className="user-chip">
            <span>👤</span>
            <span>{user.name}</span>
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div className="filter-bar">
        {FILTERS.map(f => (
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
          {filter === 'today'
            ? 'No reports submitted yet today.'
            : 'No reports found.'}
        </div>
      ) : (
        <>
          <div className="section-title">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''}
          </div>
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
                <span className={badgeClass(r.report_type)}>{r.report_type}</span>
              </div>

              <div className="report-field">
                <strong>Roles Focus:</strong> {r.roles_focus || '—'}
              </div>

              {/* Expanded detail */}
              {expanded === r.record_id && (
                <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                  {r.cv_sent > 0 && (
                    <div className="report-field"><strong>CVs Sent:</strong> {r.cv_sent}</div>
                  )}
                  {r.interviews > 0 && (
                    <div className="report-field"><strong>Interviews:</strong> {r.interviews}</div>
                  )}
                  {r.calls_notes && (
                    <div className="report-field"><strong>Calls & CDD:</strong> {r.calls_notes}</div>
                  )}
                  {r.sourcing_channel && (
                    <div className="report-field"><strong>Sourcing:</strong> {r.sourcing_channel}</div>
                  )}
                  {r.final_update && (
                    <div className="report-field"><strong>Final Update:</strong> {r.final_update}</div>
                  )}
                  <div className="report-field" style={{ color: '#bbb', fontSize: 12, marginTop: 6 }}>
                    Submitted: {r.submitted_on ? new Date(r.submitted_on).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'right', fontSize: 11, color: '#ccc', marginTop: 6 }}>
                {expanded === r.record_id ? '▲ less' : '▼ more'}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
