/** Generates an iCalendar (.ics) file with one study session per plan day — entirely on the device. */
import type { PlanDay } from './learning/planner';

export function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export interface IcsOptions {
  examTitle: string;
  days: PlanDay[];
  /** Local start time, "HH:MM". */
  time: string;
  minutes: number;
  /** Builds the event title and description for a day. */
  describe: (day: PlanDay) => { summary: string; description: string };
  now?: Date;
}

export function buildIcs(o: IcsOptions): string {
  const [hh, mm] = o.time.split(':').map(Number) as [number, number];
  const now = o.now ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyNight//Exam planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const day of o.days) {
    if (!day.practice && !day.reviews && !day.mockExam) continue;
    const date = day.date.replace(/-/g, '');
    const startMin = hh * 60 + mm;
    const endMin = startMin + o.minutes;
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
    const { summary, description } = o.describe(day);
    lines.push(
      'BEGIN:VEVENT',
      `UID:studynight-${date}-${Math.abs(hash(o.examTitle))}@studynight.app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${date}T${fmt(startMin)}`,
      `DTEND:${date}T${fmt(Math.min(endMin, 24 * 60 - 1))}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(summary)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

export function downloadFile(name: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
