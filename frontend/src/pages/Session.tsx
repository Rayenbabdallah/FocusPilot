import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { useNavigate } from 'react-router-dom'
import {
  Send, ChevronRight, Loader2, CheckCircle, XCircle, ArrowRight, Compass, Zap, Clock,
  BookOpen, X, Volume2, VolumeX, RefreshCw, HelpCircle, Battery, BatteryMedium, BatteryLow,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useStore } from '../store'
import { startSprint, completeSprint, askTutor, closeSession, reexplainChunk } from '../api/sessions'
import { generateQuiz, submitQuiz } from '../api/quiz'
import { getCheatsheet } from '../api/materials'
import { useDriftDetection } from '../hooks/useDriftDetection'
import type {
  Sprint, ContentChunk, GenerateQuizResponse, GradeQuizResponse,
  RetentionSnapshot, TutorMessage, CloseSessionResponse,
} from '../types'

// ─── Mermaid diagram renderer ────────────────────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#1a1f2e',
    primaryTextColor: '#e4e4e7',
    primaryBorderColor: 'rgba(152,232,158,0.35)',
    lineColor: '#98E89E',
    secondaryColor: 'rgba(112,128,232,0.15)',
    tertiaryColor: 'rgba(255,255,255,0.03)',
    edgeLabelBackground: '#0f1117',
    nodeBorder: 'rgba(152,232,158,0.4)',
    clusterBkg: 'rgba(255,255,255,0.02)',
    titleColor: '#98E89E',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
  },
  securityLevel: 'loose',
})

let _mermaidCounter = 0

function MermaidDiagram({ code }: { code: string }) {
  const id = useRef(`mermaid-${++_mermaidCounter}`).current
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    setError(null)
    mermaid.render(id, code.trim()).then(({ svg }) => {
      if (ref.current) {
        // Safe: mermaid sanitizes its own SVG output and securityLevel is set to 'loose'
        // for diagram label rendering — no user-controlled input reaches this path.
        ref.current.innerHTML = svg
      }
    }).catch((err) => {
      setError(String(err?.message ?? err))
    })
  }, [code, id])

  if (error) {
    // Fall back to styled code block so content is never lost
    return (
      <div className="my-4 px-5 py-4 rounded-2xl font-mono text-xs overflow-x-auto"
        style={{ backgroundColor: 'rgba(112,128,232,0.06)', color: '#a5b4fc', border: '1px solid rgba(112,128,232,0.12)' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{code}</pre>
      </div>
    )
  }

  return (
    <div className="my-5 flex justify-center">
      <div
        ref={ref}
        className="rounded-2xl p-4 overflow-x-auto max-w-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(152,232,158,0.12)' }}
      />
    </div>
  )
}

// ─── Content renderer ────────────────────────────────────────────────────────

// Map section emoji → accent color and background
const CALLOUT_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  '📌': { bg: 'rgba(152,232,158,0.07)', border: '#98E89E',  color: '#c6f5c9' },
  '💡': { bg: 'rgba(232,232,112,0.07)', border: '#E8E870',  color: '#f0f0a0' },
  '🧠': { bg: 'rgba(165,180,252,0.08)', border: '#a5b4fc',  color: '#c4cffe' },
  '⚡': { bg: 'rgba(251,191,36,0.07)',  border: '#fbbf24',  color: '#fde68a' },
  '⚠':  { bg: 'rgba(251,146,60,0.08)', border: '#fb923c',  color: '#fed7aa' },
  '🔑': { bg: 'rgba(232,232,112,0.07)', border: '#E8E870',  color: '#f0f0a0' },
}

function getCalloutEmoji(text: string): string | null {
  for (const emoji of Object.keys(CALLOUT_STYLES)) {
    if (text.startsWith(emoji)) return emoji
  }
  return null
}

// Pre-process markdown:
// • Lines starting with callout emojis → blockquote (for styled callout cards)
// • ▶ formula lines → inline code
function preprocessMarkdown(text: string): string {
  const calloutEmojis = Object.keys(CALLOUT_STYLES)
  return text
    .split('\n')
    .map(line => {
      const t = line.trim()
      if (t.startsWith('▶')) return `\`${t.replace(/\*\*/g, '').replace(/\*/g, '')}\``
      if (calloutEmojis.some(e => t.startsWith(e))) return `> ${t}`
      return line
    })
    .join('\n')
}

function MarkdownContent({ text, small = false }: { text: string; small?: boolean }) {
  const processed = preprocessMarkdown(text)
  const prose = small ? 'text-sm' : 'text-base'

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Headings ──────────────────────────────────────────────────────
        h1: ({ children }) => (
          <h1 className="text-white font-extrabold text-xl mt-8 mb-3 tracking-tight leading-snug">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <div className="mt-8 mb-4">
            <h2 className={`text-white font-bold ${small ? 'text-sm' : 'text-base'} tracking-tight leading-snug`}>
              {children}
            </h2>
            <div className="h-px mt-2" style={{ background: 'linear-gradient(90deg, rgba(152,232,158,0.3) 0%, transparent 100%)' }} />
          </div>
        ),
        h3: ({ children }) => (
          <h3 className="text-zinc-200 font-semibold text-sm mt-5 mb-2 uppercase tracking-wider">
            {children}
          </h3>
        ),
        // ── Body ──────────────────────────────────────────────────────────
        p: ({ children }) => (
          <p className={`${prose} text-zinc-300 mb-3 leading-[1.8]`}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: '#98E89E' }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-zinc-400 not-italic border-b border-dashed border-zinc-600">{children}</em>
        ),
        // ── Lists ─────────────────────────────────────────────────────────
        ul: ({ children }) => (
          <ul className="mb-4 space-y-2">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 space-y-2 list-decimal list-outside pl-5">{children}</ol>
        ),
        li: ({ ordered, children }: { ordered?: boolean; children?: React.ReactNode }) =>
          ordered ? (
            <li className={`${prose} text-zinc-300 leading-[1.75] pl-1`}>{children}</li>
          ) : (
            <li className={`${prose} text-zinc-300 leading-[1.75] flex gap-3 items-start`}>
              <span className="mt-[9px] shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: '#98E89E', opacity: 0.6 }} />
              <span className="flex-1">{children}</span>
            </li>
          ),
        // ── Code / Formulas / Mermaid ─────────────────────────────────────
        // Use <div> not <pre> — avoids "pre inside p" DOM nesting warning
        pre: ({ children }) => (
          <div className="my-4 px-5 py-4 rounded-2xl font-mono text-sm overflow-x-auto"
            style={{ backgroundColor: 'rgba(112,128,232,0.06)', color: '#a5b4fc', border: '1px solid rgba(112,128,232,0.12)' }}>
            {children}
          </div>
        ),
        code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
          const content = String(children ?? '').replace(/\n$/, '')
          const lang = /language-(\w+)/.exec(className ?? '')?.[1]

          // Mermaid block
          if (!inline && lang === 'mermaid') {
            return <MermaidDiagram code={content} />
          }

          // Formula line (▶ prefix)
          if (inline && content.startsWith('▶')) {
            return (
              <span className="inline-flex items-center gap-2 my-2 px-4 py-2 rounded-xl font-mono text-sm font-medium"
                style={{ backgroundColor: 'rgba(112,128,232,0.12)', color: '#a5b4fc', border: '1px solid rgba(112,128,232,0.2)' }}>
                {content}
              </span>
            )
          }

          // Regular inline or block code — pre handles the block container
          return (
            <code className="px-1.5 py-0.5 rounded font-mono text-xs"
              style={{ backgroundColor: inline ? 'rgba(112,128,232,0.12)' : 'transparent', color: '#a5b4fc' }}>
              {children}
            </code>
          )
        },
        // ── Callout cards (blockquote) ─────────────────────────────────────
        blockquote: ({ node, children }: { node?: unknown; children?: React.ReactNode }) => {
          // Extract raw text to detect callout type — node is unist Element, cast via any for traversal
          const typedNode = node as { children?: Array<{ children?: Array<{ value?: string }> }> } | undefined
          const rawText = (typedNode?.children ?? [])
            .flatMap((c) => c?.children ?? [])
            .map((c) => c?.value ?? '')
            .join('')
          const emoji = getCalloutEmoji(rawText)
          const style = emoji ? CALLOUT_STYLES[emoji] : null

          if (style) {
            return (
              <div className="my-4 px-5 py-4 rounded-2xl"
                style={{ backgroundColor: style.bg, borderLeft: `3px solid ${style.border}` }}>
                <div className={`${prose} leading-[1.75]`} style={{ color: style.color }}>
                  {children}
                </div>
              </div>
            )
          }
          return (
            <blockquote className="my-3 px-4 py-3 rounded-xl border-l-2 text-zinc-400"
              style={{ borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              {children}
            </blockquote>
          )
        },
        // ── Dividers ──────────────────────────────────────────────────────
        hr: () => <hr className="my-6 border-white/[0.06]" />,
        // ── Tables ────────────────────────────────────────────────────────
        table: ({ children }) => (
          <div className="overflow-x-auto my-5 rounded-2xl"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead style={{ backgroundColor: 'rgba(152,232,158,0.05)' }}>{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#98E89E' }}>{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-zinc-300 text-sm leading-relaxed">{children}</td>
        ),
      }}
    >
      {processed}
    </ReactMarkdown>
  )
}

