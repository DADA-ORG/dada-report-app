import { useState, useEffect, createContext, useContext } from 'react'
import SubmitPage from './pages/SubmitPage.jsx'
import ManagerPage from './pages/ManagerPage.jsx'
import { getCodeFromUrl, redirectToLarkAuth } from './utils/lark.js'
import { api } from './utils/api.js'

export const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)

// Developer role picker — only visible to Gracie (admin with is_developer flag)
const DEV_ROLES = [
  { value: 'admin',    label: '🛡️ Admin',    desc: 'Full access' },
  { value: 'manager',  label: '👥 Manager',   desc: 'Team view' },
  { value: 'employee', label: '📝 Employee',  desc: 'Submit view' },
]

function DevRoleSwitcher({ activeRole, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Floating badge */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 72, right: 14, zIndex: 200,
          background: '#0D2137', color: '#00B4CC',
          border: '1.5px solid #00B4CC', borderRadius: 20,
          padding: '5px 12px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', letterSpacing: 0.5,
          boxShadow: '0 2px 10px rgba(0,180,204,0.35)',
        }}
      >
        ⚙️ DEV · {activeRole.toUpperCase()}
      </button>

      {/* Backdrop + sheet */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              background: 'rgba(0,0,0,0.35)',
            }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 400,
            background: '#fff', borderRadius: '18px 18px 0 0',
            padding: '20px 16px 32px',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0D2137', marginBottom: 4 }}>
              ⚙️ Developer Mode
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
              Preview the app as a different role
            </div>
            {DEV_ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => { onChange(r.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '12px 14px', marginBottom: 8,
                  background: activeRole === r.value ? '#f0f7ff' : '#f8f9fb',
                  border: activeRole === r.value ? '2px solid #0077CC' : '1.5px solid #eee',
                  borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: '#0D2137' }}>{r.label}</span>
                <span style={{ fontSize: 12, color: '#999' }}>{r.desc}</span>
                {activeRole === r.value && (
                  <span style={{ color: '#0077CC', fontWeight: 800, marginLeft: 8 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [employeeInfo, setEmployeeInfo] = useState(null)
  const [role, setRole] = useState('employee')       // true role from server
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [activeRole, setActiveRole] = useState('employee') // effective role for UI
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('submit')

  useEffect(() => {
    async function init() {
      try {
        // ── Fast path: use cached session (same browser tab session) ──
        const cached = sessionStorage.getItem('dada_session')
        if (cached) {
          const { user: u, employeeInfo: emp, role: r, isDeveloper: dev } = JSON.parse(cached)
          setUser(u)
          setEmployeeInfo(emp)
          setRole(r)
          setActiveRole(r)
          setIsDeveloper(!!dev)
          setLoading(false)
          return
        }

        const code = getCodeFromUrl()

        if (!code) {
          redirectToLarkAuth()
          return
        }

        // Exchange code for user identity
        const userInfo = await api.login(code)

        // Clean code from URL without reload
        const url = new URL(window.location.href)
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.toString())

        const [empRecord, roleData] = await Promise.all([
          api.getMyEmployeeRecord(userInfo.open_id),
          api.getUserRole(userInfo.open_id),
        ])

        const dev = !!roleData.is_developer

        sessionStorage.setItem('dada_session', JSON.stringify({
          user: userInfo,
          employeeInfo: empRecord,
          role: roleData.role,
          isDeveloper: dev,
        }))

        setUser(userInfo)
        setEmployeeInfo(empRecord)
        setRole(roleData.role)
        setActiveRole(roleData.role)
        setIsDeveloper(dev)
      } catch (err) {
        sessionStorage.removeItem('dada_session')
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // When developer switches role, keep tab in sync
  function handleDevRoleChange(newRole) {
    setActiveRole(newRole)
    // If switching to employee, land on submit tab; otherwise stay
    if (newRole === 'employee') setActiveTab('submit')
    else setActiveTab(activeTab === 'submit' ? 'manager' : activeTab)
  }

  if (loading) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <span>Signing in…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="center-state">
        <span style={{ fontSize: 36 }}>⚠️</span>
        <span style={{ color: '#e74c3c', textAlign: 'center', padding: '0 24px' }}>{error}</span>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('code')
          window.location.href = url.toString()
        }}>
          Retry
        </button>
      </div>
    )
  }

  // Effective role used by child pages (developer can override)
  const effectiveRole = isDeveloper ? activeRole : role

  return (
    <UserContext.Provider value={{ user, employeeInfo, role: effectiveRole }}>
      <div>
        {activeTab === 'submit' && <SubmitPage />}
        {activeTab === 'manager' && <ManagerPage />}

        <nav className="tab-bar">
          <button
            className={`tab-item ${activeTab === 'submit' ? 'active' : ''}`}
            onClick={() => setActiveTab('submit')}
          >
            <span className="tab-icon">📝</span>
            My Report
          </button>
          {(effectiveRole === 'admin' || effectiveRole === 'manager') && (
            <button
              className={`tab-item ${activeTab === 'manager' ? 'active' : ''}`}
              onClick={() => setActiveTab('manager')}
            >
              <span className="tab-icon">👥</span>
              Team Reports
            </button>
          )}
        </nav>

        {/* Developer role switcher — only visible to Gracie */}
        {isDeveloper && (
          <DevRoleSwitcher activeRole={activeRole} onChange={handleDevRoleChange} />
        )}
      </div>
    </UserContext.Provider>
  )
}
