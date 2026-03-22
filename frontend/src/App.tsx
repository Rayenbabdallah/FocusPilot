import React, { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Session from './pages/Session'
import History from './pages/History'
import Profile from './pages/Profile'
import ToastContainer from './components/ToastContainer'
import { useStore } from './store'
import { getStudent } from './api/profile'
import { getActiveSession } from './api/sessions'
import { useStudyReminder } from './hooks/useStudyReminder'

export default function App() {
  const { studentId, setStudentName, currentSession, setSession, setPlan, reminderTime } = useStore()
  useStudyReminder(reminderTime)

  useEffect(() => {
    let cancelled = false
    async function initStudent() {
      try {
        const student = await getStudent(studentId)
        if (!cancelled) setStudentName(student.name)
      } catch (err) {
        // 404 = guest student, will be created via Home setup form
        // Any other error is a real network issue — log but don't block
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('404') && !msg.includes('not found') && import.meta.env.DEV) {
          console.warn('[FocusPilot] Could not load student:', msg)
        }
      }
    }
    initStudent()
    return () => { cancelled = true }
  }, [studentId])

  // Restore active session from DB on fresh load (no state in localStorage yet)
  useEffect(() => {
    if (currentSession !== null) return
    let cancelled = false
    async function restoreSession() {
      try {
        const active = await getActiveSession(studentId)
        if (cancelled || !active) return
        setSession({
          id: active.session_id,
          student_id: active.student_id,
          goal: active.goal,
          planned_sprints: active.plan.sprints,
          status: active.status as 'active',
          started_at: active.started_at,
          ended_at: active.ended_at,
        })
        setPlan(active.plan)
        if (active.first_sprint_id) {
          sessionStorage.setItem('focuspilot_first_sprint_id', active.first_sprint_id)
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          const msg = err instanceof Error ? err.message : String(err)
          if (!msg.includes('404') && !msg.includes('No active session')) {
            console.warn('[FocusPilot] Could not restore session:', msg)
          }
        }
      }
    }
    restoreSession()
    return () => { cancelled = true }
  }, [studentId])

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="session" element={<Session />} />
          <Route path="history" element={<History />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
      <ToastContainer />
    </>
  )
}
