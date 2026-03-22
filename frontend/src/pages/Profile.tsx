import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Target, BookOpen, Zap, AlertCircle, CheckCircle, Lightbulb } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { useStore } from '../store'
import { getProfile } from '../api/profile'
import { getSessionHistory } from '../api/sessions'
import type { LearningProfile, ProfileStats, SessionHistoryItem } from '../types'

function scoreColor(score: number | null): string {
  if (score === null) return '#52525b'
  if (score >= 80) return '#98E89E'
  if (score >= 50) return '#E8E870'
  return '#e11d48'
}

// ─── XP / Level system ───────────────────────────────────────────────────────

const LEVELS = [
  { level: 1, xpRequired: 0,    title: 'Beginner',    emoji: '🌱' },
  { level: 2, xpRequired: 200,  title: 'Learner',     emoji: '📚' },
  { level: 3, xpRequired: 500,  title: 'Scholar',     emoji: '🎓' },
  { level: 4, xpRequired: 1000, title: 'Expert',      emoji: '🔬' },
  { level: 5, xpRequired: 2000, title: 'Master',      emoji: '🏆' },
]

function calcXP(totalSessions: number, totalStudyMinutes: number, avgRetention: number): number {
  return (
    totalSessions * 50 +
    Math.floor(totalStudyMinutes / 5) +
    Math.floor(avgRetention / 10) * 10
  )
}

type LevelEntry = typeof LEVELS[number]

function getLevelInfo(xp: number) {
  let current = LEVELS[0]
  let next: LevelEntry | null = LEVELS[1]
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xpRequired) {
      current = LEVELS[i]
      next = LEVELS[i + 1] ?? null
    }
  }
  const xpInLevel = xp - current.xpRequired
  const xpToNext = next ? next.xpRequired - current.xpRequired : 1
  const progress = next ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100
  return { current, next, progress, xpInLevel, xpToNext }
}

// ─── Achievement badges ───────────────────────────────────────────────────────

interface Achievement {
  emoji: string
  title: string
  desc: string
  unlocked: boolean
}

function getAchievements(
  totalSessions: number,
  streak: number,
  avgRetention: number,
  totalHours: number,
  topicsMastered: number,
): Achievement[] {
  return [
    { emoji: '🌱', title: 'First Step',    desc: 'Complete your first session',  unlocked: totalSessions >= 1 },
    { emoji: '🔥', title: 'On Fire',       desc: '10 sessions completed',         unlocked: totalSessions >= 10 },
    { emoji: '💪', title: 'Committed',     desc: '25 sessions completed',         unlocked: totalSessions >= 25 },
    { emoji: '⚡', title: 'Momentum',      desc: '3-day study streak',            unlocked: streak >= 3 },
    { emoji: '🌟', title: 'Unstoppable',   desc: '7-day study streak',            unlocked: streak >= 7 },
    { emoji: '🧠', title: 'Sharp Mind',    desc: 'Average retention above 80%',   unlocked: avgRetention >= 80 },
    { emoji: '💯', title: 'Perfectionist', desc: 'Average retention above 90%',   unlocked: avgRetention >= 90 },
    { emoji: '⏰', title: 'Dedicated',     desc: '5+ hours of total study',       unlocked: totalHours >= 5 },
    { emoji: '📖', title: 'Bookworm',      desc: '20+ hours of total study',      unlocked: totalHours >= 20 },
    { emoji: '🏅', title: 'Topic Master',  desc: '5 topics mastered',             unlocked: topicsMastered >= 5 },
    { emoji: '🎓', title: 'Scholar',       desc: '15 topics mastered',            unlocked: topicsMastered >= 15 },
    { emoji: '🚀', title: 'Rocket',        desc: 'Complete a 2-hour session',     unlocked: totalHours >= 2 && totalSessions >= 1 },
  ]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} className="glass px-5 py-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-zinc-500 text-xs font-mono uppercase tracking-wide">{label}</span>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="text-3xl font-bold text-white font-mono">{value}</div>
      {sub && <div className="text-zinc-600 text-xs mt-1">{sub}</div>}
    </motion.div>
  )
}

