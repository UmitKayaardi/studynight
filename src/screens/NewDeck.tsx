import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { Camera, ClipboardPaste, FileText, FileUp, ShieldAlert, Trash2 } from 'lucide-react';
import { SubScreen } from '../components/layout/Shell';
import { Mascot } from '../components/art/Mascot';
import { Button, IconButton } from '../components/ui/Button';
import { Card, ProgressBar, SelectField, TextArea, TextField } from '../components/ui/Controls';
import { Sheet } from '../components/ui/Sheet';
import { useApp } from '../store/app';
import { LANGUAGES } from '../i18n';
import { createDeckFromInput, validateInput, type Progress } from '../lib/deck/pipeline';
import { errorFile, errorKey, type ErrorKey } from '../lib/errors';
import { isAbort } from '../lib/api';
import { bumpStat } from '../lib/game/record';
import { INGEST_LIMITS, kindOf } from '../lib/ingest/types';
import { formatBytes, formatNumber, languageDisplayName } from '../lib/platform';
import { dayKey } from '../lib/learning/streak';

/** Quiz languages beyond the UI languages (model-supported; quality may be lower). */
const EXTRA_QUIZ_LANGUAGES = [
  'sv',
  'da',
  'no',
  'fi',
  'cs',
  'sk',
  'el',
  'he',
  'ro',
  'hu',
  'bg',
  'hr',
  'th',
  'ms',
  'ta',
  'te',
  'mr',
  'sw',
  'tl',
  'kk',
  'uz',
  'az',
];

