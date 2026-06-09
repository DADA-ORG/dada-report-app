import { useState, useEffect, createContext, useContext } from 'react'
import SubmitPage from './pages/SubmitPage.jsx'
import ManagerPage from './pages/ManagerPage.jsx'
import { getAuthCode } from './utils/lark.js'
import { api } from './utils/api.js'

// Global user context
export const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)

export default function App() {
  const [user, setUser] = useState(null)       // { open_id, name, avatar_url }
  const [employeeInfo, setEmployeeInfo] = useState(null) // from Remote/Probation table
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('submit')

  useEffect(() => {
    async function init() {
      try {
        // 1. Get Lark auth code
        const code = await getAuthCode()

        // 2. Exchange for user identity
        let userInfo
        if (code === 'dev_mock_code') {
          // Dev mode mock
          userInfo = { open_id: 'dev_user_001', name: 'Dev User', avatar_url: '' }
        } else {
          userInfo = await api.login(code)
        }
        setUser(userInfo)

        // 3. Check if this user is in Remote/Probation table
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
        <span>Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="center-state">
        <span style={{ fontSize: 36 }}>⚠️</span>
        <span style={{ color: '#e74c3c' }}>{error}</span>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => location.reload()}>
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

        {/* Bottom Tab Bar */}
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
