export type Finding = { title: string; evidence: string; interpretation: string; action: string };
export type InsightReport = {
  generatedAt: string;
  rangeDays: number | null;
  fingerprint: string;
  summary: {
    attemptCount: number;
    paperCount: number;
    answered: number;
    correct: number;
    wrong: number;
    skipped: number;
    accuracy: number | null;
    vocabularyCount: number;
    repeatedMistakeCount: number;
    telemetryAttempts: number;
    level: 'empty' | 'limited' | 'developing';
  };
  questionTypes: {
    id: string;
    label: string;
    sectionId: string;
    answered: number;
    correct: number;
    wrong: number;
    skipped: number;
    accuracy: number | null;
    errorRate: number | null;
    attempts: number;
    uniqueQuestions: number;
    lostPoints: number;
    confidence: 'low' | 'medium' | 'high';
    recommendation: string;
  }[];
  sections: {
    sectionId: string;
    title: string;
    totalSeconds: number;
    averageSeconds: number;
    recommendedSeconds: number;
    overBudgetCount: number;
    attemptCount: number;
  }[];
  repeatedMistakes: {
    paperId: string;
    questionId: string;
    questionNumber: number | string;
    paperTitle: string;
    typeLabel: string;
    prompt: string;
    wrongCount: number;
    seenCount: number;
    lastAttemptId: string;
    lastOutcome: 'wrong' | 'correct' | 'skipped';
    reason: string;
    explanation: string;
  }[];
  habits: {
    telemetryAttempts: number;
    answerChanges: number;
    correctToWrong: number;
    wrongToCorrect: number;
    sectionSwitches: number;
    lateChanges: number;
    autoSubmitted: number;
    notes: Finding[];
  };
  vocabulary: {
    reasonCounts: { id: string; label: string; count: number }[];
    words: {
      id: string;
      word: string;
      definition: string;
      context: string;
      reason: string;
      reasonLabel: string;
      encounterCount: number;
      reviewCount: number;
      forgotCount: number;
      linkedMistakes: number;
      signals: string[];
      hypothesis: string;
      recommendation: string;
    }[];
  };
  priorities: Finding[];
  limitations: string[];
  evidence: { id: string; text: string }[];
  recentAttempts: {
    id: string;
    title: string;
    date: string;
    accuracy: number | null;
    wrong: number;
    skipped: number;
  }[];
};
export type AiConfig = {
  managedEndpoint?: boolean;
  provider: 'ollama' | 'openai-compatible';
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  timeoutSeconds: number;
};
export type AiResult = {
  overview: string;
  findings: { title: string; analysis: string; evidenceIds: string[]; actions: string[] }[];
  vocabulary: { word: string; possibleReason: string; evidenceIds: string[]; exercise: string }[];
  plan: { day: number; title: string; minutes: number; tasks: string[] }[];
  limitations: string[];
};
export type AiJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  finishedAt?: string;
  fingerprint: string;
  rangeDays: number | null;
  model: string;
  error?: string;
  result?: AiResult;
  evidence?: { id: string; text: string }[];
};
export const wordReasons = [
  { id: 'unknown', label: '尚不确定' },
  { id: 'new', label: '从没学过' },
  { id: 'forgotten', label: '学过但忘了' },
  { id: 'context', label: '熟词僻义' },
  { id: 'listening', label: '看得懂但听不出' },
  { id: 'confusion', label: '形近词混淆' },
  { id: 'collocation', label: '搭配不熟悉' },
];
export const errorReasons = [
  { id: 'unknown', label: '尚不确定' },
  { id: 'vocabulary', label: '词汇不认识' },
  { id: 'grammar', label: '语法 / 长难句' },
  { id: 'locating', label: '定位错误' },
  { id: 'inference', label: '推理 / 干扰项' },
  { id: 'time', label: '时间不够' },
  { id: 'careless', label: '审题疏漏' },
];
