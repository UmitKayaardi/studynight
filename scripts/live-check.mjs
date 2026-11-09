// Calls every API endpoint once against a running server (default: the local dev server) with original sample
// text written for this project. Usage: npm run dev, then in a second terminal: npm run live:check
// Optional: set BASE=https://your-deployment.vercel.app to check a deployment. Prints status and timings only.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const NOTES = [
  "Volcanoes form where molten rock, called magma, rises through cracks in the Earth's crust. When magma reaches the surface it is called lava.",
  'Shield volcanoes have gentle slopes because their lava is runny and flows a long way before cooling. Mauna Loa in Hawaii is a shield volcano.',
  'Stratovolcanoes are steep and cone-shaped. They are built from layers of sticky lava, ash and rock, and their eruptions are often explosive.',
  'Scientists monitor volcanoes by measuring small earthquakes, changes in the shape of the ground and the gases that escape from vents.',
];

async function call(path, body) {
  const t = Date.now();
  const res = await fetch(
    BASE + path,
    body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {},
  );
  const json = await res.json().catch(() => ({}));
  const ms = Date.now() - t;
  const summary = json.error ? `error ${json.error.code}` : Object.keys(json).join(',');
  console.log(`${path.padEnd(18)} ${res.status} ${String(ms).padStart(6)} ms  ${summary}`);
  return json;
}

function testImage() {
  // Renders a small slide with text and a labelled diagram, if @napi-rs/canvas is available.
  return import('@napi-rs/canvas')
    .then(({ createCanvas }) => {
      const c = createCanvas(900, 600);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 900, 600);
      g.fillStyle = '#000';
      g.font = 'bold 44px sans-serif';
      g.fillText('The Water Cycle', 40, 70);
      g.font = '30px sans-serif';
      [
        '1. Evaporation: the sun heats water',
        '2. Condensation: vapour forms clouds',
        '3. Precipitation: rain falls',
      ].forEach((l, i) => g.fillText(l, 40, 140 + i * 50));
      g.strokeStyle = '#000';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(700, 420, 70, 0, Math.PI * 2);
      g.stroke();
      g.fillText('Cloud', 655, 430);
      g.beginPath();
      g.moveTo(700, 490);
      g.lineTo(700, 570);
      g.stroke();
      g.fillText('Rain', 720, 560);
      return c.toBuffer('image/jpeg').toString('base64');
    })
    .catch(() => null);
}

function testAudio() {
  if (process.platform !== 'win32') return null;
  const dir = mkdtempSync(join(tmpdir(), 'sn-'));
  const wav = join(dir, 'a.wav');
  try {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak('Shield volcanoes have gentle slopes because their lava is runny.'); $s.Dispose()`,
    ]);
    return existsSync(wav) ? readFileSync(wav).toString('base64') : null;
  } catch {
    return null;
  } finally {
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 100);
  }
}

const chunks = NOTES.map((text, i) => ({ id: `c${i + 1}`, text }));
await call('/api/health');
const topics = await call('/api/topics', {
  stage: 'map',
  language: 'auto',
  final: true,
  chunks: chunks.map((c) => ({ id: c.id, summary: c.text })),
});
const topic = topics.topics?.[0] ?? { id: 't1', title: 'Volcanoes', summary: 'How volcanoes form.' };
const q = await call('/api/questions', {
  language: 'en',
  topic: { id: topic.id, title: topic.title, summary: topic.summary },
  chunks,
  types: ['mcq', 'tf', 'fill', 'explain'],
  count: 4,
  difficulty: 2,
  existing: [],
});
if (q.questions)
  console.log(`  accepted ${q.questions.length}/${q.drafted}, rejected ${JSON.stringify(q.rejected)}`);
const explain = q.questions?.find((x) => x.type === 'explain');
await call('/api/grade', {
  language: 'en',
  question: explain?.prompt ?? 'Why do shield volcanoes have gentle slopes?',
  keyPoints: explain?.keyPoints ?? [
    'Their lava is runny',
    'The lava flows a long way before cooling',
    'This builds a wide, low shape',
  ],
  modelAnswer:
    explain?.modelAnswer ?? 'Runny lava flows far before cooling, so the volcano is wide and gently sloped.',
  evidence: [NOTES[1]],
  answer: 'Because the lava is very runny so it spreads out far.',
});
const a1 = await call('/api/ask', {
  language: 'en',
  question: 'How do scientists monitor volcanoes?',
  passages: chunks.map((c, i) => ({ n: i + 1, text: c.text })),
});
console.log(`  answerable → found=${a1.found} citations=${JSON.stringify(a1.citations)}`);
const a2 = await call('/api/ask', {
  language: 'en',
  question: 'Who was the first person to climb Mount Everest?',
  passages: chunks.map((c, i) => ({ n: i + 1, text: c.text })),
});
console.log(`  unanswerable → found=${a2.found}`);
const image = await testImage();
if (image) {
  const r = await call('/api/read-image', { image, mime: 'image/jpeg' });
  if (r.text !== undefined)
    console.log(`  text chars=${r.text.length} hasFigure=${r.hasFigure} language=${r.language}`);
} else console.log('/api/read-image    skipped (no canvas available)');
const audio = testAudio();
if (audio) {
  const r = await call('/api/transcribe', {
    audio,
    mime: 'audio/wav',
    durationMs: 5000,
    prompt: 'volcano, lava, magma',
  });
  if (r.text !== undefined)
    console.log(`  transcript words=${r.text.split(/\s+/).length} language=${r.language}`);
} else console.log('/api/transcribe    skipped (speech synthesis not available)');
