import { useEffect, useRef, useCallback, useState } from 'react'
import { recordDrift } from '../api/sessions'
import { useStore } from '../store'

interface UseDriftDetectionParams {
  sessionId: string
  sprintId: string
  isActive: boolean
}

interface UseDriftDetectionResult {
  isDrifting: boolean
  reanchorQuestion: string | null
  dismissDrift: () => void
  tabReturnSeconds: number | null
  dismissTabReturn: () => void
}

export function useDriftDetection({
  sessionId,
  sprintId,
  isActive,
}: UseDriftDetectionParams): UseDriftDetectionResult {
  const { isDrifting, reanchorQuestion, setDrifting, setReanchor } = useStore()

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollEventsRef = useRef<number[]>([])
  const isTriggeringRef = useRef(false)
  const tabHiddenAtRef = useRef<number | null>(null)

  const [tabReturnSeconds, setTabReturnSeconds] = useState<number | null>(null)

  const INACTIVITY_MS = 90_000        // 90s — tighter for ADHD
  const VISIBILITY_MS = 60_000        // full drift overlay after 60s hidden
  const SCROLL_THRASH_COUNT = 8
  const SCROLL_THRASH_WINDOW_MS = 4_000

  const triggerDrift = useCallback(
    async (signalType: string) => {
      if (!isActive || isTriggeringRef.current) return
      isTriggeringRef.current = true
      try {
        const result = await recordDrift(sessionId, sprintId, signalType)
        setDrifting(true)
        setReanchor(result.reanchor_question)
      } catch (err) {
        console.error('[DriftDetection] Failed to record drift:', err)
      } finally {
        isTriggeringRef.current = false
      }
    },
    [isActive, sessionId, sprintId, setDrifting, setReanchor]
  )

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    if (!isActive) return
    inactivityTimerRef.current = setTimeout(() => {
      triggerDrift('inactivity')
    }, INACTIVITY_MS)
  }, [isActive, triggerDrift])

  const dismissDrift = useCallback(() => {
    setDrifting(false)
    setReanchor(null)
    isTriggeringRef.current = false
    resetInactivityTimer()
    scrollEventsRef.current = []
  }, [setDrifting, setReanchor, resetInactivityTimer])

  const dismissTabReturn = useCallback(() => {
    setTabReturnSeconds(null)
  }, [])

  useEffect(() => {
    if (!isActive) return

    const handleActivity = () => resetInactivityTimer()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now()
        visibilityTimerRef.current = setTimeout(() => {
          triggerDrift('visibility')
        }, VISIBILITY_MS)
      } else {
        const hiddenAt = tabHiddenAtRef.current
        if (visibilityTimerRef.current) {
          clearTimeout(visibilityTimerRef.current)
          visibilityTimerRef.current = null
        }
        if (hiddenAt !== null) {
          const secs = Math.round((Date.now() - hiddenAt) / 1000)
          tabHiddenAtRef.current = null
          // Show welcome-back banner for any absence ≥ 20s
          // (full drift overlay kicks in at 60s via the timer above)
          if (secs >= 20) {
            setTabReturnSeconds(secs)
          }
        }
        resetInactivityTimer()
      }
    }

    const handleScroll = () => {
      resetInactivityTimer()
      const now = Date.now()
      scrollEventsRef.current.push(now)
      scrollEventsRef.current = scrollEventsRef.current.filter(
        (t) => now - t <= SCROLL_THRASH_WINDOW_MS
      )
      if (scrollEventsRef.current.length > SCROLL_THRASH_COUNT) {
        scrollEventsRef.current = []
        triggerDrift('scroll_thrash')
      }
    }

    resetInactivityTimer()

    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current)
    }
  }, [isActive, resetInactivityTimer, triggerDrift])

  return { isDrifting, reanchorQuestion, dismissDrift, tabReturnSeconds, dismissTabReturn }
}
