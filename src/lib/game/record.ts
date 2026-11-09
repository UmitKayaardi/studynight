/**
 * Recording answers and sessions. One transaction per answer: FSRS card, review log, topic skill, daily
 * rollup, XP, stats and streak. All numbers are computed by code.
 */
import { db } from '../../db/schema';
import { getProfile } from '../../db/repo';
import type { CardRecord, DayRecord, GameMode, Profile, ReviewRecord, SessionRecord } from '../../db/types';
import type { QuestionType } from '../../../shared/question';
import { newBadges, sessionTitle, type BadgeId, type SessionSummary, type TitleId } from '../learning/badges';
import { newCardState, ratingFor, schedule, type SelfGrade } from '../learning/fsrs';
import { updateSkill } from '../learning/mastery';
import { newId } from '../learning/random';
import { dayKey, daysBetween, recordStudyDay } from '../learning/streak';
import { BONUS, levelFromXp, xpForAnswer } from '../learning/xp';

export interface AnswerRecordInput {
  questionId: string;
  deckId: string;
  topicId: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  correct: boolean;
  score: number;
  usedHint: boolean;
  durationMs: number;
  /** Active time this answer adds to the day (idle excluded). */
  activeMs: number;
  combo: number;
  mode: GameMode;
  selfGrade?: SelfGrade;
  quizLanguage: string;
  now?: number;
}

export interface AnswerRecordResult {
  xp: number;
  levelBefore: number;
  levelAfter: number;
}

const emptyDay = (day: string): DayRecord => ({
  day,
  activeMs: 0,
  answered: 0,
  correct: 0,
  xp: 0,
  goalMet: false,
});

export async function recordAnswer(i: AnswerRecordInput): Promise<AnswerRecordResult> {
  const now = i.now ?? Date.now();
  const today = dayKey(now);
  const rating = ratingFor({
    type: i.type,
    correct: i.correct,
    score: i.score,
    usedHint: i.usedHint,
    durationMs: i.durationMs,
    difficulty: i.difficulty,
    selfGrade: i.selfGrade,
  });
  const xp = xpForAnswer({
    type: i.type,
    difficulty: i.difficulty,
    correct: i.correct,
    score: i.score,
    usedHint: i.usedHint,
    combo: i.combo,
  });

  return db.transaction('rw', [db.cardStates, db.reviews, db.topics, db.days, db.profile], async () => {
    const prev = await db.cardStates.get(i.questionId);
    const base = prev ?? {
      ...newCardState(now),
      questionId: i.questionId,
      deckId: i.deckId,
      topicId: i.topicId,
    };
    const next: CardRecord = {
      ...base,
      ...schedule(base, rating, now),
      questionId: i.questionId,
      deckId: i.deckId,
      topicId: i.topicId,
    };
    await db.cardStates.put(next);

    const review: ReviewRecord = {
      questionId: i.questionId,
      deckId: i.deckId,
      topicId: i.topicId,
      at: now,
      day: today,
      correct: i.correct,
      score: i.type === 'explain' || i.type === 'match' || i.type === 'order' ? i.score : null,
      rating,
      durationMs: Math.round(i.durationMs),
      usedHint: i.usedHint,
      mode: i.mode,
    };
    await db.reviews.add(review);

    const topic = await db.topics.get(i.topicId);
    if (topic && i.type !== 'flashcard')
      await db.topics.update(topic.id, { skill: updateSkill(topic.skill, i.difficulty, i.correct) });

    const day = (await db.days.get(today)) ?? emptyDay(today);
    day.answered++;
    if (i.correct) day.correct++;
    day.activeMs += Math.max(0, Math.round(i.activeMs));
    day.xp += xp;
    await db.days.put(day);

    const p = await getProfile();
    const levelBefore = levelFromXp(p.xp).level;
    const stats = { ...p.stats };
    stats.questionsAnswered++;
    if (i.correct) stats.correctAnswers++;
    if (i.type === 'flashcard' || i.mode === 'flashcards') stats.flashcardsReviewed++;
    if (i.type === 'explain' && i.score >= 0.8) stats.greatExplains++;
    if (
      i.quizLanguage &&
      i.quizLanguage !== 'auto' &&
      i.quizLanguage !== 'und' &&
      !stats.quizLanguages.includes(i.quizLanguage)
    )
      stats.quizLanguages = [...stats.quizLanguages, i.quizLanguage];
    const streak = recordStudyDay(p.streak, today);
    stats.bestStreak = Math.max(stats.bestStreak, streak.best);
    stats.bestDayMinutes = Math.max(stats.bestDayMinutes, Math.floor(day.activeMs / 60_000));
    const totalXp = p.xp + xp;
    stats.level = levelFromXp(totalXp).level;
    await db.profile.put({ ...p, xp: totalXp, stats, streak });
    return { xp, levelBefore, levelAfter: stats.level };
  });
}

/** Removes the XP of an answered question that the learner then reported (reported questions earn nothing). */
export async function revokeXp(xp: number, now = Date.now()): Promise<void> {
  if (xp <= 0) return;
  await db.transaction('rw', [db.days, db.profile], async () => {
    const today = dayKey(now);
    const day = await db.days.get(today);
    if (day) await db.days.put({ ...day, xp: Math.max(0, day.xp - xp) });
    const p = await getProfile();
    await db.profile.put({ ...p, xp: Math.max(0, p.xp - xp) });
  });
}

