import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, BookOpen, RotateCcw } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import clsx from 'clsx'
import { useStore } from '../store'
import { getSessionHistory } from '../api/sessions'
import { getReviewQueue, submitReviewResult } from '../api/quiz'
import type { SessionHistoryItem, ReviewQueueResponse, SpacedRepetitionItem } from '../types'

type StatusFilter = 'all' | 'completed' | 'abandoned'

function scoreColor(score: number | null): string {
  if (score === null) return '#52525b'
  if (score >= 80) return '#98E89E'
  if (score >= 50) return '#E8E870'
  return '#e11d48'
}

function barColor(score: number): string {
  if (score >= 80) return '#98E89E'
  if (score >= 50) return '#E8E870'
  return '#e11d48'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function calcDuration(started: string | null, ended: string | null): string {
  if (!started || !ended) return '—'
  const mins = Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 60000)
  return `${mins} min`
}

function getWeekLabel(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = (dt: Date) => {
    const copy = new Date(dt)
    copy.setHours(0, 0, 0, 0)
    copy.setDate(copy.getDate() - copy.getDay())
    return copy
  }
  const thisWeek = startOfWeek(now)
  const lastWeek = new Date(thisWeek); lastWeek.setDate(lastWeek.getDate() - 7)
  const sessionWeek = startOfWeek(d)
  if (sessionWeek >= thisWeek) return 'This week'
  if (sessionWeek >= lastWeek) return 'Last week'
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function groupByWeek(sessions: SessionHistoryItem[]): [string, SessionHistoryItem[]][] {
  const groups: Record<string, SessionHistoryItem[]> = {}
  for (const s of sessions) {
    const label = getWeekLabel(s.started_at)
    if (!groups[label]) groups[label] = []
    groups[label].push(s)
  }
  // Preserve order: 'This week' first, then 'Last week', then chronologically
  const order = ['This week', 'Last week']
  const entries = Object.entries(groups)
  entries.sort(([a], [b]) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return b.localeCompare(a)
  })
  return entries
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-sm">
      <p className="text-white font-medium">{label}</p>
      <p style={{ color: scoreColor(payload[0].value) }}>{payload[0].value}%</p>
    </div>
  )
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

interface ReviewModalProps {
  queue: ReviewQueueResponse
  onClose: () => void
}

