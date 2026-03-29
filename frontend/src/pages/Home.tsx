import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Loader2, AlertCircle, Tag, Check, ChevronDown, FileText, Film, Layers, File, Upload, FolderOpen, Zap, Bell, BellOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import clsx from 'clsx'
import { useStore } from '../store'
import { getMaterials, uploadMaterial, deleteMaterial, updateMaterialSubject } from '../api/materials'
import { createStudent } from '../api/profile'
import { startSession } from '../api/sessions'
import { useToast } from '../hooks/useToast'
import { requestNotificationPermission } from '../hooks/useStudyReminder'
import type { MaterialListItem, StudySession } from '../types'

const TIME_PILLS = [10, 15, 30, 60, 90, 120]

function MaterialIcon({ type }: { type: string }) {
  if (type === 'pdf') return <FileText size={18} className="text-zinc-400 flex-shrink-0" />
  if (type === 'video') return <Film size={18} className="text-zinc-400 flex-shrink-0" />
  if (type === 'slides') return <Layers size={18} className="text-zinc-400 flex-shrink-0" />
  return <File size={18} className="text-zinc-400 flex-shrink-0" />
}

// Group materials by subject (null/undefined → 'Unsorted')
function groupBySubject(materials: MaterialListItem[]): Record<string, MaterialListItem[]> {
  const groups: Record<string, MaterialListItem[]> = {}
  for (const m of materials) {
    const key = m.subject?.trim() || 'Unsorted'
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }
  // Put 'Unsorted' last
  const sorted: Record<string, MaterialListItem[]> = {}
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'Unsorted') return 1
    if (b === 'Unsorted') return -1
    return a.localeCompare(b)
  })
  for (const k of keys) sorted[k] = groups[k]
  return sorted
}

