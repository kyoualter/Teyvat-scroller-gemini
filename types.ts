
export type CharacterId = 'paimon' | 'zhongli' | 'nahida' | 'raiden';

export interface Character {
  id: CharacterId;
  name: string;
  title: string;
  voiceName: string;
  voiceStyle: string;
  personality: string;
  color: string;
  avatar: string;
  description: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  isAudio?: boolean;
}

export interface DocumentState {
  id: string;
  name: string;
  content: string;
  type: string;
  progress: number; // 0 to 100
  quizScore: number | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export interface UserProgress {
  documentsCompleted: string[];
  totalQuizzesTaken: number;
  averageScore: number;
  badges: Badge[];
}

export type AppTab = 'reader' | 'study' | 'progress';
