import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square } from 'lucide-react';
import { db } from '../../db/schema';
import { AUDIO_MIME } from '../../../shared/api';
import { api } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { blobToBase64 } from '../../lib/ingest/image';
import { formatNumber } from '../../lib/platform';
import { Button } from '../ui/Button';

export const MAX_RECORDING_MS = 90_000;
const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Spoken answers: recorded locally (≤ 90 s), transcribed by Whisper with the deck's topic titles as a vocabulary hint. */
export function VoiceInput({
  deckId,
  language,
  onText,
}: {
  deckId: string;
  language: string;
  onText: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  if (!supported()) return null;

  const stop = () => recorder.current?.state === 'recording' && recorder.current.stop();

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('MIC_DENIED');
      return;
    }
    const mimeType = PREFERRED.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    const began = Date.now();
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      if (timer.current) clearInterval(timer.current);
      stream.getTracks().forEach((tr) => tr.stop());
      const durationMs = Math.min(MAX_RECORDING_MS, Date.now() - began);
      const base = (rec.mimeType || mimeType || 'audio/webm').split(';')[0]!;
      const mime = (AUDIO_MIME as readonly string[]).includes(base)
        ? (base as (typeof AUDIO_MIME)[number])
        : 'audio/webm';
      const blob = new Blob(parts, { type: mime });
      if (blob.size < 500) {
        setState('idle');
        return;
      }
      setState('transcribing');
      try {
        const topics = deckId ? await db.topics.where('deckId').equals(deckId).toArray() : [];
        const prompt = topics
          .map((x) => x.title)
          .join(', ')
          .slice(0, 600);
        const res = await api.transcribe({
          audio: await blobToBase64(blob),
          mime,
          durationMs,
          prompt,
          ...(language && language !== 'auto' && language !== 'und' ? { language } : {}),
        });
        if (res.text.trim()) onText(res.text.trim());
      } catch (e) {
        setError(errorKey(e));
      } finally {
        setState('idle');
      }
    };
    recorder.current = rec;
    rec.start(1000);
    setState('recording');
    setElapsed(0);
    timer.current = setInterval(() => {
      const ms = Date.now() - began;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) stop();
    }, 250);
  };

  return (
    <div className="flex flex-col gap-2">
      {state === 'recording' ? (
        <Button variant="danger" block icon={<Square className="size-5" aria-hidden />} onClick={stop}>
          {t('voice.stop', { seconds: formatNumber(Math.ceil((MAX_RECORDING_MS - elapsed) / 1000)) })}
        </Button>
      ) : (
        <Button
          variant="secondary"
          block
          busy={state === 'transcribing'}
          icon={<Mic className="size-5" aria-hidden />}
          onClick={() => void start()}
        >
          {state === 'transcribing' ? t('voice.transcribing') : t('voice.record')}
        </Button>
      )}
      <p className="sr-only" aria-live="polite">
        {state === 'recording' ? t('voice.recording') : ''}
      </p>
      {error && (
        <p className="rounded-2xl bg-bad-soft p-3 text-sm" role="alert">
          {error === 'MIC_DENIED' ? t('voice.denied') : t(`errors.${error}.body`)}
        </p>
      )}
    </div>
  );
}
