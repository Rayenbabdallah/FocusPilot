import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  StudySession,
  Sprint,
  ContentChunk,
  SessionPlan,
  TutorMessage,
  GenerateQuizResponse,
  MaterialListItem,
  LearningProfile,
} from '../types'

interface SessionSlice {
  currentSession: StudySession | null
  currentSprint: Sprint | null
  currentChunk: ContentChunk | null
  plan: SessionPlan | null
  tutorHistory: TutorMessage[]
  isSessionActive: boolean
  setSession: (s: StudySession | null) => void
  setSprint: (s: Sprint | null) => void
  setChunk: (c: ContentChunk | null) => void
  setPlan: (p: SessionPlan | null) => void
  addTutorMessage: (m: TutorMessage) => void
  clearSession: () => void
}

interface QuizSlice {
  currentQuiz: GenerateQuizResponse | null
  isDrifting: boolean
  reanchorQuestion: string | null
  setQuiz: (q: GenerateQuizResponse | null) => void
  setDrifting: (b: boolean) => void
  setReanchor: (q: string | null) => void
  clearQuiz: () => void
}

interface MaterialsSlice {
  materials: MaterialListItem[]
  isUploading: boolean
  setMaterials: (m: MaterialListItem[]) => void
  addMaterial: (m: MaterialListItem) => void
  setUploading: (b: boolean) => void
}

interface ProfileSlice {
  profile: LearningProfile | null
  setProfile: (p: LearningProfile | null) => void
}

interface AppSlice {
  studentId: string
  studentName: string
  lastEnergyLevel: 'full' | 'half' | 'low' | null
  lastGoal: string
  lastDuration: number
  reminderTime: string | null          // HH:MM, e.g. "18:00"
  consecutiveLowScores: number
  setStudentId: (id: string) => void
  setStudentName: (name: string) => void
  setLastEnergyLevel: (l: 'full' | 'half' | 'low' | null) => void
  setLastGoal: (g: string) => void
  setLastDuration: (d: number) => void
  setReminderTime: (t: string | null) => void
  incrementLowScores: () => void
  resetLowScores: () => void
}

type Store = SessionSlice & QuizSlice & MaterialsSlice & ProfileSlice & AppSlice

export const useStore = create<Store>()(
  persist(
    (set) => ({
      // Session slice
      currentSession: null,
      currentSprint: null,
      currentChunk: null,
      plan: null,
      tutorHistory: [],
      isSessionActive: false,
      setSession: (s) => set({ currentSession: s, isSessionActive: s !== null }),
      setSprint: (s) => set({ currentSprint: s }),
      setChunk: (c) => set({ currentChunk: c }),
      setPlan: (p) => set({ plan: p }),
      addTutorMessage: (m) => set((state) => ({ tutorHistory: [...state.tutorHistory, m] })),
      clearSession: () =>
        set({
          currentSession: null,
          currentSprint: null,
          currentChunk: null,
          plan: null,
          tutorHistory: [],
          isSessionActive: false,
        }),

      // Quiz slice
      currentQuiz: null,
      isDrifting: false,
      reanchorQuestion: null,
      setQuiz: (q) => set({ currentQuiz: q }),
      setDrifting: (b) => set({ isDrifting: b }),
      setReanchor: (q) => set({ reanchorQuestion: q }),
      clearQuiz: () => set({ currentQuiz: null, isDrifting: false, reanchorQuestion: null }),

      // Materials slice
      materials: [],
      isUploading: false,
      setMaterials: (m) => set({ materials: m }),
      addMaterial: (m) => set((state) => ({ materials: [...state.materials, m] })),
      setUploading: (b) => set({ isUploading: b }),

      // Profile slice
      profile: null,
      setProfile: (p) => set({ profile: p }),

      // App slice
      studentId: '00000000-0000-0000-0000-000000000001',
      studentName: 'Guest',
      lastEnergyLevel: null,
      lastGoal: '',
      lastDuration: 30,
      reminderTime: null,
      consecutiveLowScores: 0,
      setStudentId: (id) => set({ studentId: id }),
      setStudentName: (name) => set({ studentName: name }),
      setLastEnergyLevel: (l) => set({ lastEnergyLevel: l }),
      setLastGoal: (g) => set({ lastGoal: g }),
      setLastDuration: (d) => set({ lastDuration: d }),
      setReminderTime: (t) => set({ reminderTime: t }),
      incrementLowScores: () => set((s) => ({ consecutiveLowScores: s.consecutiveLowScores + 1 })),
      resetLowScores: () => set({ consecutiveLowScores: 0 }),
    }),
    {
      name: 'focuspilot-store',
      partialize: (state) => ({
        studentId: state.studentId,
        studentName: state.studentName,
        lastEnergyLevel: state.lastEnergyLevel,
        // Persist active session so page refresh doesn't lose state
        // currentChunk is intentionally excluded — always re-fetched from the API
        // so stale cached content never blocks the session page.
        currentSession: state.currentSession,
        currentSprint: state.currentSprint,
        plan: state.plan,
        isSessionActive: state.isSessionActive,
        // Cap tutor history at 50 messages to prevent storage bloat
        tutorHistory: state.tutorHistory.slice(-50),
        lastGoal: state.lastGoal,
        lastDuration: state.lastDuration,
        reminderTime: state.reminderTime,
        consecutiveLowScores: state.consecutiveLowScores,
      }),
    }
  )
)
