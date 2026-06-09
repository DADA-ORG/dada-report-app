import { useState, useEffect } from 'react'
import { useUser } from '../App.jsx'
import { api } from '../utils/api.js'

const INITIAL_FORM = {
  report_type: '',
  roles_focus: '',
  cv_sent: '',
  calls_notes: '',
  interviews: '',
  sourcing_channel: '',
  final_update: '',
}

export default function SubmitPage() {
  const { user, employeeInfo } = useUser()
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [error, setError] = useState(null)

  // Auto-set report type based on employee record
  useEffect(() => {
    if (employeeInfo?.found && employeeInfo.employee_type) {
      setForm(f => ({ ...f, report_type: employeeInfo.employee_type }))
    }
  }, [employeeInfo])

  // Check if already submitted today
  useEffect(() => {
    if (!user?.open_id) return
    api.checkTodaySubmission(user.open_id)
      .then(res => setAlreadySubmitted(res.submitted))
      .catch(() => {})
      .finally(() => setCheckingStatus(false))
  }, [user])

  function set(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.report_type || !form.roles_focus) return
    setSubmitting(true)
    setError(null)
    try {
      await api.submitReport({
        open_id: user.open_id,
        name: user.name,
        ...form,
      })
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <div className="page-header">
        <h1>Daily Work Report</h1>
        <p>{today}</p>
        {user && (
          <div className="user-chip">
            <span>👤</span>
            <span>{user.name}</span>
            {employeeInfo?.found && (
              <span className={`badge badge-${employeeInfo.employee_type?.toLowerCase()}`}>
                {employeeInfo.employee_type}
              </span>
            )}
          </div>
        )}
      </div>

      {checkingStatus ? (
        <div className="center-state" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : submitted || alreadySubmitted ? (
        <div>
          <div className="submitted-banner">
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700 }}>Report submitted!</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                {submitted ? 'Your report has been saved.' : 'You already submitted today.'}
              </div>
            </div>
          </div>
          {alreadySubmitted && !submitted && (
            <div className="card">
              <p style={{ fontSize: 14, color: '#555', textAlign: 'center' }}>
                You have already submitted your report for today.<br />
                Come back tomorrow! 👋
              </p>
            </div>
          )}
          {submitted && (
            <button
              className="btn-primary"
              style={{ margin: '0 16px', width: 'calc(100% - 32px)' }}
              onClick={() => { setSubmitted(false); setAlreadySubmitted(false); setForm(INITIAL_FORM); if (employeeInfo?.found) setForm(f => ({ ...f, report_type: employeeInfo.employee_type })); }}
            >
              Submit Another
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="card">
            {/* Report Type */}
            <div className="field-group">
              <label className="field-label">
                Report Type <span className="required">*</span>
              </label>
              <select
                className="field-input"
                value={form.report_type}
                onChange={set('report_type')}
                required
              >
                <option value="">Select type…</option>
                <option value="Remote">Remote</option>
                <option value="Probation">Probation</option>
                <option value="WFH Request">WFH Request</option>
              </select>
            </div>

            {/* Roles Focus Today */}
            <div className="field-group">
              <label className="field-label">
                Roles Focus Today <span className="required">*</span>
              </label>
              <textarea
                className="field-input"
                placeholder="List the roles/positions you focused on today…"
                value={form.roles_focus}
                onChange={set('roles_focus')}
                required
              />
            </div>

            {/* CVs Sent */}
            <div className="field-group">
              <label className="field-label">CV Sent</label>
              <input
                type="number"
                min="0"
                className="field-input"
                placeholder="0"
                value={form.cv_sent}
                onChange={set('cv_sent')}
              />
            </div>

            {/* Calls & CDD Notes */}
            <div className="field-group">
              <label className="field-label">No. of Calls & CDD Notes</label>
              <textarea
                className="field-input"
                placeholder="Calls made and candidate development notes…"
                value={form.calls_notes}
                onChange={set('calls_notes')}
              />
            </div>

            {/* Interviews */}
            <div className="field-group">
              <label className="field-label">No. of Interviews Today</label>
              <input
                type="number"
                min="0"
                className="field-input"
                placeholder="0"
                value={form.interviews}
                onChange={set('interviews')}
              />
            </div>

            {/* Sourcing Channel */}
            <div className="field-group">
              <label className="field-label">Channel of Sourcing</label>
              <input
                type="text"
                className="field-input"
                placeholder="e.g. LinkedIn, referral, job boards…"
                value={form.sourcing_channel}
                onChange={set('sourcing_channel')}
              />
            </div>

            {/* Final Update */}
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label">Final Case Update</label>
              <textarea
                className="field-input"
                placeholder="Any offer or closing updates…"
                value={form.final_update}
                onChange={set('final_update')}
              />
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 16px', padding: '10px 14px', background: '#fdecea', borderRadius: 8, color: '#c62828', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ padding: '0 16px' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !form.report_type || !form.roles_focus}
            >
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