function ReviewModal({ queue, onClose }: ReviewModalProps) {
  const toast = useToast()
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [done, setDone] = useState(false)
  const [correct, setCorrect] = useState(0)

  const items = queue.questions
  const total = items.length
  const current = items[idx]

  async function handleSelect(opt: string) {
    if (showFeedback) return
    setSelected(opt)
    setShowFeedback(true)
    const wasCorrect = opt.trim().charAt(0).toUpperCase() === current.correct_answer.trim().toUpperCase()
    if (wasCorrect) setCorrect((c) => c + 1)
    try {
      await submitReviewResult(current.item_id, wasCorrect)
    } catch (err) {
      // Score still recorded locally — backend sync failed
      const msg = err instanceof Error ? err.message : 'Could not save review result'
      toast.error(msg)
    }
  }

  function handleNext() {
    if (idx + 1 >= total) {
      setDone(true)
    } else {
      setIdx((i) => i + 1)
      setSelected(null)
      setShowFeedback(false)
    }
  }

  const matchesCorrect = (opt: string) =>
    opt.trim().charAt(0).toUpperCase() === current.correct_answer.trim().toUpperCase()

  const isCorrect = (opt: string) => showFeedback && matchesCorrect(opt)
  const isWrong = (opt: string) => showFeedback && selected === opt && !matchesCorrect(opt)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5,7,5,0.95)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-lg p-8"
      >
        {done ? (
          <div className="text-center space-y-6">
            <div className="text-5xl animate-float">🎉</div>
            <h2 className="text-white text-2xl font-bold tracking-tight">Review Complete!</h2>
            <p className="text-zinc-400">You got {correct} of {total} correct</p>
            <button
              onClick={onClose}
              className="btn-mint w-full py-3 font-semibold"
            >
              Done
            </button>
          </div>
        ) : current ? (
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs text-zinc-500 font-mono mb-1">
                <span>{idx + 1} of {total}</span>
                <span>{correct} correct so far</span>
              </div>
              <div className="h-0.5 rounded-full overflow-hidden bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(idx / total) * 100}%`, backgroundColor: '#98E89E' }}
                />
              </div>
            </div>

            <h2 className="text-white text-lg font-semibold leading-snug">{current.question}</h2>

            <div className="space-y-2">
              {current.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => handleSelect(opt)}
                  disabled={showFeedback}
                  className={clsx(
                    'w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-200',
                    !showFeedback && 'border-white/[0.08] text-zinc-200 hover:border-mint/40 hover:bg-mint/[0.04]',
                    isCorrect(opt) && 'border-green-500/50 bg-green-900/20 text-green-300',
                    isWrong(opt) && 'border-rose-500/50 bg-rose-900/20 text-rose-300',
                    showFeedback && !isCorrect(opt) && !isWrong(opt) && 'border-white/[0.06] text-zinc-500'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {showFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-4 text-sm"
                  style={{
                    backgroundColor: selected !== null && matchesCorrect(selected)
                      ? 'rgba(152,232,158,0.06)' : 'rgba(225,29,72,0.06)',
                    borderLeft: `3px solid ${selected !== null && matchesCorrect(selected) ? '#98E89E' : '#e11d48'}`,
                  }}
                >
                  <p className="text-zinc-300">{current.explanation}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {showFeedback && (
              <button
                onClick={handleNext}
                className="btn-mint w-full py-3 font-semibold flex items-center justify-center gap-2"
              >
                {idx + 1 >= total ? 'See Results' : 'Next →'}
              </button>
            )}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: SessionHistoryItem }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const statusStyle = {
    completed: { backgroundColor: 'rgba(152,232,158,0.1)', color: '#98E89E' },
    active:    { backgroundColor: 'rgba(232,232,112,0.1)', color: '#E8E870' },
    abandoned: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a' },
  }[session.status] ?? { backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a' }

  const scoreStyle = session.avg_score !== null
    ? { color: scoreColor(session.avg_score) }
    : { color: '#52525b' }

  const chartData = session.avg_score !== null
    ? [{ topic: 'Overall', score: Math.round(session.avg_score) }]
    : []

  const materials = session.materials_covered ?? []

  return (
    <motion.div whileHover={{ scale: 1.005 }} className="glass overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-xs text-zinc-500 font-mono">{formatDate(session.started_at)}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={statusStyle}>
              {session.status}
            </span>
            {session.avg_score !== null && (
              <span className="text-xs font-semibold font-mono" style={scoreStyle}>
                {Math.round(session.avg_score)}%
              </span>
            )}
          </div>
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {session.goal.slice(0, 80)}{session.goal.length > 80 ? '…' : ''}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-zinc-500">🎯 {session.total_sprints} sprints</span>
            <span className="text-xs text-zinc-500">{calcDuration(session.started_at, session.ended_at)}</span>
            {materials.slice(0, 3).map((mat) => (
              <span
                key={mat.id}
                className="text-xs px-2 py-0.5 rounded-full truncate max-w-[120px]"
                style={{ backgroundColor: 'rgba(112,128,232,0.1)', color: '#a5b4fc' }}
              >
                {mat.title}
              </span>
            ))}
            {materials.length > 3 && (
              <span className="text-xs text-zinc-600">+{materials.length - 3} more</span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-zinc-600 mt-1">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 border-t border-white/[0.06] space-y-3">
              {chartData.length > 0 ? (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barSize={32}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="topic"
                        tick={{ fill: '#52525b', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: '#52525b', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        axisLine={false} tickLine={false} width={32}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="score" fill={barColor(chartData[0]?.score ?? 0)} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-zinc-600 text-sm">No score data available</p>
              )}

              {materials.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 font-mono mb-1.5">Materials covered</p>
                  <div className="flex flex-wrap gap-2">
                    {materials.map((mat) => (
                      <span
                        key={mat.id}
                        className="text-xs px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: 'rgba(112,128,232,0.1)', color: '#a5b4fc' }}
                      >
                        {mat.subject ? `${mat.subject} · ` : ''}{mat.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {session.avg_score !== null && session.avg_score < 50 && (
                <p className="text-xs font-mono" style={{ color: '#E8E870' }}>⚠ Needs review</p>
              )}

              {/* Retry button */}
              <button
                onClick={() => {
                  // Store goal in sessionStorage so Home can pre-fill it
                  sessionStorage.setItem('focuspilot_retry_goal', session.goal)
                  navigate('/')
                }}
                className="flex items-center gap-1.5 text-xs font-medium mt-1 transition-colors hover:opacity-90"
                style={{ color: '#a5b4fc' }}
              >
                <RotateCcw size={11} />
                Study this topic again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main History page ────────────────────────────────────────────────────────

export default function History() {
  const { studentId } = useStore()

  const [sessions, setSessions] = useState<SessionHistoryItem[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    loadData()
  }, [studentId])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [hist, queue] = await Promise.all([
        getSessionHistory(studentId),
        getReviewQueue(studentId),
      ])
      setSessions(hist)
      setReviewQueue(queue)
    } catch {
      setError('Could not load history. Please try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = statusFilter === 'all'
    ? sessions
    : sessions.filter((s) => s.status === statusFilter)

  const grouped = groupByWeek(filtered)

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto space-y-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-3xl font-bold text-white tracking-tight">History</h1>
      </motion.div>

      {/* Review Due section */}
      {!loading && reviewQueue && (
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        >
          {reviewQueue.items_due > 0 ? (
            <div
              className="glass px-6 py-5 flex items-center justify-between"
              style={{ borderColor: 'rgba(232,232,112,0.2)' }}
            >
              <div>
                <p className="text-white font-semibold">
                  {reviewQueue.items_due} items to review today
                </p>
                <p className="text-zinc-400 text-sm mt-0.5">
                  Keep your memory fresh with spaced repetition
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowReview(true)}
                className="px-5 py-2.5 rounded-full font-semibold text-sm flex-shrink-0 active:scale-[0.98] transition-all"
                style={{ backgroundColor: '#E8E870', color: '#050705', boxShadow: undefined }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 0 16px rgba(232,232,112,0.35)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                Start Review →
              </motion.button>
            </div>
          ) : (
            <div
              className="glass px-6 py-5 flex items-center gap-3"
              style={{ borderColor: 'rgba(152,232,158,0.2)' }}
            >
              <CheckCircle size={18} style={{ color: '#98E89E' }} />
              <p className="text-white font-medium">All caught up! 🎉</p>
              <p className="text-zinc-400 text-sm ml-1">No reviews due today.</p>
            </div>
          )}
        </motion.section>
      )}

      {/* Error */}
      {error && (
        <div className="glass px-4 py-3 flex items-center gap-2 text-sm"
          style={{ borderColor: 'rgba(232,232,112,0.2)', color: '#E8E870' }}>
          <XCircle size={14} />
          {error}
        </div>
      )}

      {/* Sessions list */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-semibold text-lg">Study history</h2>
            {!loading && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-mono"
                style={{ backgroundColor: 'rgba(152,232,158,0.1)', color: '#98E89E' }}
              >
                {filtered.length}
              </span>
            )}
          </div>
          {/* Status filter pills */}
          {!loading && sessions.length > 0 && (
            <div className="flex gap-2">
              {(['all', 'completed', 'abandoned'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 border"
                  style={
                    statusFilter === f
                      ? { backgroundColor: 'rgba(152,232,158,0.15)', borderColor: 'rgba(152,232,158,0.4)', color: '#98E89E' }
                      : { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#52525b' }
                  }
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl animate-pulse bg-white/[0.03]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-4"
          >
            <BookOpen size={48} className="text-zinc-700" />
            <p className="text-white font-medium">
              {sessions.length === 0 ? 'No sessions yet' : 'No sessions match this filter'}
            </p>
            <p className="text-zinc-500 text-sm text-center max-w-xs">
              {sessions.length === 0
                ? 'Your study sessions will appear here. Start one from the home page!'
                : 'Try a different filter to see your sessions.'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([weekLabel, items]) => (
              <div key={weekLabel}>
                <p className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-3">
                  {weekLabel}
                </p>
                <div className="space-y-3">
                  {items.map((session, i) => (
                    <motion.div
                      key={session.session_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <SessionCard session={session} />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Modal */}
      <AnimatePresence>
        {showReview && reviewQueue && reviewQueue.items_due > 0 && (
          <ReviewModal
            queue={reviewQueue}
            onClose={() => {
              setShowReview(false)
              loadData()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
