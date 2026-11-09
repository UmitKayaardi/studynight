import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { SendHorizontal } from 'lucide-react';
import { db } from '../db/schema';
import type { Chunk } from '../db/types';
import { SubScreen } from '../components/layout/Shell';
import { Mascot } from '../components/art/Mascot';
import { IconButton } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { RichText } from '../components/RichText';
import { api } from '../lib/api';
import { errorKey } from '../lib/errors';
import { retrieve } from '../lib/search/retrieve';
import { ensureIndex } from '../lib/deck/embed';
import { bumpStat } from '../lib/game/record';
import { useApp } from '../store/app';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  found?: boolean;
  passages?: Chunk[];
  citations?: number[];
  error?: string;
}

/** Splits an answer into text and [n] citation markers. */
export function splitCitations(text: string): Array<string | number> {
  const out: Array<string | number> = [];
  let last = 0;
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(Number(m[1]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Ask() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const toast = useApp((s) => s.toast);
  const deck = useLiveQuery(() => db.decks.get(id), [id]);
  const chunks = useLiveQuery(() => db.chunks.where('deckId').equals(id).toArray(), [id]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Chunk | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureIndex(id);
  }, [id]);
  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in current browsers, which React must not receive.
    void endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const ask = async () => {
    const question = input.trim();
    if (!question || busy || !chunks || !deck) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: question }]);
    try {
      const hits = await retrieve(id, chunks, question, 6);
      const passages = hits.map((h) => chunks.find((c) => c.id === h.id)!).filter(Boolean);
      if (!passages.length) {
        setMessages((m) => [...m, { role: 'assistant', text: t('ask.notCovered'), found: false }]);
        return;
      }
      const language = deck.quizLanguage === 'auto' ? (deck.notesLanguage === 'und' ? 'auto' : deck.notesLanguage) : deck.quizLanguage;
      const res = await api.ask({ language, question, passages: passages.map((p, i) => ({ n: i + 1, text: p.text.slice(0, 4000) })) });
      setMessages((m) => [...m, { role: 'assistant', text: res.answer || t('ask.notCovered'), found: res.found, passages, citations: res.citations }]);
      const badges = await bumpStat('questionsAsked');
      if (badges.length) toast({ message: t('badges.earned', { name: t(`badges.${badges[0]}.name`) }), tone: 'success' });
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: '', error: errorKey(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen title={t('modes.ask')} back={`/deck/${id}`}>
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-3 pt-2 pb-24">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Mascot mood="thinking" size={110} />
            <p className="font-display text-xl font-extrabold">{t('ask.title')}</p>
            <p className="text-muted">{t('ask.intro')}</p>
          </div>
        )}
        <ul className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              {m.role === 'user' ? (
                <p className="max-w-[85%] rounded-3xl rounded-ee-md bg-accent px-4 py-2 text-on-accent" dir="auto">
                  {m.text}
                </p>
              ) : m.error ? (
                <p className="max-w-[85%] rounded-3xl rounded-es-md bg-bad-soft px-4 py-2 text-sm" role="alert">
                  {m.error === 'OFFLINE' ? t('ask.offline') : t(`errors.${m.error}.body`)}
                </p>
              ) : (
                <div className="max-w-[90%] rounded-3xl rounded-es-md bg-surface px-4 py-3 shadow-card" dir="auto">
                  <p className="whitespace-pre-line">
                    {splitCitations(m.text).map((part, k) =>
                      typeof part === 'number' && m.passages?.[part - 1] ? (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setOpen(m.passages![part - 1]!)}
                          className="mx-0.5 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full bg-accent-soft px-1.5 align-baseline text-xs font-extrabold"
                          aria-label={t('ask.openSource', { n: part })}
                        >
                          {part}
                        </button>
                      ) : (
                        <RichText key={k} as="span" text={String(part)} />
                      ),
                    )}
                  </p>
                  {m.found === false && <p className="mt-2 text-xs text-muted">{t('ask.notCoveredHint')}</p>}
                </div>
              )}
            </li>
          ))}
          {busy && (
            <li className="text-sm text-muted" aria-live="polite">
              {t('ask.thinking')}
            </li>
          )}
        </ul>
        <div ref={endRef} />
      </div>
      <form
        className="fixed inset-x-0 bottom-0 border-t border-border bg-bg-elevated/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <label htmlFor="ask-input" className="sr-only">
            {t('ask.label')}
          </label>
          <input
            id="ask-input"
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('ask.placeholder')}
            className="min-h-12 flex-1 rounded-full border border-border bg-surface px-4 focus:border-accent focus:outline-none"
            dir="auto"
          />
          <IconButton label={t('ask.send')} type="submit" disabled={!input.trim() || busy} className="bg-accent text-on-accent disabled:opacity-50">
            <SendHorizontal className="size-5 rtl:-scale-x-100" aria-hidden />
          </IconButton>
        </div>
        <p className="mx-auto mt-1 max-w-lg text-center text-xs text-muted">{t('ask.disclaimer')}</p>
      </form>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={t('play.sourceTitle')}>
        {open && (
          <div className="pb-3">
            {open.headingPath.length > 0 && <p className="mb-2 text-xs font-bold text-muted">{open.headingPath.join(' › ')}</p>}
            <p className="whitespace-pre-line text-sm leading-relaxed">{open.text}</p>
          </div>
        )}
      </Sheet>
    </SubScreen>
  );
}
