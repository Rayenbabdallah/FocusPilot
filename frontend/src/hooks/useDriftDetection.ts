import { useEffect, useRef, useCallback, useState } from 'react'
import { recordDrift } from '../api/sessions'
import { useStore } from '../store'

interface UseDriftDetectionParams {
  sessionId: string
  sprintId: string
  isActive: boolean
  scrollElementId?: string
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
  scrollElementId = 'content-scroll-area',
}: UseDriftDetectionParams): UseDriftDetectionResult {
  const { isDrifting, reanchorQuestion, setDrifting, setReanchor } = useStore()

  const inactivityTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibilityTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTriggeringRef      = useRef(false)
  const tabHiddenAtRef       = useRef<number | null>(null)

  // Scroll-thrash: track direction reversals, not raw event count
  const lastScrollTopRef     = useRef<number | null>(null)
  const lastScrollDirRef     = useRef<'up' | 'down' | null>(null)
  const reversalTimesRef     = useRef<number[]>([])

  const [tabReturnSeconds, setTabReturnSeconds] = useState<number | null>(null)

  // 2 min inactivity — reading a dense paragraph without touching the mouse is normal
  const INACTIVITY_MS           = 120_000
  // Tab hidden 60s → full drift overlay
  const VISIBILITY_MS           = 60_000
  // 5 direction reversals within 3s = frantic back-and-forth = thrash
  const REVERSAL_THRASH_COUNT   = 5
  const REVERSAL_WINDOW_MS      = 3_000

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
    isTriggeringRef.current  = false
    lastScrollTopRef.current = null
    lastScrollDirRef.current = null
    reversalTimesRef.current = []
    resetInactivityTimer()
  }, [setDrifting, setReanchor, resetInactivityTimer])

  const dismissTabReturn = useCallback(() => {
    setTabReturnSeconds(null)
  }, [])

  // Cancel all timers immediately when isActive goes false
  useEffect(() => {
    if (!isActive) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current)
        visibilityTimerRef.current = null
      }
    }
  }, [isActive])

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
          if (secs >= 20) setTabReturnSeconds(secs)
        }
        resetInactivityTimer()
      }
    }

    const handleScroll = (e: Event) => {
      resetInactivityTimer()

      const target = e.currentTarget as HTMLElement | null
      const scrollTop = target ? target.scrollTop : window.scrollY

      // Determine direction of this scroll tick
      const prev = lastScrollTopRef.current
      if (prev !== null) {
        const dir: 'up' | 'down' = scrollTop < prev ? 'up' : 'down'

        // Count only when direction reverses (down→up or up→down)
        if (lastScrollDirRef.current !== null && lastScrollDirRef.current !== dir) {
          const now = Date.now()
          reversalTimesRef.current.push(now)
          reversalTimesRef.current = reversalTimesRef.current.filter(
            (t) => now - t <= REVERSAL_WINDOW_MS
          )
          if (reversalTimesRef.current.length >= REVERSAL_THRASH_COUNT) {
            reversalTimesRef.current = []
            triggerDrift('scroll_thrash')
          }
        }

        lastScrollDirRef.current = dir
      }

      lastScrollTopRef.current = scrollTop
    }

    resetInactivityTimer()

    const scrollEl = scrollElementId
      ? (document.getElementById(scrollElementId) ?? window)
      : window

    window.addEventListener('mousemove',  handleActivity,               { passive: true })
    window.addEventListener('keydown',    handleActivity,               { passive: true })
    window.addEventListener('click',      handleActivity,               { passive: true })
    window.addEventListener('touchstart', handleActivity,               { passive: true })
    scrollEl.addEventListener('scroll',   handleScroll as EventListener, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('mousemove',  handleActivity)
      window.removeEventListener('keydown',    handleActivity)
      window.removeEventListener('click',      handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      scrollEl.removeEventListener('scroll',   handleScroll as EventListener)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current)
    }
  }, [isActive, scrollElementId, resetInactivityTimer, triggerDrift])

  return { isDrifting, reanchorQuestion, dismissDrift, tabReturnSeconds, dismissTabReturn }
}