// ─── Score circle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const radius = 54
  const circ = 2 * Math.PI * radius
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#98E89E' : score >= 50 ? '#E8E870' : '#e11d48'

  return (
    <svg width={140} height={140} viewBox="0 0 140 140" className="mx-auto">
      <circle cx={70} cy={70} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} />
      <motion.circle
        cx={70} cy={70} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: 'easeOut' }}
        transform="rotate(-90 70 70)"
      />
      <text x={70} y={70} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={28} fontWeight="bold">
        {score}%
      </text>
    </svg>
  )
}

// ─── Quiz Modal ───────────────────────────────────────────────────────────────

type QuizPhase = 'loading' | 'question' | 'results'

interface QuizModalProps {
  quiz: GenerateQuizResponse
  onComplete: (score: number, topics: string[], isDone: boolean) => void
  onClose: () => void
  sessionId: string
  sprintId: string
  chunkText: string
}

function QuizModal({ quiz, onComplete, onClose, sessionId, sprintId }: QuizModalProps) {
  const [phase, setPhase] = useState<QuizPhase>('question')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [gradeResult, setGradeResult] = useState<GradeQuizResponse | null>(null)
  const [snapshot, setSnapshot] = useState<RetentionSnapshot | null>(null)
  const [isDone, setIsDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Focus management — restore focus to triggering element on close
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    // Move focus into modal on open
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()

    // Trap focus inside modal
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [])

  // Quiz answer timing — track fast guesses
  const questionStartTimeRef = useRef<number>(Date.now())
  const [fastWrongCount, setFastWrongCount] = useState(0)

  const questions = quiz.questions
  const total = questions.length
  const currentQ = questions[currentIdx]
  const LETTER_LABELS = ['A', 'B', 'C', 'D']

  // Reset timer when question changes
  useEffect(() => {
    questionStartTimeRef.current = Date.now()
  }, [currentIdx])

  async function handleSelect(optionText: string) {
    if (showFeedback || submitting) return

    const elapsedMs = Date.now() - questionStartTimeRef.current
    const isAnswerCorrect = optionText.trim().charAt(0).toUpperCase() === currentQ.correct_answer.trim().toUpperCase()
    if (elapsedMs < 3000 && !isAnswerCorrect) {
      setFastWrongCount((n) => n + 1)
    }

    setSelectedAnswer(optionText)
    setShowFeedback(true)

    const newAnswers = [...answers, optionText]

    if (currentIdx === total - 1) {
      setSubmitting(true)
      try {
        const grade = await submitQuiz(quiz.quiz_id, newAnswers)
        setAnswers(newAnswers)
        setGradeResult(grade)

        const score = Math.round(grade.score)  // grade.score is already 0-100
        const topics = questions.map((q) => q.question.slice(0, 40))
        const result = await completeSprint(sessionId, sprintId, score, topics)
        setSnapshot(result.retention_snapshot)
        setIsDone(result.is_session_done)
        if (result.next_sprint_id) {
          sessionStorage.setItem('focuspilot_next_sprint_id', result.next_sprint_id)
        }

        setTimeout(() => {
          setPhase('results')
        }, 1200)
      } catch {
        setPhase('results')
      } finally {
        setSubmitting(false)
      }
    } else {
      setAnswers(newAnswers)
    }
  }

  function handleNext() {
    if (currentIdx < total - 1) {
      setCurrentIdx((i) => i + 1)
      setSelectedAnswer(null)
      setShowFeedback(false)
    }
  }

  function handleContinue() {
    const score = gradeResult ? Math.round(gradeResult.score) : 0  // score is already 0-100
    const topics = questions.map((q) => q.question.slice(0, 40))
    onComplete(score, topics, isDone)
  }

  // correct_answer is stored as a letter ("A"), options are "A) ..." — compare first char only
  const matchesCorrect = (optionText: string) =>
    optionText.trim().charAt(0).toUpperCase() === currentQ.correct_answer.trim().toUpperCase()

  const isCorrect = (optionText: string) =>
    showFeedback && selectedAnswer === optionText && matchesCorrect(optionText)

  const isWrong = (optionText: string) =>
    showFeedback && selectedAnswer === optionText && !matchesCorrect(optionText)

  const isHighlightedCorrect = (optionText: string) =>
    showFeedback && matchesCorrect(optionText)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5,7,5,0.97)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass neural-grid w-full max-w-xl p-8 relative overflow-hidden"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quiz"
      >
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={36} className="animate-spin" style={{ color: '#98E89E' }} />
            <p className="text-white text-lg">Generating your quiz...</p>
          </div>
        )}

        {phase === 'question' && currentQ && (
          <div className="space-y-6 relative z-10">
            {/* Progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-500 text-xs font-mono">
                Question {currentIdx + 1} of {total}
              </span>
              <div className="flex gap-1.5">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{
                      backgroundColor: i < currentIdx
                        ? '#98E89E'
                        : i === currentIdx
                        ? 'rgba(152,232,158,0.4)'
                        : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            </div>

            <h2 className="text-white text-xl font-semibold leading-snug">{currentQ.question}</h2>

            <div className="space-y-3">
              {currentQ.options.map((opt, oi) => {
                const letter = LETTER_LABELS[oi] || String(oi + 1)
                const correct = isHighlightedCorrect(opt)
                const wrong = isWrong(opt)
                const selected = selectedAnswer === opt

                return (
                  <button
                    key={oi}
                    onClick={() => handleSelect(opt)}
                    disabled={showFeedback}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-200',
                      !showFeedback && 'hover:border-mint/40 hover:bg-mint/[0.04]',
                      correct && 'border-green-500/50 bg-green-900/20',
                      wrong && 'border-rose-500/50 bg-rose-900/20',
                      selected && !showFeedback && 'border-mint/40 bg-mint/[0.06]',
                      !selected && !correct && !wrong && 'border-white/[0.08]'
                    )}
                  >
                    <span
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{
                        backgroundColor: correct
                          ? 'rgba(34,197,94,0.15)'
                          : wrong
                          ? 'rgba(225,29,72,0.15)'
                          : selected
                          ? 'rgba(152,232,158,0.12)'
                          : 'rgba(255,255,255,0.05)',
                        color: correct ? '#4ade80' : wrong ? '#f87171' : selected ? '#98E89E' : '#71717a',
                      }}
                    >
                      {correct ? <CheckCircle size={14} /> : wrong ? <XCircle size={14} /> : letter}
                    </span>
                    <span className={clsx(
                      'text-sm',
                      correct ? 'text-green-300' : wrong ? 'text-rose-300' : 'text-zinc-200'
                    )}>
                      {opt}
                    </span>
                  </button>
                )
              })}
            </div>

            <AnimatePresence>
              {showFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: isCorrect(selectedAnswer || '')
                      ? 'rgba(152,232,158,0.06)'
                      : 'rgba(225,29,72,0.06)',
                    borderLeft: `3px solid ${isCorrect(selectedAnswer || '') ? '#98E89E' : '#e11d48'}`,
                  }}
                >
                  <p className="text-sm font-medium mb-1" style={{
                    color: isCorrect(selectedAnswer || '') ? '#98E89E' : '#fca5a5',
                  }}>
                    {isCorrect(selectedAnswer || '') ? 'Nicely done!' : "Not quite — here's why:"}
                  </p>
                  <p className="text-zinc-400 text-sm">{currentQ.explanation}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {showFeedback && currentIdx < total - 1 && (
              <button
                onClick={handleNext}
                className="btn-mint w-full py-3 font-semibold flex items-center justify-center gap-2"
              >
                Next <ArrowRight size={16} />
              </button>
            )}

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm font-mono">
                <Loader2 size={14} className="animate-spin" />
                Grading...
              </div>
            )}
          </div>
        )}

        {phase === 'results' && gradeResult && (
          <div className="space-y-6 relative z-10">
            <h2 className="text-white text-xl font-bold text-center tracking-tight">Quiz Results</h2>

            <ScoreCircle score={Math.round(gradeResult.score)} />

            {snapshot && (
              <div className="space-y-4">
                {snapshot.strong_areas.length > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-2">Strong areas</p>
                    <div className="flex flex-wrap gap-2">
                      {snapshot.strong_areas.map((area, i) => (
                        <span key={i} className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(152,232,158,0.12)', color: '#98E89E' }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {snapshot.weak_areas.length > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-2">Still learning</p>
                    <div className="flex flex-wrap gap-2">
                      {snapshot.weak_areas.map((area, i) => (
                        <span key={i} className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(232,232,112,0.1)', color: '#E8E870' }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-zinc-300 text-sm leading-relaxed">{snapshot.summary}</p>
                <p className="text-zinc-500 text-xs">{snapshot.recommendation}</p>
              </div>
            )}

            {fastWrongCount >= 2 && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <span className="text-sm">⚡</span>
                <p className="text-xs leading-relaxed" style={{ color: '#fde68a' }}>
                  {fastWrongCount} answers came in under 3 seconds — you may have been guessing.
                  Worth re-reading before moving on.
                </p>
              </div>
            )}

            <button
              onClick={handleContinue}
              className="btn-mint w-full py-3 font-semibold flex items-center justify-center gap-2"
            >
              {isDone ? 'Finish session →' : 'Continue →'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── Break Timer Modal ────────────────────────────────────────────────────────

const BREAK_ACTIVITIES = [
  { label: 'Take 5 deep breaths', icon: '🌬️' },
  { label: 'Stand up and stretch', icon: '🧘' },
  { label: 'Drink some water', icon: '💧' },
  { label: 'Look at something 20 ft away', icon: '👁️' },
  { label: 'Walk around for 2 minutes', icon: '🚶' },
]

interface BreakTimerModalProps {
  onDone: () => void
}

function BreakTimerModal({ onDone }: BreakTimerModalProps) {
  const BREAK_SECS = 5 * 60
  const [secsLeft, setSecsLeft] = useState(BREAK_SECS)
  const activity = useRef(BREAK_ACTIVITIES[Math.floor(Math.random() * BREAK_ACTIVITIES.length)]).current

  useEffect(() => {
    const id = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) { clearInterval(id); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const pct = ((BREAK_SECS - secsLeft) / BREAK_SECS) * 100
  const mm = Math.floor(secsLeft / 60)
  const ss = secsLeft % 60
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
    >
      <div className="absolute inset-0 bg-black/90" style={{ backdropFilter: 'blur(24px)' }} />
      <motion.div
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative glass w-full max-w-sm p-8 text-center space-y-6"
        role="dialog"
        aria-modal="true"
        aria-label="Break timer"
      >
        <div>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Break time</p>
          <p className="text-5xl font-mono font-bold text-white tabular-nums">{timeStr}</p>
        </div>

        {/* Ring progress */}
        <div className="flex justify-center">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <circle
              cx="48" cy="48" r="40" fill="none"
              stroke="rgba(232,152,232,0.7)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
              transform="rotate(-90 48 48)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
            <text x="48" y="52" textAnchor="middle" fill="#E898E8" fontSize="20">{activity.icon}</text>
          </svg>
        </div>

        <div className="glass px-5 py-4 text-left">
          <p className="text-white font-semibold text-sm">{activity.label}</p>
          <p className="text-zinc-500 text-xs mt-1">Away from the screen helps your brain consolidate.</p>
        </div>

        <button
          onClick={onDone}
          className="w-full py-3 rounded-full border border-white/10 text-zinc-300 text-sm font-semibold hover:bg-white/[0.04] transition-colors"
        >
          {secsLeft === 0 ? "I'm back — let's go!" : 'Skip break'}
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Pre-reading Prime Overlay ────────────────────────────────────────────────

interface PrimingOverlayProps {
  focus: string
  onDismiss: () => void
}

function PrimingOverlay({ focus, onDismiss }: PrimingOverlayProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-8"
      onClick={onDismiss}
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(5,7,5,0.92)', backdropFilter: 'blur(20px)' }} />
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative glass w-full max-w-sm p-8 text-center space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sprint focus"
      >
        <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
          style={{ backgroundColor: 'rgba(152,232,158,0.12)' }}>
          <Compass size={22} style={{ color: '#98E89E' }} />
        </div>
        <div>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-2">As you read, look for:</p>
          <p className="text-white text-lg font-semibold leading-snug">{focus}</p>
        </div>
        <button onClick={onDismiss} className="text-zinc-600 text-xs font-mono hover:text-zinc-300 transition-colors">
          tap anywhere to start →
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Frustration Card ─────────────────────────────────────────────────────────

interface FrustrationCardProps {
  score: number
  onContinue: () => void
}

function FrustrationCard({ score, onContinue }: FrustrationCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-8"
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(5,7,5,0.95)', backdropFilter: 'blur(20px)' }} />
      <motion.div
        initial={{ scale: 0.9, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative glass w-full max-w-sm p-8 text-center space-y-6"
        role="dialog"
        aria-modal="true"
        aria-label="Encouragement"
      >
        <div className="text-4xl">🌱</div>
        <div className="space-y-2">
          <h2 className="text-white text-xl font-bold">That one was tough.</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            A {Math.round(score)}% score means your brain is encountering genuinely new material — that's the hard part, and it's normal.
          </p>
        </div>
        <div className="glass px-5 py-4 text-left space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">Try this before continuing:</p>
          <p className="text-zinc-300 text-sm">Take 3 slow breaths. Your working memory resets between sprints.</p>
          <p className="text-zinc-500 text-xs mt-1">Simplified mode has been turned on for the next chunk.</p>
        </div>
        <button onClick={onContinue} className="btn-mint w-full py-3 font-semibold">
          I'm ready — continue →
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Key Terms Strip ──────────────────────────────────────────────────────────

function KeyTermsStrip({ text }: { text: string }) {
  const terms = Array.from(
    new Set(
      [...text.matchAll(/\*\*([^*]+)\*\*/g), ...text.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1].trim())
        .filter((t) => t.length > 2 && t.length < 40)
    )
  ).slice(0, 8)

  if (terms.length === 0) return null
  return (
    <div className="mb-5">
      <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest mb-2">Key terms</p>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t, i) => (
          <span
            key={i}
            className="px-2.5 py-0.5 rounded-full text-xs font-mono"
            style={{ backgroundColor: 'rgba(112,128,232,0.1)', color: '#a5b4fc', border: '1px solid rgba(112,128,232,0.15)' }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Drift Overlay (reference pattern) ───────────────────────────────────────

interface DriftOverlayProps {
  question: string | null
  onDismiss: () => void
  onBreak: () => void
}

function DriftOverlay({ question, onDismiss, onBreak }: DriftOverlayProps) {
  const [textAnswer, setTextAnswer] = useState('')

  const isMCQ = question
    ? /\n[A-D]\)/.test(question) || /^[A-D]\)\s/m.test(question)
    : false

  const lines = question?.split('\n') ?? []
  const questionText = isMCQ ? lines[0] : question ?? ''
  const options = isMCQ ? lines.slice(1).filter(Boolean) : []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90" style={{ backdropFilter: 'blur(24px)' }} />

      {/* Card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative glass neural-grid max-w-lg w-full p-10 text-center overflow-hidden"
      >
        <div className="relative z-10">
          {/* Icon */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: 'rgba(232,152,232,0.1)', border: '1px solid rgba(232,152,232,0.2)' }}
          >
            <Compass className="w-10 h-10" style={{ color: '#E898E8' }} />
          </div>

          <h2 className="text-3xl font-bold tracking-tight mb-3 text-white">
            Hey — still with us?
          </h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Quick check before we continue
          </p>

          {question ? (
            <>
              <p className="font-semibold text-lg mb-5 text-white leading-snug">
                {questionText}
              </p>
              {isMCQ && options.length > 0 ? (
                <div className="space-y-2 text-left">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={onDismiss}
                      className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.08] text-zinc-300 text-sm hover:border-mint/40 hover:bg-mint/[0.04] transition-all duration-200"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-left">
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    className="w-full rounded-full px-5 py-3 bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-mint/50 placeholder-zinc-600 transition-colors"
                  />
                  <button
                    onClick={onDismiss}
                    disabled={!textAnswer.trim()}
                    className="btn-mint w-full py-3 text-sm font-semibold"
                  >
                    Continue
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onDismiss}
                className="glass p-5 group hover:bg-mint/[0.06] transition-all duration-300"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-mint/20 transition-colors"
                  style={{ backgroundColor: 'rgba(152,232,158,0.08)' }}
                >
                  <Zap className="w-4 h-4" style={{ color: '#98E89E' }} />
                </div>
                <div className="font-semibold text-white text-sm">Re-sync</div>
                <div className="font-mono text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">Return to anchor</div>
              </button>
              <button
                onClick={() => { onDismiss(); onBreak() }}
                className="glass p-5 group hover:bg-lavender/[0.06] transition-all duration-300"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-lavender/20 transition-colors"
                  style={{ backgroundColor: 'rgba(232,152,232,0.08)' }}
                >
                  <Clock className="w-4 h-4" style={{ color: '#E898E8' }} />
                </div>
                <div className="font-semibold text-white text-sm">Take a break</div>
                <div className="font-mono text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">5 min rest</div>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-xl w-16 bg-white/5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: '#98E89E' }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

// ─── Cheatsheet Modal ────────────────────────────────────────────────────────

interface CheatsheetModalProps {
  materialId: string
  materialTitle: string
  onClose: () => void
}

function CheatsheetModal({ materialId, materialTitle, onClose }: CheatsheetModalProps) {
  const [cheatsheet, setCheatsheet] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getCheatsheet(materialId)
        setCheatsheet(data.cheatsheet)
      } catch {
        setError('Could not load cheatsheet. Try again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [materialId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5,7,5,0.96)', backdropFilter: 'blur(16px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="glass neural-grid w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(152,232,158,0.12)' }}>
              <BookOpen size={14} style={{ color: '#98E89E' }} />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Cheatsheet</p>
              <p className="text-zinc-500 text-xs font-mono truncate max-w-[260px]">{materialTitle}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close cheatsheet" className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={28} className="animate-spin" style={{ color: '#98E89E' }} />
              <p className="text-zinc-400 text-sm font-mono">Generating cheatsheet...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <XCircle size={24} className="text-rose-400" />
              <p className="text-zinc-400 text-sm">{error}</p>
            </div>
          ) : cheatsheet ? (
            <MarkdownContent text={cheatsheet} small />
          ) : null}
        </div>

        <div className="flex-shrink-0 px-6 py-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="btn-mint w-full py-2.5 text-sm font-semibold"
          >
            Back to session
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Energy Check Modal ───────────────────────────────────────────────────────

interface EnergyCheckModalProps {
  onSelect: (level: 'full' | 'half' | 'low') => void
  onSkip: () => void
}

function EnergyCheckModal({ onSelect, onSkip }: EnergyCheckModalProps) {
  const options = [
    {
      level: 'full' as const,
      icon: <Battery size={22} />,
      label: 'Fully charged',
      sub: 'Ready to go deep',
      color: '#98E89E',
      bg: 'rgba(152,232,158,0.08)',
      border: 'rgba(152,232,158,0.2)',
    },
    {
      level: 'half' as const,
      icon: <BatteryMedium size={22} />,
      label: 'Half tank',
      sub: 'Can focus with effort',
      color: '#E8E870',
      bg: 'rgba(232,232,112,0.08)',
      border: 'rgba(232,232,112,0.2)',
    },
    {
      level: 'low' as const,
      icon: <BatteryLow size={22} />,
      label: 'Running low',
      sub: 'Short bursts only',
      color: '#fb923c',
      bg: 'rgba(251,146,60,0.08)',
      border: 'rgba(251,146,60,0.2)',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(5,7,5,0.96)', backdropFilter: 'blur(20px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="glass neural-grid w-full max-w-sm p-8 text-center"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(232,232,112,0.1)' }}
        >
          <Zap size={26} style={{ color: '#E8E870' }} />
        </div>
        <h2 className="text-white font-bold text-xl mb-1 tracking-tight">Energy check</h2>
        <p className="text-zinc-500 text-sm mb-7">
          How are you feeling right now?
        </p>
        <div className="space-y-3">
          {options.map((opt) => (
            <button
              key={opt.level}
              onClick={() => onSelect(opt.level)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left transition-all duration-200 hover:scale-[1.02]"
              style={{ backgroundColor: opt.bg, borderColor: opt.border }}
            >
              <span style={{ color: opt.color }}>{opt.icon}</span>
              <div>
                <p className="font-semibold text-white text-sm">{opt.label}</p>
                <p className="text-xs mt-0.5" style={{ color: opt.color, opacity: 0.8 }}>{opt.sub}</p>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={onSkip}
          className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Skip
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Welcome Back Banner ──────────────────────────────────────────────────────

interface WelcomeBackBannerProps {
  seconds: number
  onDismiss: () => void
  onRecap: () => void
}

function WelcomeBackBanner({ seconds, onDismiss, onRecap }: WelcomeBackBannerProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 10000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const mins = Math.floor(seconds / 60)
  const label = mins >= 1 ? `${mins}m ${seconds % 60}s` : `${seconds}s`
  const longAway = seconds >= 120

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
      style={{
        backgroundColor: 'rgba(14,18,14,0.95)',
        border: '1px solid rgba(152,232,158,0.25)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <span className="text-lg">👋</span>
      <div>
        <p className="text-white text-sm font-semibold leading-tight">Welcome back!</p>
        <p className="text-zinc-400 text-xs">
          {longAway ? `Away for ${label} — want a quick recap?` : `Away ${label} — pick up where you left off`}
        </p>
      </div>
      {longAway && (
        <button
          onClick={() => { onRecap(); onDismiss() }}
          className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all"
          style={{ backgroundColor: 'rgba(152,232,158,0.15)', color: '#98E89E', border: '1px solid rgba(152,232,158,0.3)' }}
        >
          Quick recap
        </button>
      )}
      <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-300 transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  )
}

// ─── Focus Check-In Card ──────────────────────────────────────────────────────

interface FocusCheckInProps {
  onRate: (level: 'locked' | 'drifting' | 'lost') => void
}

function FocusCheckInCard({ onRate }: FocusCheckInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-24 right-5 z-[200] p-4 rounded-2xl shadow-2xl w-56"
      style={{
        backgroundColor: 'rgba(14,18,14,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <p className="text-white text-sm font-semibold mb-1">Focus check-in</p>
      <p className="text-zinc-500 text-xs mb-3">How are you doing right now?</p>
      <div className="space-y-2">
        {([
          ['locked', '🔥', 'Locked in'],
          ['drifting', '😐', 'Drifting a bit'],
          ['lost', '😵', 'Lost it'],
        ] as const).map(([level, emoji, label]) => (
          <button
            key={level}
            onClick={() => onRate(level)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12]"
          >
            <span className="text-base">{emoji}</span>
            <span className="text-zinc-300 text-sm">{label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Main Session page ────────────────────────────────────────────────────────

type SessionView = 'active' | 'complete'

export default function Session() {
  const navigate = useNavigate()
  const {
    currentSession, currentSprint, currentChunk, plan,
    setSession, setSprint, setChunk,
    tutorHistory, addTutorMessage,
    isSessionActive, clearSession,
    setDrifting, setReanchor,
    setLastEnergyLevel,
    consecutiveLowScores, incrementLowScores, resetLowScores,
  } = useStore()


  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showNextChunk, setShowNextChunk] = useState(false)
  const nextChunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [useSimplified, setUseSimplified] = useState(false)

  const [showQuiz, setShowQuiz] = useState(false)
  const [currentQuizData, setCurrentQuizData] = useState<GenerateQuizResponse | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)

  const [view, setView] = useState<SessionView>('active')
  const [closeResult, setCloseResult] = useState<CloseSessionResponse | null>(null)

  const [tutorInput, setTutorInput] = useState('')
  const [tutorLoading, setTutorLoading] = useState(false)
  const tutorEndRef = useRef<HTMLDivElement>(null)
  const tutorTextareaRef = useRef<HTMLTextAreaElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [showCheatsheet, setShowCheatsheet] = useState(false)
  const [celebrationScore, setCelebrationScore] = useState<number | null>(null)
  const [showBreakTimer, setShowBreakTimer] = useState(false)
  const [showRecapSnippet, setShowRecapSnippet] = useState(false)
  const [showPrimingOverlay, setShowPrimingOverlay] = useState(false)
  const [showFrustrationCard, setShowFrustrationCard] = useState(false)
  const [frustrationScore, setFrustrationScore] = useState<number | null>(null)
  const [adaptiveBanner, setAdaptiveBanner] = useState(false)

  // Attention features
  const [showEnergyCheck, setShowEnergyCheck] = useState(false)
  const [energyLevel, setEnergyLevel] = useState<'full' | 'half' | 'low' | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isReexplaining, setIsReexplaining] = useState(false)
  const [reexplainedText, setReexplainedText] = useState<string | null>(null)
  const [showFocusCheckIn, setShowFocusCheckIn] = useState(false)
  const [skimWarning, setSkimWarning] = useState(false)
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const chunkReadStartRef = useRef<number | null>(null)
  const focusCheckInRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const showQuizRef = useRef(false)
  const isDriftingRef = useRef(false)

  const { isDrifting, reanchorQuestion, dismissDrift, tabReturnSeconds, dismissTabReturn } = useDriftDetection({
    sessionId: currentSession?.id ?? '',
    sprintId: currentSprint?.id ?? '',
    isActive: isSessionActive && currentSprint !== null,
  })

  useEffect(() => {
    if (currentSession && !currentSprint) {
      const storedSprintId = sessionStorage.getItem('focuspilot_first_sprint_id')
      if (storedSprintId) {
        sessionStorage.removeItem('focuspilot_first_sprint_id')
        // Show energy check as a parallel overlay — sprint starts immediately
        setShowEnergyCheck(true)
        handleStartSprint(storedSprintId)
      }
    }
  }, [currentSession, currentSprint])

  useEffect(() => {
    if (!currentSprint) return
    const secs = currentSprint.duration_minutes * 60
    setTimeLeft(secs)
    setShowNextChunk(false)

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0))
    }, 1000)

    if (nextChunkTimerRef.current) clearTimeout(nextChunkTimerRef.current)
    nextChunkTimerRef.current = setTimeout(() => {
      setShowNextChunk(true)
    }, 40_000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (nextChunkTimerRef.current) clearTimeout(nextChunkTimerRef.current)
    }
  }, [currentSprint?.id])

  useEffect(() => {
    tutorEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tutorHistory, tutorLoading])

  // Track time on chunk for dwell-time detection
  useEffect(() => {
    if (currentChunk) {
      chunkReadStartRef.current = Date.now()
      setReexplainedText(null)
      setSkimWarning(false)
    }
  }, [currentChunk?.index])

  // Stop TTS when chunk changes
  useEffect(() => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
    }
  }, [currentChunk?.index])

  // Keep refs in sync so the interval callback always reads current values
  useEffect(() => { showQuizRef.current = showQuiz }, [showQuiz])
  useEffect(() => { isDriftingRef.current = isDrifting }, [isDrifting])

  // Focus check-in every 5 minutes when session is active
  useEffect(() => {
    if (!isSessionActive || !currentSprint) return
    focusCheckInRef.current = setInterval(() => {
      if (!showQuizRef.current && !isDriftingRef.current) setShowFocusCheckIn(true)
    }, 5 * 60 * 1000)
    return () => {
      if (focusCheckInRef.current) clearInterval(focusCheckInRef.current)
    }
  }, [isSessionActive, currentSprint?.id])

  async function handleStartSprint(sprintId: string) {
    if (!currentSession) return
    try {
      const result = await startSprint(currentSession.id, sprintId)
      const sprint: Sprint = {
        id: result.sprint_id,
        session_id: currentSession.id,
        material_id: null,
        sprint_number: result.sprint_number,
        duration_minutes: result.duration_minutes,
        content_chunk: result.chunk,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
      }
      setSprint(sprint)
      setChunk(result.chunk)
      // Show pre-reading prime overlay
      setShowPrimingOverlay(true)
    } catch {
      setError('Could not start sprint. Please try again.')
    }
  }

  async function handleDoneWithSprint() {
    if (!currentSession || !currentSprint || !currentChunk) return

    // Dwell time check — flag if user spent < 20% of expected reading time
    if (chunkReadStartRef.current) {
      const elapsedSecs = (Date.now() - chunkReadStartRef.current) / 1000
      const expectedSecs = (currentChunk.word_count / 200) * 60
      if (elapsedSecs < expectedSecs * 0.2 && expectedSecs > 20) {
        setSkimWarning(true)
      }
    }

    setQuizLoading(true)
    setShowQuiz(true)
    try {
      const quiz = await generateQuiz(
        currentSprint.id,
        currentSession.id,
        currentChunk.text
      )
      setCurrentQuizData(quiz)
    } catch {
      setError('Could not generate quiz. Please try again.')
      setShowQuiz(false)
    } finally {
      setQuizLoading(false)
    }
  }

  async function handleQuizComplete(score: number, topics: string[], isDone: boolean) {
    setShowQuiz(false)
    setCurrentQuizData(null)

    // Adaptive difficulty tracking
    if (score < 50) {
      incrementLowScores()
      const newCount = consecutiveLowScores + 1
      if (newCount >= 2 && !useSimplified) {
        setUseSimplified(true)
        setAdaptiveBanner(true)
      }
    } else {
      resetLowScores()
    }

    // Frustration card for very low scores
    if (score < 40) {
      setFrustrationScore(score)
      setShowFrustrationCard(true)
      return // wait for user to dismiss frustration card before continuing
    }

    // Celebration overlay on good scores
    if (score >= 60) {
      setCelebrationScore(score)
      setTimeout(() => setCelebrationScore(null), 2200)
    }

    if (isDone) {
      await handleCloseSession()
    } else {
      if (currentSession && currentSprint && plan) {
        const storedNextId = sessionStorage.getItem('focuspilot_next_sprint_id')
        if (storedNextId) {
          sessionStorage.removeItem('focuspilot_next_sprint_id')
          await handleStartSprint(storedNextId)
        }
      }
    }
  }

  async function handleAfterFrustration() {
    setShowFrustrationCard(false)
    const score = frustrationScore ?? 0
    setFrustrationScore(null)
    if (score >= 60) {
      setCelebrationScore(score)
      setTimeout(() => setCelebrationScore(null), 2200)
    }
    // Load next sprint
    const storedNextId = sessionStorage.getItem('focuspilot_next_sprint_id')
    if (storedNextId) {
      sessionStorage.removeItem('focuspilot_next_sprint_id')
      await handleStartSprint(storedNextId)
    }
  }

  async function handleCloseSession() {
    if (!currentSession) return
    try {
      const result = await closeSession(currentSession.id)
      setCloseResult(result)
      clearSession()
      setView('complete')
    } catch {
      setError('Could not close session. Please try again.')
    }
  }

  async function handleTutorSend() {
    if (!tutorInput.trim() || !currentSession || !currentChunk) return
    const question = tutorInput.trim()
    setTutorInput('')

    const userMsg: TutorMessage = {
      role: 'user',
      text: question,
      timestamp: new Date().toISOString(),
    }
    addTutorMessage(userMsg)
    setTutorLoading(true)

    try {
      const result = await askTutor(
        currentSession.id,
        question,
        currentChunk.text,
        tutorHistory
      )
      const assistantMsg: TutorMessage = {
        role: 'assistant',
        text: result.answer,
        timestamp: new Date().toISOString(),
      }
      addTutorMessage(assistantMsg)
    } catch {
      const errorMsg: TutorMessage = {
        role: 'assistant',
        text: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }
      addTutorMessage(errorMsg)
    } finally {
      setTutorLoading(false)
    }
  }

  function handleEnergySelect(level: 'full' | 'half' | 'low') {
    setEnergyLevel(level)
    setLastEnergyLevel(level)
    setShowEnergyCheck(false)
    // Adapt content density based on energy
    if (level === 'low') setUseSimplified(true)   // raw text = shorter, less dense
  }

  function handleFocusRating(level: 'locked' | 'drifting' | 'lost') {
    setShowFocusCheckIn(false)
    if (level === 'lost') {
      setDrifting(true)
      setReanchor(null)
    }
  }

  function toggleSpeech() {
    if (!currentChunk) return
    if (isSpeaking) {
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
      return
    }
    const activeText = useSimplified && currentChunk.original_text ? currentChunk.original_text : currentChunk.text
    const plainText = activeText
      .replace(/#{1,6}\s/g, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/>\s?/g, '')
      .replace(/\[.*?\]/g, '')
    const utterance = new SpeechSynthesisUtterance(plainText)
    utterance.rate = 0.92
    utterance.pitch = 1.0
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    speechRef.current = utterance
    window.speechSynthesis?.speak(utterance)
    setIsSpeaking(true)
  }

  async function handleImLost() {
    if (!currentChunk || !currentSession || isReexplaining) return
    setIsReexplaining(true)
    try {
      const result = await reexplainChunk(currentSession.id, currentChunk.text)
      setReexplainedText(result.explanation)
    } catch {
      setError('Could not generate re-explanation. Try asking the tutor instead.')
    } finally {
      setIsReexplaining(false)
    }
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const totalSprints = plan?.total_sprints ?? plan?.sprints.length ?? 0
  const sprintNumber = currentSprint?.sprint_number ?? 0
  const progressPct = currentSprint
    ? ((currentSprint.duration_minutes * 60 - timeLeft) / (currentSprint.duration_minutes * 60)) * 100
    : 0

  const timerColor =
    timeLeft < 60 ? '#e11d48' : timeLeft < 120 ? '#E8E870' : '#98E89E'

  const displayedChunk = useSimplified && currentChunk?.original_text
    ? { ...currentChunk, text: currentChunk.original_text }
    : currentChunk

  // ── No active session ──────────────────────────────────────────────────────
  if (!currentSession && view === 'active') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
        <BookOpen size={48} className="text-zinc-600" />
        <h2 className="text-white text-2xl font-bold tracking-tight">No active session</h2>
        <p className="text-zinc-400">Start a session from the home screen</p>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/')}
          className="btn-mint px-6 py-3 font-semibold"
        >
          Go to Home
        </motion.button>
      </div>
    )
  }

  // ── Session complete ───────────────────────────────────────────────────────
  if (view === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-8 max-w-lg mx-auto"
      >
        <div className="text-6xl animate-float">🎉</div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Session Complete!</h1>
          <p className="text-zinc-400">Great work staying focused today.</p>
        </div>

        {closeResult && (
          <div className="grid grid-cols-2 gap-4 w-full">
            <motion.div whileHover={{ scale: 1.02 }} className="glass p-5 text-center">
              <p className="text-3xl font-bold text-white font-mono">{Math.round(closeResult.total_time_minutes)}</p>
              <p className="text-zinc-500 text-sm mt-1">Minutes studied</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} className="glass p-5 text-center">
              <p className="text-3xl font-bold font-mono" style={{ color: '#98E89E' }}>
                {Math.round(closeResult.avg_score)}%
              </p>
              <p className="text-zinc-500 text-sm mt-1">Avg. retention</p>
            </motion.div>
            {closeResult.sessions_streak > 1 && (
              <motion.div
                whileHover={{ scale: 1.01 }}
                className="col-span-2 glass p-4 text-center"
                style={{ borderColor: 'rgba(232,232,112,0.2)' }}
              >
                <p className="text-2xl font-bold font-mono" style={{ color: '#E8E870' }}>
                  🔥 {closeResult.sessions_streak}-day streak!
                </p>
              </motion.div>
            )}
          </div>
        )}

        <div className="flex gap-3 w-full">
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-3 rounded-full border border-white/10 text-white font-semibold hover:bg-white/[0.04] transition-colors"
          >
            New Session
          </button>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/profile')}
            className="btn-mint flex-1 py-3 font-semibold"
          >
            View Profile
          </motion.button>
        </div>
      </motion.div>
    )
  }

  // ── Active session ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ flex: '58%' }}>
        {/* Sprint header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">
                Sprint {sprintNumber + 1} of {totalSprints}
              </p>
              <h1 className="text-white font-bold text-lg mt-1 tracking-tight">
                {plan?.sprints[sprintNumber]?.title ?? currentChunk?.title ?? 'Study Sprint'}
              </h1>
            </div>
            <div className="flex-shrink-0 text-right">
              <p
                className="text-2xl font-mono font-bold tabular-nums transition-colors"
                style={{ color: timerColor }}
              >
                {formatTime(timeLeft)}
              </p>
            </div>
          </div>
          {/* Progress bar — thick for ADHD time-blindness visibility */}
          <div className="mt-3 h-2 rounded-full overflow-hidden bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor: '#98E89E',
                boxShadow: progressPct > 5 ? '0 0 8px rgba(152,232,158,0.4)' : 'none',
              }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>

        {/* Energy mode indicator */}
        {energyLevel === 'low' && (
          <div className="flex-shrink-0 px-6 py-1.5 flex items-center gap-2"
            style={{ backgroundColor: 'rgba(251,146,60,0.04)', borderBottom: '1px solid rgba(251,146,60,0.1)' }}>
            <BatteryLow size={11} style={{ color: '#fb923c' }} />
            <span className="text-xs font-mono" style={{ color: '#fb923c' }}>
              Low energy mode — showing raw text
            </span>
            <button onClick={() => { setEnergyLevel('full'); setUseSimplified(false) }}
              className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              switch to full
            </button>
          </div>
        )}

        {/* Adaptive difficulty banner */}
        <AnimatePresence>
          {adaptiveBanner && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-shrink-0 px-6 py-2 flex items-center gap-2"
              style={{ backgroundColor: 'rgba(165,180,252,0.06)', borderBottom: '1px solid rgba(165,180,252,0.12)' }}
            >
              <span className="text-xs" style={{ color: '#a5b4fc' }}>🎯 Content simplified after two tough quizzes — you're doing great.</span>
              <button onClick={() => setAdaptiveBanner(false)} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors">
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-8" id="content-scroll-area">
          {/* Quick recap snippet — shown after welcome-back recap tap */}
          <AnimatePresence>
            {showRecapSnippet && currentChunk && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="max-w-[640px] mx-auto mb-6 px-5 py-4 rounded-2xl"
                style={{ backgroundColor: 'rgba(152,232,158,0.06)', border: '1px solid rgba(152,232,158,0.18)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-mono uppercase tracking-widest" style={{ color: '#98E89E' }}>Quick recap</p>
                  <button onClick={() => setShowRecapSnippet(false)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                    <X size={12} />
                  </button>
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  {currentChunk.text
                    .replace(/#{1,6}\s[^\n]+/g, '')
                    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
                    .replace(/`([^`]+)`/g, '$1')
                    .replace(/>\s?[^\n]+/g, '')
                    .split(/(?<=[.!?])\s+/)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(' ')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {displayedChunk ? (
            <div className="max-w-[640px] mx-auto">
              {/* Key terms from current chunk */}
              <KeyTermsStrip text={displayedChunk.text} />

              {/* Content text OR re-explanation */}
              <AnimatePresence mode="wait">
                {reexplainedText ? (
                  <motion.div
                    key="reexplain"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-2xl p-5"
                    style={{
                      backgroundColor: 'rgba(165,180,252,0.05)',
                      border: '1px solid rgba(165,180,252,0.15)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-sm font-semibold" style={{ color: '#a5b4fc' }}>
                        🔄 Fresh perspective
                      </span>
                      <button
                        onClick={() => setReexplainedText(null)}
                        className="ml-auto text-xs text-zinc-600 hover:text-zinc-300 transition-colors font-mono"
                      >
                        back to original
                      </button>
                    </div>
                    <MarkdownContent text={reexplainedText} />
                  </motion.div>
                ) : (
                  <motion.div key="original" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="text-zinc-300">
                      <MarkdownContent text={displayedChunk.text} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Toolbar: TTS + Simplify + I'm Lost */}
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.05]">
                <button
                  onClick={toggleSpeech}
                  aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
                  className="flex items-center gap-1.5 text-xs font-mono transition-colors cursor-pointer"
                  style={{ color: isSpeaking ? '#98E89E' : '#52525b' }}
                >
                  {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  {isSpeaking ? 'Stop' : 'Listen'}
                </button>

                {currentChunk?.original_text && !reexplainedText && (
                  <button
                    onClick={() => setUseSimplified((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-mono text-zinc-600 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    {useSimplified ? 'Show formatted' : 'Show raw'}
                  </button>
                )}

                {!reexplainedText && (
                  <button
                    onClick={handleImLost}
                    disabled={isReexplaining}
                    className="flex items-center gap-1.5 text-xs font-mono transition-colors ml-auto disabled:opacity-40 cursor-pointer"
                    style={{ color: isReexplaining ? '#71717a' : '#a5b4fc' }}
                  >
                    {isReexplaining ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <HelpCircle size={13} />
                    )}
                    {isReexplaining ? 'Thinking...' : "I'm lost"}
                  </button>
                )}
              </div>

              {/* Chunk progress dots */}
              {totalSprints > 1 && (
                <div className="flex gap-2 mt-8">
                  {Array.from({ length: totalSprints }).map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-colors"
                      style={{
                        backgroundColor:
                          i < sprintNumber
                            ? '#98E89E'
                            : i === sprintNumber
                            ? 'rgba(152,232,158,0.4)'
                            : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Next chunk button (appears after 40s) */}
              <AnimatePresence>
                {showNextChunk && (
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 text-sm flex items-center gap-1 text-zinc-400 hover:text-white transition-colors font-mono"
                    onClick={handleDoneWithSprint}
                  >
                    Next Chunk <ChevronRight size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="max-w-2xl animate-pulse space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="h-6 w-28 rounded-full bg-white/[0.05]" />
                <div className="h-8 w-8 rounded-full bg-white/[0.05]" />
              </div>
              <div className="space-y-3 mt-4">
                <div className="h-4 w-full rounded-full bg-white/[0.04]" />
                <div className="h-4 w-5/6 rounded-full bg-white/[0.04]" />
                <div className="h-4 w-4/6 rounded-full bg-white/[0.04]" />
              </div>
              <div className="h-20 w-full rounded-2xl bg-white/[0.03] mt-4" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded-full bg-white/[0.04]" />
                <div className="h-4 w-3/4 rounded-full bg-white/[0.04]" />
              </div>
              <p className="text-zinc-600 text-xs font-mono text-center pt-4">
                Loading content…
              </p>
            </div>
          )}
        </div>

        {/* Skim warning */}
        <AnimatePresence>
          {skimWarning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-shrink-0 px-6 py-2 flex items-center gap-2"
              style={{ borderTop: '1px solid rgba(232,232,112,0.1)', backgroundColor: 'rgba(232,232,112,0.03)' }}
            >
              <span className="text-xs" style={{ color: '#E8E870' }}>
                ⚡ Heads up — you moved through this quickly. The quiz might be tricky!
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action bar */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <button
            onClick={handleCloseSession}
            className="text-zinc-600 text-sm hover:text-rose-400 transition-colors font-mono"
          >
            End session
          </button>
          <div className="flex items-center gap-2">
            {currentSession && currentSprint?.material_id && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => setShowCheatsheet(true)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-white/10 hover:bg-white/[0.04] transition-all flex items-center gap-1.5"
                style={{ color: '#98E89E' }}
                title="Open cheatsheet"
              >
                <BookOpen size={13} />
                Cheatsheet
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDoneWithSprint}
              disabled={!currentSprint || !currentChunk}
              className="btn-mint px-6 py-2.5 text-sm font-semibold"
            >
              Done with sprint →
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Tutor) ───────────────────────────────────────────── */}
      <div
        className="flex flex-col border-l border-white/[0.06]"
        style={{ flex: '42%', backgroundColor: 'rgba(255,255,255,0.015)' }}
      >
        {/* Tutor header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(112,128,232,0.12)' }}
          >
            <span style={{ color: '#7080E8', fontSize: 13 }}>✦</span>
          </div>
          <p className="text-white font-medium text-sm">Ask anything about what you're reading</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {tutorHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(112,128,232,0.08)' }}>
              <HelpCircle size={22} style={{ color: '#7080E8' }} />
            </div>
              <p className="text-sm text-center">No questions yet.<br />Ask the AI tutor anything!</p>
            </div>
          )}

          {tutorHistory.map((msg, i) => (
            <div
              key={i}
              className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={clsx(
                  'max-w-[85%] px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'rounded-2xl rounded-br-none'
                    : 'rounded-2xl rounded-bl-none'
                )}
                style={
                  msg.role === 'user'
                    ? { backgroundColor: '#98E89E', color: '#050705' }
                    : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#d4d4d8' }
                }
              >
                {msg.role === 'assistant'
                  ? <MarkdownContent text={msg.text} small />
                  : msg.text}
              </div>
            </div>
          ))}

          {tutorLoading && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}

          <div ref={tutorEndRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06] flex gap-2 items-end">
          <textarea
            ref={tutorTextareaRef}
            rows={1}
            value={tutorInput}
            onChange={(e) => setTutorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleTutorSend()
              }
            }}
            placeholder="Ask a question..."
            className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 border border-white/10 focus:outline-none focus:border-mint/40 overflow-hidden transition-colors bg-white/[0.04]"
            style={{ maxHeight: 120 }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleTutorSend}
            disabled={!tutorInput.trim() || tutorLoading}
            aria-label="Send message"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 transition-all"
            style={{ backgroundColor: '#98E89E' }}
          >
            <Send size={14} style={{ color: '#050705' }} />
          </motion.button>
        </div>
      </div>

      {/* ── CHEATSHEET MODAL ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCheatsheet && currentSession && currentChunk && currentSprint?.material_id && (
          <CheatsheetModal
            materialId={currentSprint.material_id}
            materialTitle={currentChunk.material_title ?? currentSession.goal}
            onClose={() => setShowCheatsheet(false)}
          />
        )}
      </AnimatePresence>

      {/* ── SPRINT COMPLETION CELEBRATION ────────────────────────────────── */}
      <AnimatePresence>
        {celebrationScore !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] px-8 py-5 rounded-3xl flex items-center gap-4 shadow-2xl"
            style={{
              backgroundColor: 'rgba(5,7,5,0.92)',
              border: `1px solid ${celebrationScore >= 80 ? 'rgba(152,232,158,0.4)' : 'rgba(232,232,112,0.35)'}`,
              backdropFilter: 'blur(20px)',
            }}
          >
            <span className="text-3xl">{celebrationScore >= 80 ? '🎉' : '⭐'}</span>
            <div>
              <p className="text-white font-bold text-lg leading-tight">
                {celebrationScore >= 80 ? 'Excellent work!' : 'Sprint done!'}
              </p>
              <p className="text-sm font-mono" style={{ color: celebrationScore >= 80 ? '#98E89E' : '#E8E870' }}>
                {celebrationScore}% on this sprint
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ENERGY CHECK ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEnergyCheck && (
          <EnergyCheckModal onSelect={handleEnergySelect} onSkip={() => setShowEnergyCheck(false)} />
        )}
      </AnimatePresence>

      {/* ── WELCOME BACK BANNER ───────────────────────────────────────────── */}
      <AnimatePresence>
        {tabReturnSeconds !== null && !isDrifting && (
          <WelcomeBackBanner
            seconds={tabReturnSeconds}
            onDismiss={dismissTabReturn}
            onRecap={() => {
              document.getElementById('content-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' })
              setShowRecapSnippet(true)
            }}
          />
        )}
      </AnimatePresence>

      {/* ── FOCUS CHECK-IN ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFocusCheckIn && !isDrifting && !showQuiz && (
          <FocusCheckInCard onRate={handleFocusRating} />
        )}
      </AnimatePresence>

      {/* ── DRIFT OVERLAY ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isDrifting && (
          <DriftOverlay
            question={reanchorQuestion}
            onDismiss={dismissDrift}
            onBreak={() => setShowBreakTimer(true)}
          />
        )}
      </AnimatePresence>

      {/* ── BREAK TIMER ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBreakTimer && (
          <BreakTimerModal onDone={() => setShowBreakTimer(false)} />
        )}
      </AnimatePresence>

      {/* ── PRE-READING PRIME ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPrimingOverlay && currentSprint && plan && (
          <PrimingOverlay
            focus={plan.sprints[currentSprint.sprint_number]?.focus ?? plan.sprints[currentSprint.sprint_number]?.title ?? 'the main concept'}
            onDismiss={() => setShowPrimingOverlay(false)}
          />
        )}
      </AnimatePresence>

      {/* ── FRUSTRATION CARD ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFrustrationCard && frustrationScore !== null && (
          <FrustrationCard score={frustrationScore} onContinue={handleAfterFrustration} />
        )}
      </AnimatePresence>

      {/* ── QUIZ MODAL ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQuiz && (
          quizLoading || !currentQuizData ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 flex items-center justify-center"
              style={{ backgroundColor: 'rgba(5,7,5,0.97)', backdropFilter: 'blur(12px)' }}
            >
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={36} className="animate-spin" style={{ color: '#98E89E' }} />
                <p className="text-white text-lg">Generating your quiz...</p>
              </div>
            </motion.div>
          ) : (
            <QuizModal
              quiz={currentQuizData}
              onComplete={handleQuizComplete}
              onClose={() => { setShowQuiz(false); setCurrentQuizData(null) }}
              sessionId={currentSession?.id ?? ''}
              sprintId={currentSprint?.id ?? ''}
              chunkText={currentChunk?.text ?? ''}
            />
          )
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 glass px-4 py-3 text-sm flex items-center gap-2"
            style={{ borderColor: 'rgba(232,232,112,0.3)', color: '#E8E870' }}
          >
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