function InsightCard({
  emoji, title, description, action, onAction,
}: {
  emoji: string; title: string; description: string; action?: string; onAction?: () => void
}) {
  return (
    <motion.div whileHover={{ scale: 1.02 }} className="glass p-5">
      <div className="text-2xl mb-2">{emoji}</div>
      <p className="text-white font-semibold text-sm">{title}</p>
      <p className="text-zinc-500 text-sm mt-1 leading-relaxed">{description}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-3 text-sm font-medium font-mono transition-colors hover:opacity-80"
          style={{ color: '#98E89E' }}
        >
          {action} →
        </button>
      )}
    </motion.div>
  )
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`glass p-4 flex flex-col items-center gap-2 text-center transition-all duration-300 ${
        achievement.unlocked ? '' : 'opacity-30 grayscale'
      }`}
      style={achievement.unlocked ? { borderColor: 'rgba(152,232,158,0.15)' } : undefined}
    >
      <span className="text-2xl">{achievement.emoji}</span>
      <p className="text-white text-xs font-semibold leading-tight">{achievement.title}</p>
      <p className="text-zinc-500 text-xs leading-tight">{achievement.desc}</p>
      {achievement.unlocked && (
        <span
          className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ backgroundColor: 'rgba(152,232,158,0.12)', color: '#98E89E' }}
        >
          unlocked
        </span>
      )}
    </motion.div>
  )
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function LineTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-sm">
      <p className="text-zinc-500 font-mono text-xs">{label}</p>
      <p className="text-white font-medium font-mono">{payload[0].value} min</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-sm">
      <p className="text-zinc-500 font-mono text-xs truncate max-w-[120px]">{label}</p>
      <p className="font-medium font-mono" style={{ color: '#E8E870' }}>needs review</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="glass px-5 py-4 animate-pulse">
      <div className="h-3 w-20 rounded-full mb-3 bg-white/[0.06]" />
      <div className="h-8 w-16 rounded-full bg-white/[0.06]" />
    </div>
  )
}

// ─── Study Calendar Heatmap ───────────────────────────────────────────────────

