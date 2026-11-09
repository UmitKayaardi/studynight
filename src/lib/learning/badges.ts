/**
 * Badges and session titles: pure functions of stats. Labels live in the translation files
 * (badges.<id>.name / .desc and titles.<id>), so these modules only return ids.
 */

export interface LifetimeStats {
  decksCreated: number;
  questionsAnswered: number;
  correctAnswers: number;
  bossWins: number;
  perfectExams: number;
  bestStreak: number;
  quizLanguages: string[];
  bestCombo: number;
  bestSuddenDeath: number;
  flashcardsReviewed: number;
  greatExplains: number;
  questionsAsked: number;
  challengesSent: number;
  examsPlanned: number;
  level: number;
  /** Longest active study time in a single day, in minutes. */
  bestDayMinutes: number;
  /** Sessions finished at night (22:00–04:00 local) and in the early morning (04:00–07:00). */
  nightSessions: number;
  earlySessions: number;
  /** Returned to study after 7 or more days away. */
  comebacks: number;
}

export const BADGE_IDS = [
  'firstDeck',
  'firstQuiz',
  'firstBoss',
  'streak7',
  'streak30',
  'streak100',
  'questions100',
  'questions1000',
  'perfectExam',
  'polyglot',
  'combo10',
  'suddenDeath20',
  'flashcards100',
  'explainer',
  'curious',
  'challenger',
  'planner',
  'level10',
  'marathon',
  'nightSession',
  'earlyStart',
  'comeback',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

const RULES: Record<BadgeId, (s: LifetimeStats) => boolean> = {
  firstDeck: (s) => s.decksCreated >= 1,
  firstQuiz: (s) => s.questionsAnswered >= 1,
  firstBoss: (s) => s.bossWins >= 1,
  streak7: (s) => s.bestStreak >= 7,
  streak30: (s) => s.bestStreak >= 30,
  streak100: (s) => s.bestStreak >= 100,
  questions100: (s) => s.questionsAnswered >= 100,
  questions1000: (s) => s.questionsAnswered >= 1000,
  perfectExam: (s) => s.perfectExams >= 1,
  polyglot: (s) => new Set(s.quizLanguages).size >= 2,
  combo10: (s) => s.bestCombo >= 10,
  suddenDeath20: (s) => s.bestSuddenDeath >= 20,
  flashcards100: (s) => s.flashcardsReviewed >= 100,
  explainer: (s) => s.greatExplains >= 10,
  curious: (s) => s.questionsAsked >= 10,
  challenger: (s) => s.challengesSent >= 1,
  planner: (s) => s.examsPlanned >= 1,
  level10: (s) => s.level >= 10,
  marathon: (s) => s.bestDayMinutes >= 60,
  nightSession: (s) => s.nightSessions >= 1,
  earlyStart: (s) => s.earlySessions >= 1,
  comeback: (s) => s.comebacks >= 1,
};

/** Badges earned by these stats that are not in `owned`, in display order. */
export function newBadges(stats: LifetimeStats, owned: Iterable<string>): BadgeId[] {
  const have = new Set(owned);
  return BADGE_IDS.filter((id) => !have.has(id) && RULES[id](stats));
}

export const emptyStats = (): LifetimeStats => ({
  decksCreated: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  bossWins: 0,
  perfectExams: 0,
  bestStreak: 0,
  quizLanguages: [],
  bestCombo: 0,
  bestSuddenDeath: 0,
  flashcardsReviewed: 0,
  greatExplains: 0,
  questionsAsked: 0,
  challengesSent: 0,
  examsPlanned: 0,
  level: 1,
  bestDayMinutes: 0,
  nightSessions: 0,
  earlySessions: 0,
  comebacks: 0,
});

// ---------------------------------------------------------------------------------------------
// Session titles — playful, never insulting. Text only (no drawings).

export interface SessionSummary {
  answers: Array<{ correct: boolean; durationMs: number; usedHint: boolean; topicId: string }>;
  bestCombo: number;
  mode: 'quick' | 'topic' | 'review' | 'boss' | 'exam' | 'sudden' | 'flashcards' | 'challenge';
  bossWon?: boolean;
  /** Local hour (0–23) when the session finished. */
  hour: number;
  isFirstSession: boolean;
}

export const TITLE_IDS = [
  'bossSlayer',
  'perfectionist',
  'freshStart',
  'speedReader',
  'comebackKid',
  'comboMaster',
  'marathoner',
  'nightOwlMode',
  'earlyRiser',
  'topicTamer',
  'deepThinker',
  'hintFreeHero',
  'braveExplorer',
  'steadyClimber',
  'neverGiveUp',
] as const;
export type TitleId = (typeof TITLE_IDS)[number];

/** Picks the first title (by priority) whose rule matches. Every session gets a title. */
export function sessionTitle(s: SessionSummary): TitleId {
  const n = s.answers.length;
  const correct = s.answers.filter((a) => a.correct).length;
  const acc = n ? correct / n : 0;
  const avgMs = n ? s.answers.reduce((t, a) => t + a.durationMs, 0) / n : 0;
  const topics = new Set(s.answers.map((a) => a.topicId)).size;
  const firstThreeWrong = s.answers.slice(0, 3).filter((a) => !a.correct).length;

  if (s.mode === 'boss' && s.bossWon) return 'bossSlayer';
  if (n >= 5 && acc === 1) return 'perfectionist';
  if (s.isFirstSession) return 'freshStart';
  if (n >= 5 && acc >= 0.8 && avgMs > 0 && avgMs < 8_000) return 'speedReader';
  if (n >= 6 && firstThreeWrong >= 2 && acc >= 0.7) return 'comebackKid';
  if (s.bestCombo >= 8) return 'comboMaster';
  if (n >= 30) return 'marathoner';
  if (s.hour >= 22 || s.hour < 4) return 'nightOwlMode';
  if (s.hour >= 4 && s.hour < 7) return 'earlyRiser';
  if (n >= 5 && topics === 1 && acc >= 0.8) return 'topicTamer';
  if (n >= 3 && avgMs > 40_000 && acc >= 0.7) return 'deepThinker';
  if (n >= 5 && acc >= 0.7 && s.answers.every((a) => !a.usedHint)) return 'hintFreeHero';
  if (topics >= 3) return 'braveExplorer';
  if (acc >= 0.5) return 'steadyClimber';
  return 'neverGiveUp';
}

/**
 * Predicted exam score band (clearly labelled as an estimate in the UI):
 * centre = 100 × (0.5 × exam accuracy + 0.5 × mean retrievability of the deck's questions),
 * half-width = 8 + 25/√n (wider with fewer questions), clamped to 0–100.
 */
export function predictedBand(
  accuracy: number,
  meanRetrievability: number,
  n: number,
): { low: number; high: number } {
  const centre = 100 * (0.5 * clamp01(accuracy) + 0.5 * clamp01(meanRetrievability));
  const half = 8 + 25 / Math.sqrt(Math.max(1, n));
  return { low: Math.round(Math.max(0, centre - half)), high: Math.round(Math.min(100, centre + half)) };
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