// Inline subject editor for a single material card
const MaterialCard = React.memo(function MaterialCard({
  m,
  selected,
  isDeleting,
  onToggle,
  onDelete,
  onSubjectChange,
  existingSubjects,
}: {
  m: MaterialListItem
  selected: boolean
  isDeleting: boolean
  onToggle: () => void
  onDelete: () => void
  onSubjectChange: (subject: string) => void
  existingSubjects: string[]
}) {
  const [editingSubject, setEditingSubject] = useState(false)
  const [subjectInput, setSubjectInput] = useState(m.subject ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function commitSubject() {
    setEditingSubject(false)
    if (subjectInput !== (m.subject ?? '')) {
      onSubjectChange(subjectInput)
    }
  }

  const suggestions = existingSubjects.filter(
    (s) => s !== m.subject && s.toLowerCase().includes(subjectInput.toLowerCase())
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: isDeleting ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: confirmDelete || isDeleting ? 1 : 1.02 }}
      className="flex-shrink-0 glass p-4 min-w-[160px] max-w-[200px] relative group cursor-pointer"
      onClick={() => {
        if (!confirmDelete && !isDeleting) onToggle()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !confirmDelete && !isDeleting) {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      {/* Selection overlay — first child so it renders BELOW all interactive elements */}
      <div
        className={clsx(
          'absolute inset-0 rounded-2xl border-2 transition-all duration-200 pointer-events-none',
          selected
            ? 'border-mint/70 bg-mint/[0.06]'
            : 'border-transparent'
        )}
        style={selected ? { boxShadow: '0 0 12px rgba(152,232,158,0.15) inset' } : undefined}
      />

      {/* All card content sits above the overlay via relative z-10 */}
      <div className="relative z-10">
        {/* Delete confirmation overlay */}
        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3"
              style={{ backgroundColor: 'rgba(5,7,5,0.92)', backdropFilter: 'blur(4px)', margin: '-16px' }}
            >
              <Trash2 size={20} className="text-rose-400" />
              <p className="text-white text-xs font-semibold text-center px-2">Delete "{m.title}"?</p>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
                  className="px-3 py-1 rounded-full text-xs border border-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'rgba(225,29,72,0.2)', color: '#fca5a5', border: '1px solid rgba(225,29,72,0.3)' }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-start justify-between mb-1">
          <MaterialIcon type={m.type} />
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingSubject(true) }}
              disabled={isDeleting}
              className="rounded-full p-1.5 hover:bg-white/10 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center disabled:opacity-40"
              aria-label="Set subject"
            >
              <Tag size={12} className="text-zinc-400" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isDeleting) setConfirmDelete(true)
              }}
              disabled={isDeleting}
              className="rounded-full p-1.5 hover:bg-rose-500/20 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center disabled:opacity-40"
              aria-label={isDeleting ? 'Deleting…' : 'Delete material'}
            >
              {isDeleting
                ? <Loader2 size={12} className="animate-spin text-zinc-500" />
                : <Trash2 size={12} className="text-rose-400" />
              }
            </button>
          </div>
        </div>
        <p className="text-white text-sm font-medium mt-1 truncate" title={m.title}>
          {m.title}
        </p>
        <span
          className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-mono"
          style={{ backgroundColor: 'rgba(152,232,158,0.12)', color: '#98E89E' }}
        >
          {m.chunk_count} chunks
        </span>

        {/* Inline subject editor */}
        <AnimatePresence>
          {editingSubject ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-2 space-y-1.5"
            >
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitSubject(); if (e.key === 'Escape') setEditingSubject(false) }}
                  placeholder="Subject…"
                  className="flex-1 text-xs rounded-lg px-2 py-1 bg-white/[0.06] border border-white/10 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white/20 min-w-0"
                />
                <button onClick={(e) => { e.stopPropagation(); commitSubject() }} aria-label="Confirm subject" className="rounded-full p-1.5 hover:bg-white/10 flex-shrink-0 transition-colors">
                  <Check size={12} style={{ color: '#98E89E' }} />
                </button>
              </div>
              {existingSubjects.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {existingSubjects.filter(s => s !== m.subject).map((s) => (
                    <button
                      key={s}
                      onClick={(e) => { e.stopPropagation(); setSubjectInput(s); onSubjectChange(s); setEditingSubject(false) }}
                      className="text-xs px-2 py-0.5 rounded-full transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'rgba(112,128,232,0.15)', color: '#a5b4fc', border: '1px solid rgba(112,128,232,0.2)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : m.subject ? (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingSubject(true) }}
              className="mt-1.5 text-xs px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
              style={{ backgroundColor: 'rgba(112,128,232,0.12)', color: '#a5b4fc' }}
            >
              {m.subject}
            </button>
          ) : null}
        </AnimatePresence>
      </div>

      {selected && (
        <div
          className="absolute top-2 left-2 w-4 h-4 rounded-full flex items-center justify-center z-10"
          style={{ backgroundColor: '#98E89E' }}
        >
          <Check size={9} strokeWidth={3} style={{ color: '#050705' }} />
        </div>
      )}
    </motion.div>
  )
})

