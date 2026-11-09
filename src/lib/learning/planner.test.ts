import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildPlan, topicWork, type PlannerTopic } from './planner';
import { addDays } from './streak';

const topics: PlannerTopic[] = [
  { id: 'a', title: 'Alpha', mastery: 80, questionCount: 20 },
  { id: 'b', title: 'Beta', mastery: 10, questionCount: 20 },
  { id: 'c', title: 'Gamma', mastery: 40, questionCount: 20 },
];

describe('buildPlan', () => {
  it('handles a passed exam', () => {
    const p = buildPlan({ today: '2026-05-10', examDate: '2026-05-09', topics, dueReviews: 5 });
    expect(p.status).toBe('past');
    expect(p.days).toEqual([]);
  });

  it('handles an exam today', () => {
    const p = buildPlan({ today: '2026-05-10', examDate: '2026-05-10', topics, dueReviews: 50 });
    expect(p.status).toBe('today');
    expect(p.days).toHaveLength(1);
    expect(p.days[0]!.mockExam).toBe(true);
    expect(p.days[0]!.reviews).toBe(30);
  });

  it('handles an exam tomorrow: one day with practice and a mock exam', () => {
    const p = buildPlan({ today: '2026-05-10', examDate: '2026-05-11', topics, dueReviews: 7 });
    expect(p.days).toHaveLength(1);
    expect(p.days[0]!.practice).toBeGreaterThan(0);
    expect(p.days[0]!.mockExam).toBe(true);
    expect(p.days[0]!.reviews).toBe(7);
  });

  it('handles no topics', () => {
    const p = buildPlan({ today: '2026-05-10', examDate: '2026-05-20', topics: [], dueReviews: 0 });
    expect(p.status).toBe('upcoming');
    expect(p.totalPractice).toBe(0);
    expect(p.days).toHaveLength(10);
  });

  it('front-loads the weakest topic and keeps the last day for a mock exam', () => {
    const p = buildPlan({ today: '2026-05-10', examDate: '2026-05-20', topics, dueReviews: 20 });
    expect(p.days[0]!.focusTopicIds[0]).toBe('b');
    expect(p.days.at(-1)!.mockExam).toBe(true);
    expect(p.days.at(-1)!.practice).toBe(0);
    expect(p.days.at(-1)!.date).toBe('2026-05-19');
  });

  it('covers all the work needed before the exam (within the daily cap)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 60 }),
        fc.array(
          fc.record({
            mastery: fc.integer({ min: 0, max: 100 }),
            questionCount: fc.integer({ min: 0, max: 80 }),
          }),
          {
            maxLength: 15,
          },
        ),
        fc.nat(500),
        (days, ts, due) => {
          const tps = ts.map((t, i) => ({ ...t, id: String(i), title: `T${i}` }));
          const p = buildPlan({
            today: '2026-01-01',
            examDate: addDays('2026-01-01', days),
            topics: tps,
            dueReviews: due,
          });
          const need = tps.reduce((s, t) => s + topicWork(t), 0);
          const capacity = 60 * (days - 1);
          const reviewsPlanned = p.days.reduce((s, d) => s + d.reviews, 0);
          return (
            p.days.length === days &&
            p.totalPractice === Math.min(need, capacity) &&
            reviewsPlanned >= due &&
            p.days.every((d) => d.practice >= 0 && d.practice <= 60 && d.reviews >= 0)
          );
        },
      ),
    );
  });
});
