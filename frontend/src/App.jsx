import { useState, useEffect, createContext, useContext } from 'react'
import SubmitPage from './pages/SubmitPage.jsx'
import ManagerPage from './pages/ManagerPage.jsx'
import { getCodeFromUrl, redirectToLarkAuth } from './utils/lark.js'
import { api } from './utils/api.js'

export const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)

export default function App() {
  const [user, setUser] = useState(null)
  const [employeeInfo, setEmployeeInfo] = useState(null)
  const [role, setRole] = useState('employee') // 'admin' | 'manager' | 'employee'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('submit')

  useEffect(() => {
    async function init() {
      try {
        // ── Fast path: use cached session (same browser tab session) ──
        const cached = sessionStorage.getItem('dada_session')
        if (cached) {
          const { user: u, employeeInfo: emp, role: r } = JSON.parse(cached)
          setUser(u)
          setEmployeeInfo(emp)
          setRole(r)
          setLoading(false)
          return
        }

        const code = getCodeFromUrl()

        if (!code) {
          // No code yet — redirect to Lark OAuth
          redirectToLarkAuth()
          return
        }

        // Exchange code for user identity
        const userInfo = await api.login(code)

        // Clean code from URL without reload
        const url = new URL(window.location.href)
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.toString())

        // Look up employee record and role in parallel
        const [empRecord, roleData] = await Promise.all([
          api.getMyEmployeeRecord(userInfo.open_id),
          api.getUserRole(userInfo.open_id),
        ])

        // Cache for the rest of this browser session
        sessionStorage.setItem('dada_session', JSON.stringify({
          user: userInfo,
          employeeInfo: empRecord,
          role: roleData.role,
        }))

        setUser(userInfo)
        setEmployeeInfo(empRecord)
        setRole(roleData.role)
      } catch (err) {
        // Clear bad cache and retry via OAuth
        sessionStorage.removeItem('dada_session')
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

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

  return (
    <UserContext.Provider value={{ user, employeeInfo, role }}>
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
          {(role === 'admin' || role === 'manager') && (
            <button
              className={`tab-item ${activeTab === 'manager' ? 'active' : ''}`}
              onClick={() => setActiveTab('manager')}
            >
              <span className="tab-icon">👥</span>
              Team Reports
            </button>
          )}
        </nav>
      </div>
    </UserContext.Provider>
  )
}
