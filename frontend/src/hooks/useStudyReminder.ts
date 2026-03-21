import { useEffect, useRef } from 'react'

/**
 * Schedules a daily browser notification at the given HH:MM time.
 * Requests permission on first call if not already granted.
 * No-ops silently if the Notifications API is unsupported or denied.
 */
export function useStudyReminder(reminderTime: string | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!reminderTime || !('Notification' in window)) return

    function scheduleNext() {
      const [hh, mm] = reminderTime!.split(':').map(Number)
      const now = new Date()
      const next = new Date()
      next.setHours(hh, mm, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      const msUntil = next.getTime() - now.getTime()

      timerRef.current = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification('FocusPilot — Time to study! 🧠', {
            body: "Your study session is ready. Let's keep the streak going.",
            icon: '/icon-192.png',
            tag: 'focuspilot-reminder',
          })
        }
        scheduleNext() // reschedule for tomorrow
      }, msUntil)
    }

    if (Notification.permission === 'granted') {
      scheduleNext()
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') scheduleNext()
      })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [reminderTime])
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}
