/**
 * UI sounds synthesised with the Web Audio API — no audio files. Created lazily on first use (after a
 * user gesture), silent when sound is off.
 */
export type SoundName = 'correct' | 'wrong' | 'combo' | 'levelUp' | 'bossHit' | 'victory' | 'tap' | 'flip';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  gain = 0.12,
  slideTo?: number,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, gain = 0.08) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export function play(name: SoundName): void {
  const c = audio();
  if (!c) return;
  switch (name) {
    case 'tap':
      tone(c, 660, 0, 0.05, 'sine', 0.05);
      break;
    case 'flip':
      tone(c, 420, 0, 0.08, 'triangle', 0.06, 620);
      break;
    case 'correct':
      tone(c, 660, 0, 0.12, 'sine');
      tone(c, 990, 0.09, 0.18, 'sine');
      break;
    case 'wrong':
      tone(c, 300, 0, 0.22, 'triangle', 0.1, 200);
      break;
    case 'combo':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.06, 0.12, 'square', 0.05));
      break;
    case 'levelUp':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.08, 0.22, 'triangle', 0.09));
      break;
    case 'bossHit':
      noise(c, 0, 0.18, 0.12);
      tone(c, 140, 0, 0.25, 'sawtooth', 0.06, 70);
      break;
    case 'victory':
      [523, 659, 784].forEach((f, i) => tone(c, f, i * 0.12, 0.2, 'triangle', 0.09));
      tone(c, 1047, 0.38, 0.5, 'triangle', 0.1);
      tone(c, 784, 0.38, 0.5, 'sine', 0.06);
      break;
  }
}
