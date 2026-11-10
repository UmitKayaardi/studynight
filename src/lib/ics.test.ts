import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcs, foldLine } from './ics';

describe('ics', () => {
  it('escapes special characters', () => {
    expect(escapeIcs('a, b; c\nd\\e')).toBe('a\\, b\\; c\\nd\\\\e');
  });

  it('folds long lines at 75 octets, multibyte-safe', () => {
    const line = 'SUMMARY:' + 'é'.repeat(80);
    const folded = foldLine(line);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('creates one event per study day with alarms', () => {
    const ics = buildIcs({
      examTitle: 'Biology',
      time: '18:30',
      minutes: 30,
      now: new Date('2026-05-01T00:00:00Z'),
      days: [
        { date: '2026-05-02', practice: 10, reviews: 5, focusTopicIds: ['a'], mockExam: false },
        { date: '2026-05-03', practice: 0, reviews: 0, focusTopicIds: [], mockExam: false },
        { date: '2026-05-04', practice: 0, reviews: 3, focusTopicIds: [], mockExam: true },
      ],
      describe: (d) => ({
        summary: `Study: Biology (${d.practice} questions)`,
        description: 'Open StudyNight',
      }),
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260502T183000');
    expect(ics).toContain('DTEND:20260502T190000');
    expect(ics).toContain('SUMMARY:Study: Biology (10 questions)');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
