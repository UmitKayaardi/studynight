import type { Chunk } from '../../db/types';

/** A compact summary of a chunk for the topic map: heading path + first sentences. Never the full text. */
export function chunkSummary(c: Pick<Chunk, 'headingPath' | 'text'>): string {
  const head = c.headingPath.length ? `${c.headingPath.join(' › ')}: ` : '';
  const body = c.text.replace(/\s+/g, ' ');
  const sentences = body.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [body];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 260) break;
    out += s;
  }
  return (head + (out || body.slice(0, 260))).slice(0, 380).trim();
}
