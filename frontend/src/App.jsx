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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('submit')

  useEffect(() => {
    async function init() {
      try {
        const code = getCodeFromUrl()

        if (!code) {
          // No code yet — redirect to Lark OAuth
          redirectToLarkAuth()
          return
        }

        // Exchange code for user identity
        const userInfo = await api.login(code)
        setUser(userInfo)

        // Clean code from URL without reload
        const url = new URL(window.location.href)
        url.searchParams.delete('code')
        window.history.replaceState({}, '', url.toString())

        // Look up employee record
        const empRecord = await api.getMyEmployeeRecord(userInfo.open_id)
        setEmployeeInfo(empRecord)
      } catch (err) {
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
    <UserContext.Provider value={{ user, employeeInfo }}>
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
          <button
            className={`tab-item ${activeTab === 'manager' ? 'active' : ''}`}
            onClick={() => setActiveTab('manager')}
          >
            <span className="tab-icon">👥</span>
            Team Reports
          </button>
        </nav>
      </div>
    </UserContext.Provider>
  )
}
