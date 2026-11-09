import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Search, Trash2, Upload } from 'lucide-react';
import { useApp } from '../store/app';
import { SubScreen, LanguageMenu } from '../components/layout/Shell';
import { Avatar, AVATAR_COUNT } from '../components/art/Art';
import { Mascot, MASCOT_THEMES } from '../components/art/Mascot';
import { Button } from '../components/ui/Button';
import { Card, Segmented, SelectField, TextField, Toggle } from '../components/ui/Controls';
import { ConfirmSheet } from '../components/ui/Sheet';
import { LANGUAGES } from '../i18n';
import { backupFileName, exportBackup, importBackup, parseBackup, type ParsedBackup } from '../db/backup';
import { deleteAllData, storageUsage } from '../db/storage';
import { embedClient } from '../lib/search/embedClient';
import { EMBED_DOWNLOAD_MB } from '../lib/search/embedProtocol';
import { loadSmartSearch, useSmartSearch } from '../lib/deck/embed';
import { downloadFile } from '../lib/ics';
import { DAILY_GOALS, type DailyGoal } from '../lib/learning/xp';
import { formatBytes, formatDate, formatNumber, formatPercent } from '../lib/platform';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSetting);
  const profile = useApp((s) => s.profile);
  const saveProfile = useApp((s) => s.saveProfile);
  const toast = useApp((s) => s.toast);
  const smart = useSmartSearch();
  const [downloaded, setDownloaded] = useState(false);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [pending, setPending] = useState<Extract<ParsedBackup, { ok: true }> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void embedClient.isDownloaded().then(setDownloaded);
    void storageUsage().then(setUsage);
  }, [smart.status]);

  if (!profile) return null;

  const exportData = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      downloadFile(backupFileName(), JSON.stringify(backup), 'application/json');
      toast({ message: t('settings.exported'), tone: 'success' });
    } finally {
      setBusy(false);
    }
  };

  const chooseImport = async (file: File) => {
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) toast({ message: t('settings.badBackup'), tone: 'error' });
    else setPending(parsed);
  };

  return (
    <SubScreen title={t('settings.title')} back="/profile">
      <div className="flex flex-col gap-4 py-3">
        <Card className="flex flex-col gap-3">
          <h2 className="font-display font-extrabold">{t('settings.you')}</h2>
          <TextField label={t('onboarding.setup.nickname')} value={nickname} maxLength={24} onChange={(e) => setNickname(e.target.value)} onBlur={() => void saveProfile({ nickname: nickname.trim() })} />
          <fieldset>
            <legend className="mb-2 font-semibold">{t('onboarding.setup.avatar')}</legend>
            <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={t('onboarding.setup.avatar')}>
              {Array.from({ length: AVATAR_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={profile.avatar === i}
                  aria-label={t('onboarding.setup.avatarN', { n: i + 1 })}
                  onClick={() => void saveProfile({ avatar: i })}
                  className={`flex aspect-square items-center justify-center rounded-xl border-2 ${profile.avatar === i ? 'border-accent' : 'border-transparent'}`}
                >
                  <Avatar index={i} size={32} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-semibold">{t('settings.mascotColour')}</legend>
            <div className="flex gap-2" role="radiogroup" aria-label={t('settings.mascotColour')}>
              {MASCOT_THEMES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={profile.mascotTheme === i}
                  aria-label={t('settings.mascotN', { n: i + 1 })}
                  onClick={() => void saveProfile({ mascotTheme: i })}
                  className={`rounded-2xl border-2 p-1 ${profile.mascotTheme === i ? 'border-accent' : 'border-transparent'}`}
                >
                  <Mascot theme={i} size={48} />
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="mb-2 font-semibold">{t('onboarding.setup.goal')}</p>
            <Segmented
              label={t('onboarding.setup.goal')}
              value={profile.dailyGoalMinutes}
              onChange={(v: DailyGoal) => void saveProfile({ dailyGoalMinutes: v })}
              options={DAILY_GOALS.map((g) => ({ value: g, label: t('common.minutes', { count: g }) }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display font-extrabold">{t('settings.app')}</h2>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{t('settings.language')}</span>
            <LanguageMenu />
          </div>
          <div>
            <p className="mb-2 font-semibold">{t('settings.theme')}</p>
            <Segmented
              label={t('settings.theme')}
              value={settings.theme}
              onChange={(v) => void update('theme', v)}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </div>
          <Toggle checked={settings.sound} onChange={(v) => void update('sound', v)} label={t('settings.sound')} />
          <Toggle checked={settings.haptics} onChange={(v) => void update('haptics', v)} label={t('settings.haptics')} description={t('settings.hapticsHint')} />
          <div>
            <p className="mb-2 font-semibold">{t('settings.motion')}</p>
            <Segmented
              label={t('settings.motion')}
              value={settings.reducedMotion === null ? 'system' : settings.reducedMotion ? 'reduce' : 'full'}
              onChange={(v) => void update('reducedMotion', v === 'system' ? null : v === 'reduce')}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'reduce', label: t('settings.motionReduce') },
                { value: 'full', label: t('settings.motionFull') },
              ]}
            />
          </div>
          <Toggle checked={settings.extendedTime} onChange={(v) => void update('extendedTime', v)} label={t('settings.extendedTime')} description={t('settings.extendedTimeHint')} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display font-extrabold">{t('settings.quizzes')}</h2>
          <SelectField
            label={t('settings.quizLanguage')}
            value={settings.quizLanguageDefault}
            onChange={(e) => void update('quizLanguageDefault', e.target.value)}
            options={[{ value: 'auto', label: t('newDeck.sameAsNotes') }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
          />
          <Toggle checked={settings.figureQuestions} onChange={(v) => void update('figureQuestions', v)} label={t('settings.figures')} description={t('settings.figuresHint')} />
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
            <p className="flex items-center gap-2 font-semibold">
              <Search className="size-5 text-accent" aria-hidden />
              {t('smart.title')}
            </p>
            <p className="text-sm text-muted">{downloaded ? t('settings.smartOn') : t('smart.body', { size: formatNumber(EMBED_DOWNLOAD_MB) })}</p>
            {smart.status === 'downloading' && smart.total > 0 && <p className="text-sm">{t('smart.downloading', { percent: formatPercent(smart.loaded / smart.total) })}</p>}
            {downloaded ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  await embedClient.remove();
                  await update('smartSearch', 'off');
                  useSmartSearch.getState().set({ status: 'idle' });
                  setDownloaded(false);
                  toast({ message: t('settings.smartRemoved') });
                }}
              >
                {t('settings.smartRemove')}
              </Button>
            ) : (
              <Button
                busy={smart.status === 'downloading'}
                onClick={async () => {
                  await update('smartSearch', 'on');
                  await loadSmartSearch();
                  setDownloaded(await embedClient.isDownloaded());
                }}
              >
                {t('smart.download', { size: formatNumber(EMBED_DOWNLOAD_MB) })}
              </Button>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display font-extrabold">{t('settings.data')}</h2>
          <p className="text-sm text-muted">{t('settings.backupHint')}</p>
          {usage && <p className="text-sm">{t('settings.storage', { used: formatBytes(usage.usage) })}</p>}
          <Button variant="secondary" busy={busy} icon={<Download className="size-5" aria-hidden />} onClick={() => void exportData()}>
            {t('settings.export')}
          </Button>
          <Button variant="secondary" icon={<Upload className="size-5" aria-hidden />} onClick={() => fileInput.current?.click()}>
            {t('settings.import')}
          </Button>
          <input ref={fileInput} type="file" accept=".studynight,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void chooseImport(e.target.files[0])} />
          <Button variant="danger" icon={<Trash2 className="size-5" aria-hidden />} onClick={() => setConfirmDelete(true)}>
            {t('settings.deleteAll')}
          </Button>
        </Card>
      </div>

      <ConfirmSheet
        open={!!pending}
        title={t('settings.importTitle')}
        body={
          pending && (
            <div className="flex flex-col gap-2">
              <p>{t('settings.importPreview', { date: formatDate(pending.preview.exportedAt, { day: 'numeric', month: 'long', year: 'numeric' }), decks: pending.preview.decks, count: pending.preview.questions })}</p>
              <p className="font-semibold text-bad">{t('settings.importWarning')}</p>
            </div>
          )
        }
        confirmLabel={t('settings.importConfirm')}
        danger
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await importBackup(pending.backup);
          setPending(null);
          location.assign('/');
        }}
      />
      <ConfirmSheet
        open={confirmDelete}
        title={t('settings.deleteTitle')}
        body={t('settings.deleteBody')}
        confirmLabel={t('settings.deleteConfirm')}
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await embedClient.remove();
          await deleteAllData();
          location.assign('/');
        }}
      />
    </SubScreen>
  );
}
