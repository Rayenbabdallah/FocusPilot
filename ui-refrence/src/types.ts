export type View = 'command' | 'workspace' | 'neural-map' | 'settings';

export interface StudySession {
  id: string;
  title: string;
  duration: number; // minutes
  focusScore: number; // 0-100
  date: string;
  topics: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface FocusState {
  isActive: boolean;
  isDrifting: boolean;
  timeLeft: number;
  mode: 'sprint' | 'break';
}