const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown,image/*';

export function stripExtension(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,6}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export default function NewDeck() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const defaultQuizLanguage = useApp((s) => s.settings.quizLanguageDefault);
  const toast = useApp((s) => s.toast);
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [quizLanguage, setQuizLanguage] = useState(defaultQuizLanguage);
  const [examDate, setExamDate] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<{ key: ErrorKey; file?: string } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busyWait, setBusyWait] = useState(false);
  const [chooser, setChooser] = useState<{
    pages: number[];
    max: number;
    resolve: (p: number[]) => void;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[]) => {
    const next = [...files, ...Array.from(list)].slice(0, 60);
    setFiles(next);
    setError(null);
    if (!titleTouched && !title && next[0]) setTitle(stripExtension(next[0].name).slice(0, 80));
  };

  const languageOptions = useMemo(
    () => [
      { value: 'auto', label: t('newDeck.sameAsNotes') },
      ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
      ...EXTRA_QUIZ_LANGUAGES.map((c) => ({
        value: c,
        label: `${languageDisplayName(c)} · ${t('newDeck.lowerQuality')}`,
      })),
    ],
    [t],
  );

  const start = async () => {
    setError(null);
    try {
      validateInput(files, pasted);
    } catch (e) {
      setError({ key: errorKey(e), file: errorFile(e) });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress({ stage: 'reading', file: files[0]?.name ?? '' });
    try {
      const deckId = await createDeckFromInput(
        {
          title: title.trim() || (files[0] ? stripExtension(files[0].name) : t('newDeck.untitled')),
          quizLanguage,
          examDate: examDate || null,
          files,
          pasted,
        },
        {
          signal: ctrl.signal,
          onProgress: (p) => {
            if (p.stage === 'busy') setBusyWait(true);
            else {
              setBusyWait(false);
              setProgress(p);
            }
          },
          choosePages: (pages, max) => new Promise((resolve) => setChooser({ pages, max, resolve })),
        },
      );
      const badges = await bumpStat('decksCreated');
      toast({ message: t('newDeck.ready'), tone: 'success' });
      if (badges.length)
        toast({ message: t('badges.earned', { name: t(`badges.${badges[0]}.name`) }), tone: 'success' });
      navigate(`/deck/${deckId}`, { replace: true });
    } catch (e) {
      setProgress(null);
      setBusyWait(false);
      if (isAbort(e)) return;
      setError({ key: errorKey(e), file: errorFile(e) });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  if (progress) {
    const message =
      progress.stage === 'reading'
        ? progress.page
          ? t('processing.readingPage', {
              page: formatNumber(progress.page),
              total: formatNumber(progress.total ?? 0),
            })
          : t('processing.readingFile', { name: progress.file })
        : progress.stage === 'vision'
          ? t('processing.vision', { done: formatNumber(progress.done), total: formatNumber(progress.total) })
          : progress.stage === 'topics'
            ? t('processing.topics')
            : progress.stage === 'questions'
              ? t('processing.questions', { topic: progress.topic })
              : '';
    const fraction =
      progress.stage === 'reading'
        ? 0.05 + 0.25 * ((progress.page ?? 0) / (progress.total || 1))
        : progress.stage === 'vision'
          ? 0.3 + 0.2 * (progress.done / (progress.total || 1))
          : progress.stage === 'topics'
            ? 0.55
            : 0.8;
    return (
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <Mascot mood="thinking" size={150} />
        <h1 className="font-display text-2xl font-extrabold">{t('processing.title')}</h1>
        <p className="min-h-12 text-lg" aria-live="polite">
          {message}
        </p>
        {progress.stage === 'vision' && <p className="text-sm text-muted">{t('processing.handwriting')}</p>}
        {busyWait && <p className="rounded-2xl bg-star-soft p-3 text-sm">{t('errors.RATE_LIMITED.body')}</p>}
        <div className="w-full">
          <ProgressBar value={fraction} label={t('processing.title')} />
        </div>
        <p className="text-sm text-muted">{t('processing.background')}</p>
        <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
          {t('common.cancel')}
        </Button>
        <PageChooser
          chooser={chooser}
          onDone={(p) => {
            chooser?.resolve(p);
            setChooser(null);
          }}
        />
      </main>
    );
  }

  return (
    <SubScreen title={t('newDeck.title')} back="/">
      <div className="flex flex-col gap-4 py-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed p-5 text-center transition ${dragging ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}
        >
          <FileUp className="size-10 text-accent" aria-hidden />
          <p className="font-display text-lg font-extrabold">{t('newDeck.dropTitle')}</p>
          <p className="text-sm text-muted">{t('newDeck.formats')}</p>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              block
              icon={<FileText className="size-5" aria-hidden />}
              onClick={() => fileInput.current?.click()}
            >
              {t('newDeck.chooseFiles')}
            </Button>
            <Button
              block
              variant="secondary"
              icon={<Camera className="size-5" aria-hidden />}
              onClick={() => cameraInput.current?.click()}
            >
              {t('newDeck.takePhoto')}
            </Button>
          </div>
          <Button
            variant="ghost"
            icon={<ClipboardPaste className="size-5" aria-hidden />}
            onClick={() => setShowPaste((v) => !v)}
            aria-expanded={showPaste}
          >
            {t('newDeck.pasteText')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            data-testid="file-input"
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {showPaste && (
          <TextArea
            label={t('newDeck.pasteLabel')}
            value={pasted}
            maxLength={INGEST_LIMITS.chars}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t('newDeck.pastePlaceholder')}
          />
        )}

        {files.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('newDeck.selected')}>
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1 ps-3 pe-1"
              >
                {kindOf(f) === 'photo' ? (
                  <Camera className="size-5 shrink-0 text-muted" aria-hidden />
                ) : (
                  <FileText className="size-5 shrink-0 text-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                <IconButton
                  label={t('newDeck.remove', { name: f.name })}
                  onClick={() => setFiles(files.filter((_, k) => k !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {error && <ErrorCard code={error.key} file={error.file} />}

        <TextField
          label={t('newDeck.deckTitle')}
          value={title}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          placeholder={t('newDeck.titlePlaceholder')}
        />
        <SelectField
          label={t('newDeck.quizLanguage')}
          value={quizLanguage}
          options={languageOptions}
          onChange={(e) => setQuizLanguage(e.target.value)}
        />
        <TextField
          label={t('newDeck.examDate')}
          type="date"
          min={dayKey(Date.now())}
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
          hint={t('newDeck.examDateHint')}
        />

        <Card className="flex gap-3 bg-star-soft">
          <ShieldAlert className="size-6 shrink-0 text-star-text" aria-hidden />
          <p className="text-sm">
            {t('newDeck.notice')}{' '}
            <Link href="/privacy" className="font-bold underline">
              {t('legal.privacyLink')}
            </Link>
          </p>
        </Card>
        <Button size="lg" block onClick={() => void start()} disabled={!files.length && !pasted.trim()}>
          {t('newDeck.create')}
        </Button>
      </div>
    </SubScreen>
  );
}

export function ErrorCard({ code, file, onRetry }: { code: ErrorKey; file?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-2 border-bad bg-bad-soft" role="alert">
      <p className="font-display font-extrabold text-bad">{t(`errors.${code}.title`)}</p>
      <p className="text-sm">
        {t(`errors.${code}.body`, { file: file ?? '', limit: formatNumber(INGEST_LIMITS.units) })}
      </p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </Card>
  );
}

function PageChooser({
  chooser,
  onDone,
}: {
  chooser: { pages: number[]; max: number } | null;
  onDone: (pages: number[]) => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(1);
  if (!chooser) return null;
  const first = chooser.pages[0] ?? 1;
  const last = chooser.pages.at(-1) ?? 1;
  const start = Math.min(Math.max(from, first), last);
  const picked = chooser.pages.filter((p) => p >= start).slice(0, chooser.max);
  return (
    <Sheet
      open
      onClose={() => onDone(chooser.pages.slice(0, chooser.max))}
      title={t('processing.chooseTitle')}
      footer={
        <Button block onClick={() => onDone(picked)}>
          {t('processing.choosePages', {
            from: formatNumber(picked[0] ?? start),
            to: formatNumber(picked.at(-1) ?? start),
          })}
        </Button>
      }
    >
      <p className="mb-3 text-muted">
        {t('processing.chooseBody', { count: chooser.pages.length, max: chooser.max })}
      </p>
      <TextField
        label={t('processing.startPage')}
        type="number"
        min={first}
        max={last}
        value={from}
        onChange={(e) => setFrom(Number(e.target.value) || first)}
      />
    </Sheet>
  );
}