export interface SessionFinishInput {
  deckId: string | null;
  mode: GameMode;
  startedAt: number;
  answers: Array<{ correct: boolean; durationMs: number; usedHint: boolean; topicId: string }>;
  xp: number;
  bestCombo: number;
  activeMs: number;
  bossWon?: boolean;
  perfectExam?: boolean;
  suddenDeathScore?: number;
  /** Days since the previous study day, measured when the session started. */
  daysAway: number;
  isFirstSession: boolean;
  now?: number;
}

export interface SessionFinishResult {
  title: TitleId;
  newBadges: BadgeId[];
  bonusXp: number;
  goalJustMet: boolean;
  levelBefore: number;
  levelAfter: number;
  profile: Profile;
  sessionId: string;
  newBestSuddenDeath: boolean;
}

export async function finishSession(i: SessionFinishInput): Promise<SessionFinishResult> {
  const now = i.now ?? Date.now();
  const hour = new Date(now).getHours();
  const summary: SessionSummary = {
    answers: i.answers,
    bestCombo: i.bestCombo,
    mode: i.mode,
    bossWon: i.bossWon,
    hour,
    isFirstSession: i.isFirstSession,
  };
  const title = sessionTitle(summary);
  const today = dayKey(now);

  return db.transaction('rw', [db.sessions, db.days, db.profile, db.badges, db.decks], async () => {
    const p = await getProfile();
    const levelBefore = levelFromXp(p.xp).level;
    let bonusXp = 0;
    if (i.answers.length >= 5) bonusXp += BONUS.sessionComplete;
    if (i.bossWon) bonusXp += BONUS.bossVictory;
    if (i.perfectExam) bonusXp += BONUS.perfectExam;

    const day = (await db.days.get(today)) ?? emptyDay(today);
    let goalJustMet = false;
    if (!day.goalMet && day.activeMs >= p.dailyGoalMinutes * 60_000) {
      goalJustMet = true;
      day.goalMet = true;
      bonusXp += BONUS.dailyGoal;
    }
    day.xp += bonusXp;
    await db.days.put(day);

    const stats = { ...p.stats };
    stats.bestCombo = Math.max(stats.bestCombo, i.bestCombo);
    if (i.bossWon) stats.bossWins++;
    if (i.perfectExam) stats.perfectExams++;
    if (i.answers.length && (hour >= 22 || hour < 4)) stats.nightSessions++;
    if (i.answers.length && hour >= 4 && hour < 7) stats.earlySessions++;
    if (i.answers.length && i.daysAway >= 7) stats.comebacks++;
    let newBestSuddenDeath = false;
    if (i.mode === 'sudden' && i.deckId && i.suddenDeathScore !== undefined) {
      stats.bestSuddenDeath = Math.max(stats.bestSuddenDeath, i.suddenDeathScore);
      const deck = await db.decks.get(i.deckId);
      if (deck && i.suddenDeathScore > deck.bestSuddenDeath) {
        newBestSuddenDeath = true;
        await db.decks.update(deck.id, { bestSuddenDeath: i.suddenDeathScore });
      }
    }
    const totalXp = p.xp + bonusXp;
    stats.level = levelFromXp(totalXp).level;
    const profile: Profile = { ...p, xp: totalXp, stats };
    await db.profile.put(profile);

    const owned = (await db.badges.toArray()).map((b) => b.id);
    const earned = newBadges(stats, owned);
    if (earned.length) await db.badges.bulkPut(earned.map((id) => ({ id, earnedAt: now })));

    const session: SessionRecord = {
      id: newId(),
      deckId: i.deckId,
      mode: i.mode,
      startedAt: i.startedAt,
      endedAt: now,
      answered: i.answers.length,
      correct: i.answers.filter((a) => a.correct).length,
      xp: i.xp + bonusXp,
      bestCombo: i.bestCombo,
      activeMs: Math.round(i.activeMs),
      title,
      topicIds: [...new Set(i.answers.map((a) => a.topicId))],
    };
    if (i.answers.length) await db.sessions.add(session);
    if (i.deckId) await db.decks.update(i.deckId, { lastPlayedAt: now });
    return {
      title,
      newBadges: earned,
      bonusXp,
      goalJustMet,
      levelBefore,
      levelAfter: stats.level,
      profile,
      sessionId: session.id,
      newBestSuddenDeath,
    };
  });
}

/** Badges that depend on actions outside sessions (deck created, exam planned, question asked, challenge sent). */
export async function bumpStat(
  key: 'decksCreated' | 'examsPlanned' | 'questionsAsked' | 'challengesSent',
): Promise<BadgeId[]> {
  return db.transaction('rw', [db.profile, db.badges], async () => {
    const p = await getProfile();
    const stats = { ...p.stats, [key]: p.stats[key] + 1 };
    await db.profile.put({ ...p, stats });
    const owned = (await db.badges.toArray()).map((b) => b.id);
    const earned = newBadges(stats, owned);
    if (earned.length) await db.badges.bulkPut(earned.map((id) => ({ id, earnedAt: Date.now() })));
    return earned;
  });
}

/** Days since the last study day (for the comeback badge), measured before a session starts. */
export function daysAway(profile: Profile, now = Date.now()): number {
  return profile.streak.lastDay ? daysBetween(profile.streak.lastDay, dayKey(now)) : 0;
}