function SubjectCombo({
  value,
  onChange,
  existingSubjects,
  placeholder = 'Subject / Topic (optional)',
}: {
  value: string
  onChange: (v: string) => void
  existingSubjects: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = existingSubjects.filter(
    (s) => !value || s.toLowerCase().includes(value.toLowerCase())
  )

  return (
    <div ref={ref} className="relative mb-3">
      <div className="flex items-center gap-3">
        <Tag size={14} className="text-zinc-500 shrink-0" />
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            className="w-full rounded-full px-4 py-2 pr-8 text-white placeholder-zinc-600 border border-white/10 focus:outline-none focus:border-white/20 transition-colors bg-white/[0.03] text-sm"
          />
          {existingSubjects.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <ChevronDown size={13} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-6 right-0 mt-1 rounded-2xl overflow-hidden z-20 shadow-xl"
            style={{ backgroundColor: 'rgba(14,18,14,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <p className="text-zinc-600 text-xs font-mono px-4 pt-3 pb-1 uppercase tracking-wider">Existing topics</p>
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { onChange(s); setOpen(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#a5b4fc' }} />
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    studentId, studentName,
    setStudentId, setStudentName,
    materials, setMaterials, addMaterial, isUploading, setUploading,
    setSession, setSprint, setChunk, setPlan, clearSession,
    lastGoal, lastDuration, setLastGoal, setLastDuration,
    reminderTime, setReminderTime,
    currentSession,
  } = useStore()

  const [nameInput, setNameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupDone, setSetupDone] = useState(false)

  const [subjectInput, setSubjectInput] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const retryGoal = sessionStorage.getItem('focuspilot_retry_goal')
  if (retryGoal) {
    sessionStorage.removeItem('focuspilot_retry_goal')
  }
  const [goal, setGoal] = useState(retryGoal || lastGoal || '')
  const [selectedMinutes, setSelectedMinutes] = useState(lastDuration || 30)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [sessionLoading, setSessionLoading] = useState(false)
  const [reminderInput, setReminderInput] = useState(reminderTime ?? '')
  const [reminderGranted, setReminderGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )
  const [sessionError, setSessionError] = useState<string | null>(null)

  const needsSetup =
    studentName === 'Guest' || studentName === 'Demo Student' || studentName === 'Default Student'

  useEffect(() => {
    loadMaterials()
  }, [studentId])

  useEffect(() => {
    // Keep only still-existing selections; never auto-select everything.
    setSelectedMaterialIds((prev) => prev.filter((id) => materials.some((m) => m.id === id)))
  }, [materials])

  async function loadMaterials() {
    try {
      const data = await getMaterials(studentId)
      setMaterials(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load materials'
      toast.error(msg)
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (!nameInput.trim() || !emailInput.trim()) return
    setSetupLoading(true)
    setSetupError(null)
    try {
      const student = await createStudent(nameInput.trim(), emailInput.trim())
      setStudentId(student.id)
      setStudentName(student.name)
      setSetupDone(true)
    } catch {
      setSetupError('Could not create account. Please try again.')
    } finally {
      setSetupLoading(false)
    }
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const file = acceptedFiles[0]
      setUploadError(null)
      setUploading(true)
      try {
        const title = file.name.replace(/\.[^.]+$/, '')
        const result = await uploadMaterial(file, studentId, title, subjectInput.trim() || undefined)
        const newItem: MaterialListItem = {
          id: result.material_id,
          title: result.title,
          type: result.type as MaterialListItem['type'],
          chunk_count: result.chunk_count,
          created_at: new Date().toISOString(),
          subject: subjectInput.trim() || null,
        }
        addMaterial(newItem)
        setSelectedMaterialIds((prev) => [...prev, newItem.id])
        toast.success(`"${result.title}" ready — ${result.chunk_count} chunks processed`)
        setSubjectInput('')
      } catch {
        setUploadError('Upload failed. Please check your file and try again.')
        toast.error('Upload failed. Please try again.')
      } finally {
        setUploading(false)
      }
    },
    [studentId, addMaterial, setUploading, subjectInput]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    multiple: false,
    disabled: isUploading,
  })

  async function handleDeleteMaterial(id: string) {
    if (deletingIds.has(id)) return          // prevent double-delete
    setDeletingIds((prev) => new Set([...prev, id]))
    // Optimistic remove
    const previous = materials
    setMaterials(materials.filter((m) => m.id !== id))
    setSelectedMaterialIds((prev) => prev.filter((mid) => mid !== id))
    try {
      await deleteMaterial(id, studentId)
    } catch (err) {
      // Rollback on failure
      setMaterials(previous)
      setSelectedMaterialIds((prev) => [...prev, id])
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  async function handleSubjectChange(id: string, subject: string) {
    const previous = materials
    // Optimistic update
    setMaterials(materials.map((m) => m.id === id ? { ...m, subject: subject || null } : m))
    try {
      await updateMaterialSubject(id, studentId, subject)
    } catch (err) {
      // Rollback on failure
      setMaterials(previous)
      const msg = err instanceof Error ? err.message : 'Could not save subject'
      toast.error(msg)
    }
  }

  function toggleMaterial(id: string) {
    setSelectedMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  function toggleAll() {
    if (selectedMaterialIds.length === materials.length) {
      setSelectedMaterialIds([])
    } else {
      setSelectedMaterialIds(materials.map((m) => m.id))
    }
  }

  async function handleStartSession(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim()) return
    if (selectedMaterialIds.length === 0) {
      setSessionError('Select at least one material before starting.')
      return
    }
    setSessionLoading(true)
    setSessionError(null)
    clearSession()
    // Persist last settings for quick-start
    setLastGoal(goal.trim())
    setLastDuration(selectedMinutes)
    try {
      const result = await startSession({
        student_id: studentId,
        goal: goal.trim(),
        material_ids: selectedMaterialIds,
        available_minutes: selectedMinutes,
      })
      if (Array.isArray(result.materials_used)) {
        const usedIds = new Set(result.materials_used.map((m) => m.id))
        const missing = selectedMaterialIds.filter((id) => !usedIds.has(id))
        if (missing.length > 0) {
          setSessionError('Some selected materials were not included. Re-select your chapters and try again.')
          setSessionLoading(false)
          return
        }
      }
      const session: StudySession = {
        id: result.session_id,
        student_id: studentId,
        goal: goal.trim(),
        planned_sprints: result.plan.sprints,
        status: 'active',
        started_at: new Date().toISOString(),
        ended_at: null,
      }
      setSession(session)
      setPlan(result.plan)
      setChunk(result.first_chunk)
      if (result.first_sprint_id) {
        sessionStorage.setItem('focuspilot_first_sprint_id', result.first_sprint_id)
      }
      navigate('/session')
    } catch {
      setSessionError('Could not start session. Please check your materials and try again.')
    } finally {
      setSessionLoading(false)
    }
  }

  const grouped = groupBySubject(materials)
  const groupEntries = Object.entries(grouped)
  const existingSubjects = [...new Set(materials.map((m) => m.subject).filter(Boolean) as string[])]

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto space-y-12">
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="pt-8"
      >
        <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
          Study smarter.{' '}
          <span style={{ color: '#98E89E' }}>Not harder.</span>
        </h1>
        <p className="mt-3 text-zinc-400 text-lg font-light">Built for the ADHD brain.</p>
      </motion.section>

      {/* ── Resume active session ───────────────────────────────────────────── */}
      <AnimatePresence>
        {currentSession && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/session')}
              className="w-full text-left rounded-2xl p-5 border transition-all duration-300"
              style={{ background: 'rgba(152,232,158,0.07)', borderColor: 'rgba(152,232,158,0.25)' }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: '#98E89E' }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-widest mb-0.5" style={{ color: '#98E89E' }}>Session in progress</p>
                    <p className="text-white font-semibold text-sm truncate">{currentSession.goal}</p>
                  </div>
                </div>
                <span className="flex-shrink-0 text-sm font-semibold px-4 py-1.5 rounded-full" style={{ background: 'rgba(152,232,158,0.15)', color: '#98E89E' }}>
                  Resume →
                </span>
              </div>
            </motion.button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Quick Start ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lastGoal && materials.length > 0 && !sessionLoading && !currentSession && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setGoal(lastGoal)
                setSelectedMinutes(lastDuration)
                setSessionLoading(true)
                setSessionError(null)
                clearSession()
                const quickStartMaterials = selectedMaterialIds
                if (quickStartMaterials.length === 0) {
                  setSessionLoading(false)
                  setSessionError('Select at least one material before starting.')
                  return
                }
                try {
                  const result = await startSession({
                    student_id: studentId,
                    goal: lastGoal,
                    material_ids: quickStartMaterials,
                    available_minutes: lastDuration,
                  })
                  if (Array.isArray(result.materials_used)) {
                    const usedIds = new Set(result.materials_used.map((m) => m.id))
                    const missing = quickStartMaterials.filter((id) => !usedIds.has(id))
                    if (missing.length > 0) {
                      setSessionError('Some selected materials were not included. Re-select your chapters and try again.')
                      setSessionLoading(false)
                      return
                    }
                  }
                  const session: StudySession = {
                    id: result.session_id, student_id: studentId, goal: lastGoal,
                    planned_sprints: result.plan.sprints, status: 'active',
                    started_at: new Date().toISOString(), ended_at: null,
                  }
                  setSession(session); setPlan(result.plan); setChunk(result.first_chunk)
                  if (result.first_sprint_id) sessionStorage.setItem('focuspilot_first_sprint_id', result.first_sprint_id)
                  navigate('/session')
                } catch {
                  setSessionError('Could not start session. Please try again.')
                  setSessionLoading(false)
                }
              }}
              className="w-full glass px-6 py-4 flex items-center gap-4 text-left hover:border-mint/30 transition-all duration-200"
              style={{ borderColor: 'rgba(152,232,158,0.2)' }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(152,232,158,0.12)' }}>
                <Zap size={18} style={{ color: '#98E89E' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Continue where you left off</p>
                <p className="text-zinc-500 text-xs mt-0.5 truncate">"{lastGoal}" · {lastDuration} min</p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'rgba(152,232,158,0.1)', color: '#98E89E' }}>
                Quick start →
              </span>
            </motion.button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Student Setup ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {needsSetup && !setupDone && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="glass p-6">
              <h2 className="text-white font-semibold text-lg mb-4">Who are you?</h2>
              <form onSubmit={handleSetup} className="space-y-3">
                <input
                  type="text"
                  placeholder="Your name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded-full px-5 py-3 text-white placeholder-zinc-600 border border-white/10 focus:outline-none focus:border-mint/50 transition-colors bg-white/5 text-sm"
                  required
                />
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full rounded-full px-5 py-3 text-white placeholder-zinc-600 border border-white/10 focus:outline-none focus:border-mint/50 transition-colors bg-white/5 text-sm"
                  required
                />
                {setupError && (
                  <p className="text-rose-400 text-sm flex items-center gap-2 px-1">
                    <AlertCircle size={14} />
                    {setupError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="btn-mint flex items-center justify-center gap-2 w-full py-3 font-semibold"
                >
                  {setupLoading ? <Loader2 size={18} className="animate-spin" /> : "Let's go"}
                </button>
              </form>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Upload Materials ────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        <h2 className="text-white font-semibold text-lg mb-4">Your study materials</h2>

        {/* Subject input with existing topic suggestions */}
        <SubjectCombo
          value={subjectInput}
          onChange={setSubjectInput}
          existingSubjects={existingSubjects}
        />

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={clsx(
            'glass p-8 text-center cursor-pointer transition-all duration-300',
            isDragActive
              ? 'border-mint/50 bg-mint/[0.04]'
              : 'hover:border-white/20 hover:bg-white/[0.02]',
            isUploading && 'pointer-events-none opacity-60'
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={28} className="animate-spin" style={{ color: '#98E89E' }} />
              <p className="text-zinc-400 text-sm">Uploading and processing with AI…</p>
            </div>
          ) : isDragActive ? (
            <div className="flex flex-col items-center gap-2">
              <FolderOpen size={32} style={{ color: '#98E89E' }} />
              <p className="font-medium" style={{ color: '#98E89E' }}>Drop it here!</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} className="text-zinc-500" />
              <p className="text-white font-medium">Drop PDFs or text files here</p>
              <p className="text-zinc-500 text-sm">or click to browse — .pdf, .txt, .md</p>
            </div>
          )}
        </div>

        {uploadError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-rose-400 text-sm flex items-center gap-1 px-1"
          >
            <AlertCircle size={14} />
            {uploadError}
          </motion.p>
        )}

        {/* Materials grouped by subject */}
        <AnimatePresence>
          {materials.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-4"
            >
              {groupEntries.map(([subject, items]) => (
                <div key={subject}>
                  {groupEntries.length > 1 || subject !== 'Unsorted' ? (
                    <p className="text-xs font-mono uppercase tracking-wider mb-2"
                      style={{ color: subject === 'Unsorted' ? '#52525b' : '#a5b4fc' }}>
                      {subject}
                    </p>
                  ) : null}
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {items.map((m) => (
                      <MaterialCard
                        key={m.id}
                        m={m}
                        selected={selectedMaterialIds.includes(m.id)}
                        isDeleting={deletingIds.has(m.id)}
                        onToggle={() => toggleMaterial(m.id)}
                        onDelete={() => handleDeleteMaterial(m.id)}
                        onSubjectChange={(subj) => handleSubjectChange(m.id, subj)}
                        existingSubjects={existingSubjects}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* ── Start Session ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {materials.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-white font-semibold text-lg mb-4">What are you studying for?</h2>
            <form onSubmit={handleStartSession} className="space-y-5">
              {/* Goal input */}
              <input
                type="text"
                placeholder="e.g. Thermodynamics exam on Friday"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-2xl px-5 py-4 text-white placeholder-zinc-600 border border-white/10 focus:outline-none focus:border-white/20 transition-colors bg-white/[0.03] text-sm"
                required
              />

              {/* Time pills */}
              <div className="flex gap-3 flex-wrap">
                {TIME_PILLS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setSelectedMinutes(min)}
                    className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 border active:scale-[0.96]"
                    style={
                      selectedMinutes === min
                        ? { backgroundColor: '#E8E870', borderColor: '#E8E870', color: '#050705', boxShadow: '0 0 14px rgba(232,232,112,0.3)' }
                        : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.12)', color: '#a1a1aa' }
                    }
                  >
                    {min} min
                  </button>
                ))}
              </div>

              {/* Material selection with toggle-all */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-400 text-sm font-medium">Include materials:</p>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-mono transition-colors hover:opacity-80"
                    style={{ color: '#98E89E' }}
                  >
                    {selectedMaterialIds.length === materials.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {groupEntries.map(([subject, items]) => (
                  <div key={subject}>
                    {groupEntries.length > 1 || subject !== 'Unsorted' ? (
                      <p className="text-xs text-zinc-600 font-mono mt-2 mb-1">{subject}</p>
                    ) : null}
                    {items.map((m) => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer group py-1">
                        <input
                          type="checkbox"
                          checked={selectedMaterialIds.includes(m.id)}
                          onChange={() => toggleMaterial(m.id)}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: '#98E89E' }}
                        />
                        <span className="text-zinc-300 text-sm group-hover:text-white transition-colors truncate">
                          {m.title}
                        </span>
                        <span className="text-zinc-500 text-xs ml-auto">{m.type}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              {sessionError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-rose-400 text-sm flex items-center gap-1 px-1"
                >
                  <AlertCircle size={14} />
                  {sessionError}
                </motion.p>
              )}

              {/* Daily reminder */}
              <div className="flex items-center gap-3 px-1">
                {reminderGranted && reminderTime ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Bell size={14} style={{ color: '#98E89E' }} />
                    <span className="text-xs text-zinc-400">Reminder set for <strong className="text-white">{reminderTime}</strong> daily</span>
                    <button
                      type="button"
                      onClick={() => { setReminderTime(null); setReminderInput('') }}
                      className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
                    >
                      <BellOff size={12} /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 flex-wrap">
                    <Bell size={14} className="text-zinc-600" />
                    <span className="text-xs text-zinc-600">Daily reminder:</span>
                    <input
                      type="time"
                      value={reminderInput}
                      onChange={(e) => setReminderInput(e.target.value)}
                      className="text-xs rounded-full px-3 py-1 bg-white/[0.04] border border-white/10 text-zinc-300 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    {reminderInput && (
                      <button
                        type="button"
                        onClick={async () => {
                          const granted = await requestNotificationPermission()
                          setReminderGranted(granted)
                          if (granted) {
                            setReminderTime(reminderInput)
                            toast.success(`Reminder set for ${reminderInput} every day`)
                          } else {
                            toast.error('Please allow notifications in your browser settings')
                          }
                        }}
                        className="text-xs px-3 py-1 rounded-full transition-colors font-medium"
                        style={{ backgroundColor: 'rgba(152,232,158,0.1)', color: '#98E89E' }}
                      >
                        Set reminder
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Start button */}
              <motion.button
                type="submit"
                disabled={sessionLoading || !goal.trim() || selectedMaterialIds.length === 0}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-mint w-full py-4 text-lg flex items-center justify-center gap-2"
              >
                {sessionLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Building your study plan…
                  </>
                ) : (
                  'Start Session →'
                )}
              </motion.button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