function StudyHeatmap({ sessions }: { sessions: SessionHistoryItem[] }) {
  const DAYS = 28
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build a map: dateStr → minutes studied
  const minutesByDate: Record<string, number> = {}
  for (const s of sessions) {
    if (!s.started_at || !s.ended_at) continue
    const start = new Date(s.started_at)
    const end = new Date(s.ended_at)
    const mins = Math.round((end.getTime() - start.getTime()) / 60000)
    if (mins <= 0) continue
    const key = start.toISOString().slice(0, 10)
    minutesByDate[key] = (minutesByDate[key] ?? 0) + mins
  }

  const cells = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (DAYS - 1 - i))
    const key = d.toISOString().slice(0, 10)
    const mins = minutesByDate[key] ?? 0
    const isToday = i === DAYS - 1
    return { key, mins, isToday, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  })

  function cellColor(mins: number) {
    if (mins === 0) return 'rgba(255,255,255,0.04)'
    if (mins < 15) return 'rgba(152,232,158,0.2)'
    if (mins < 45) return 'rgba(152,232,158,0.45)'
    if (mins < 90) return 'rgba(152,232,158,0.7)'
    return '#98E89E'
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold tracking-tight">Study Activity</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-600 text-xs font-mono">less</span>
          {[0, 15, 45, 90, 120].map((m) => (
            <div key={m} className="w-3 h-3 rounded-sm" style={{ backgroundColor: cellColor(m) }} />
          ))}
          <span className="text-zinc-600 text-xs font-mono">more</span>
        </div>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${DAYS}, 1fr)` }}>
        {cells.map((cell) => (
          <div
            key={cell.key}
            title={`${cell.label}: ${cell.mins > 0 ? `${cell.mins} min` : 'No study'}`}
            className="aspect-square rounded-sm transition-all duration-200 hover:opacity-80 cursor-default"
            style={{
              backgroundColor: cellColor(cell.mins),
              outline: cell.isToday ? '1.5px solid rgba(152,232,158,0.5)' : 'none',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-zinc-700 text-[10px] font-mono">{cells[0].label}</span>
        <span className="text-zinc-700 text-[10px] font-mono">Today</span>
      </div>
    </div>
  )
}

// ─── Actionable Recommendations ───────────────────────────────────────────────

interface Rec { icon: string; title: string; body: string }

function buildRecommendations(
  profile: LearningProfile,
  stats: ProfileStats | undefined,
  sessions: SessionHistoryItem[],
): Rec[] {
  const recs: Rec[] = []
  const avgRetention = stats?.avg_retention_score ?? 0
  const streak = stats?.sessions_streak ?? 0
  const itemsDue = stats?.items_due_for_review ?? 0
  const weakTopics = profile.weak_topics ?? []
  const bestTime = profile.best_focus_time_of_day

  if (itemsDue > 0) {
    recs.push({
      icon: '🔄',
      title: `${itemsDue} review item${itemsDue > 1 ? 's' : ''} waiting`,
      body: 'Spaced repetition works best when done daily. A 5-minute review now beats re-reading for an hour.',
    })
  }

  if (avgRetention < 60 && stats?.total_sessions && stats.total_sessions >= 3) {
    recs.push({
      icon: '🎯',
      title: 'Retention below 60% — try shorter sprints',
      body: 'Your quiz scores suggest chunking is too big. Try a 10–15 min session to reduce cognitive load.',
    })
  }

  if (weakTopics.length > 0) {
    recs.push({
      icon: '📌',
      title: `Re-study: ${weakTopics[0]}`,
      body: `This topic has shown up repeatedly in wrong answers. One focused session on it could unlock a major retention jump.`,
    })
  }

  if (streak === 0) {
    recs.push({
      icon: '🔥',
      title: 'Start a study streak today',
      body: 'Even 10 minutes a day compounds. Consistent short sessions beat marathon cramming for ADHD learners.',
    })
  } else if (streak >= 3) {
    recs.push({
      icon: '🌟',
      title: `${streak}-day streak — keep it going!`,
      body: 'Habit momentum is real. Missing one day now costs you the full compound benefit of your streak.',
    })
  }

  if (bestTime) {
    recs.push({
      icon: '🕐',
      title: `Schedule for ${bestTime}`,
      body: 'Your retention scores are highest in this window. Block it for studying before anything else fills it.',
    })
  }

  const recentSessions = sessions.filter((s) => s.status === 'abandoned').slice(0, 3)
  if (recentSessions.length >= 2) {
    recs.push({
      icon: '⚡',
      title: 'Multiple abandoned sessions detected',
      body: "Consider starting with a 10-min sprint — it's easier to begin and often leads to staying longer.",
    })
  }

  return recs.slice(0, 4)
}

// ─── Main Profile page ────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const { studentId, setProfile } = useStore()

  const [profile, setLocalProfile] = useState<LearningProfile | null>(null)
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
  }, [studentId])

  async function loadProfile() {
    setLoading(true)
    setError(null)
    try {
      const [p, hist] = await Promise.all([
        getProfile(studentId),
        getSessionHistory(studentId).catch(() => [] as SessionHistoryItem[]),
      ])
      setLocalProfile(p)
      setProfile(p)
      setSessions(hist)
    } catch {
      setError("Couldn't load profile. Try refreshing.")
    } finally {
      setLoading(false)
    }
  }

  const stats: ProfileStats | undefined = profile?.stats
  const totalSessions = stats?.total_sessions ?? profile?.total_sessions ?? 0
  const totalStudyMinutes = stats?.total_study_minutes ?? profile?.total_study_minutes ?? 0
  const avgRetention = stats?.avg_retention_score ?? 0
  const itemsDue = stats?.items_due_for_review ?? 0
  const topicsMastered = stats?.topics_mastered_count ?? 0
  const streak = stats?.sessions_streak ?? 0
  const bestStreak = stats?.best_streak ?? streak
  const lastStudyDaysAgo = stats?.last_study_days_ago ?? null
  const totalHours = (totalStudyMinutes / 60)

  // XP & level
  const xp = calcXP(totalSessions, totalStudyMinutes, avgRetention)
  const levelInfo = getLevelInfo(xp)

  // Focus trend — real per-session data from history
  const completedSessions = sessions
    .filter((s) => s.started_at && s.ended_at && s.status === 'completed')
    .slice(-8)
  const focusTrendData = completedSessions.length > 0
    ? completedSessions.map((s, i) => {
        const mins = Math.round(
          (new Date(s.ended_at!).getTime() - new Date(s.started_at!).getTime()) / 60000
        )
        return { session: `S${i + 1}`, minutes: Math.max(0, mins), score: s.avg_score ?? 0 }
      })
    : [{ session: 'S1', minutes: 0, score: 0 }]

  const weakTopicsData = (profile?.weak_topics ?? [])
    .slice(0, 6)
    .map((topic, i) => ({ topic: topic.slice(0, 14), label: topic, priority: 6 - i }))

  const achievements = getAchievements(totalSessions, streak, avgRetention, totalHours, topicsMastered)
  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const recommendations = profile ? buildRecommendations(profile, stats, sessions) : []

  if (loading) {
    return (
      <div className="min-h-screen p-8 max-w-4xl mx-auto space-y-8">
        <div className="h-8 w-40 rounded-full animate-pulse bg-white/[0.04]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48 rounded-2xl animate-pulse bg-white/[0.03]" />
          <div className="h-48 rounded-2xl animate-pulse bg-white/[0.03]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={40} className="text-zinc-600" />
        <p className="text-white font-semibold">{error}</p>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={loadProfile}
          className="btn-mint px-5 py-2.5 font-semibold"
        >
          Try again
        </motion.button>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto space-y-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-3xl font-bold text-white tracking-tight">Your Profile</h1>
      </motion.div>

      {/* ── XP / Level card ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.02 }}
        className="glass p-6"
        style={{ borderColor: 'rgba(152,232,158,0.15)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: 'rgba(152,232,158,0.1)' }}
            >
              {levelInfo.current.emoji}
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wide mb-0.5">
                Level {levelInfo.current.level}
              </p>
              <p className="text-white text-xl font-bold">{levelInfo.current.title}</p>
              <p className="text-zinc-500 text-xs mt-0.5 font-mono">{xp} XP total</p>
            </div>
          </div>
          {levelInfo.next && (
            <div className="text-right">
              <p className="text-xs text-zinc-500 font-mono mb-1">
                {levelInfo.xpInLevel} / {levelInfo.xpToNext} XP to {levelInfo.next.title}
              </p>
              <div className="w-48 h-2 rounded-full overflow-hidden bg-white/[0.06]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${levelInfo.progress}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: '#98E89E' }}
                />
              </div>
            </div>
          )}
          {!levelInfo.next && (
            <p className="text-sm font-semibold" style={{ color: '#98E89E' }}>Max level reached! 🎉</p>
          )}
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard label="Total sessions" value={totalSessions} icon={BookOpen} color="#98E89E" />
        <StatCard label="Study hours" value={totalHours.toFixed(1)} sub="hours total" icon={Clock} color="#98E89E" />
        <StatCard label="Avg retention" value={`${Math.round(avgRetention)}%`} icon={Target} color={scoreColor(avgRetention)} />
        <StatCard
          label="Study streak"
          value={streak > 0 ? streak : bestStreak}
          sub={
            streak > 0
              ? streak === 1 ? 'day' : 'days'
              : bestStreak > 0
                ? `best: ${bestStreak}d${lastStudyDaysAgo != null ? ` · ${lastStudyDaysAgo}d ago` : ''}`
                : 'days'
          }
          icon={Zap}
          color={streak > 0 ? '#E8E870' : '#6B7280'}
        />
      </motion.div>

      {/* Charts */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {/* Focus Duration Trend — real per-session data */}
        <div className="glass p-5">
          <h3 className="text-white font-semibold mb-1 tracking-tight">Session Focus Duration</h3>
          <p className="text-zinc-600 text-xs font-mono mb-4">last {focusTrendData.length} completed session{focusTrendData.length !== 1 ? 's' : ''}</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={focusTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="session"
                  tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={false} tickLine={false} width={28}
                />
                <Tooltip content={<LineTooltip />} />
                <Line
                  type="monotone" dataKey="minutes" stroke="#98E89E"
                  strokeWidth={2} dot={{ fill: '#98E89E', r: 3 }} activeDot={{ r: 5, fill: '#98E89E' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Topics to Review — priority-ranked */}
        <div className="glass p-5">
          <h3 className="text-white font-semibold mb-4 tracking-tight">Topics to Review</h3>
          {weakTopicsData.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weakTopicsData} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="topic"
                    tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide domain={[0, 7]} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="priority" fill="#E8E870" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <CheckCircle size={32} className="text-zinc-700" />
              <p className="text-zinc-500 text-sm">No weak topics identified yet</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Study Calendar Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.10 }}
      >
        <StudyHeatmap sessions={sessions} />
      </motion.div>

      {/* Insights */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      >
        <h2 className="text-white font-semibold text-lg mb-4 tracking-tight">Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <InsightCard
            emoji="🕐"
            title="Best study window"
            description={
              profile?.best_focus_time_of_day
                ? profile.best_focus_time_of_day.charAt(0).toUpperCase() +
                  profile.best_focus_time_of_day.slice(1)
                : 'Not enough data'
            }
          />
          <InsightCard
            emoji="📋"
            title="Strongest format"
            description={profile?.preferred_content_format ?? 'Not enough data'}
          />
          <InsightCard
            emoji="🔄"
            title="Items due today"
            description={`${itemsDue} item${itemsDue !== 1 ? 's' : ''} ready for review`}
            action={itemsDue > 0 ? 'Review now' : undefined}
            onAction={itemsDue > 0 ? () => navigate('/history') : undefined}
          />
          <InsightCard
            emoji="🏆"
            title="Topics mastered"
            description={`${topicsMastered} topic${topicsMastered !== 1 ? 's' : ''} mastered so far`}
          />
        </div>
      </motion.div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.13 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={16} style={{ color: '#E8E870' }} />
            <h2 className="text-white font-semibold text-lg tracking-tight">Recommendations</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommendations.map((rec, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.01 }}
                className="glass p-5"
                style={{ borderColor: 'rgba(232,232,112,0.1)' }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">{rec.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm leading-tight">{rec.title}</p>
                    <p className="text-zinc-500 text-xs mt-1.5 leading-relaxed">{rec.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.14 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-white font-semibold text-lg tracking-tight">Achievements</h2>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-mono"
            style={{ backgroundColor: 'rgba(152,232,158,0.1)', color: '#98E89E' }}
          >
            {unlockedCount} / {achievements.length}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {achievements.map((a) => (
            <AchievementBadge key={a.title} achievement={a} />
          ))}
        </div>
      </motion.div>

      {/* Weak topics tags */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
      >
        <h2 className="text-white font-semibold text-lg mb-4 tracking-tight">Weak topics</h2>
        {(profile?.weak_topics ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(profile?.weak_topics ?? []).map((topic, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: 'rgba(232,232,112,0.08)', color: '#E8E870' }}
              >
                {topic}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No weak spots identified yet — keep studying!</p>
        )}
      </motion.div>
    </div>
  )
}
