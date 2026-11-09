/**
 * Exam planner: turns topics, mastery, due reviews and an exam date into daily targets.
 * Weak topics are front-loaded; the last study day before the exam is kept for a mock exam and reviews.
 */
import { addDays, daysBetween, type DayKey } from './streak';

export interface PlannerTopic {
  id: string;
  title: string;
  mastery: number; // 0..100
  questionCount: number;
}

export interface PlanDay {
  date: DayKey;
  /** Practice questions on the focus topics. */
  practice: number;
  /** Spaced-repetition reviews. */
  reviews: number;
  focusTopicIds: string[];
  /** Final day: a short mock exam. */
  mockExam: boolean;
}

export type PlanStatus = 'past' | 'today' | 'upcoming';

export interface Plan {
  status: PlanStatus;
  daysLeft: number;
  days: PlanDay[];
  totalPractice: number;
}

/** Practice questions a topic still needs: more for weaker topics, at least 5 unless mastered. */
export function topicWork(t: PlannerTopic): number {
  if (t.mastery >= 90 || t.questionCount === 0) return 0;
  const gap = (100 - Math.max(0, Math.min(100, t.mastery))) / 100;
  return Math.max(5, Math.ceil(Math.max(t.questionCount, 10) * gap * 1.5));
}

const MAX_PER_DAY = 60;

export function buildPlan(input: {
  today: DayKey;
  examDate: DayKey;
  topics: PlannerTopic[];
  dueReviews: number;
}): Plan {
  const daysLeft = daysBetween(input.today, input.examDate);
  if (daysLeft < 0) return { status: 'past', daysLeft, days: [], totalPractice: 0 };
  const reviews = Math.max(0, Math.round(input.dueReviews));
  if (daysLeft === 0) {
    return {
      status: 'today',
      daysLeft,
      days: [
        {
          date: input.today,
          practice: 0,
          reviews: Math.min(reviews, 30),
          focusTopicIds: weakest(input.topics, 2),
          mockExam: true,
        },
      ],
      totalPractice: 0,
    };
  }

  const studyDays = daysLeft; // today … the day before the exam
  const queue = input.topics
    .filter((t) => topicWork(t) > 0)
    .sort((a, b) => a.mastery - b.mastery || a.title.localeCompare(b.title))
    .map((t) => ({ id: t.id, left: topicWork(t) }));
  const total = queue.reduce((s, t) => s + t.left, 0);
  // Practice days exclude the final day when there is more than one day (reserved for a mock exam).
  const practiceDays = studyDays > 1 ? studyDays - 1 : 1;
  const perDay = Math.min(MAX_PER_DAY, Math.max(total ? 5 : 0, Math.ceil(total / practiceDays)));
  const reviewsPerDay = Math.ceil(reviews / studyDays);

  const days: PlanDay[] = [];
  let totalPractice = 0;
  for (let i = 0; i < studyDays; i++) {
    const isLast = i === studyDays - 1 && studyDays > 1;
    let budget = isLast ? 0 : perDay;
    const focus: string[] = [];
    let practice = 0;
    while (budget > 0 && queue.length) {
      const t = queue[0]!;
      const take = Math.min(budget, t.left);
      t.left -= take;
      budget -= take;
      practice += take;
      focus.push(t.id);
      if (t.left === 0) queue.shift();
    }
    totalPractice += practice;
    days.push({
      date: addDays(input.today, i),
      practice,
      reviews: Math.min(reviews, reviewsPerDay),
      focusTopicIds: focus.length ? focus : isLast ? weakest(input.topics, 2) : [],
      mockExam: isLast || studyDays === 1,
    });
  }
  return { status: 'upcoming', daysLeft, days, totalPractice };
}

function weakest(topics: PlannerTopic[], n: number): string[] {
  return topics
    .slice()
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, n)
    .map((t) => t.id);
}
