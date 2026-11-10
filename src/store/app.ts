/** Global UI state: settings, profile snapshot, toasts. Persistent data lives in IndexedDB (src/db). */
import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  getProfile,
  getSettings,
  setSetting,
  updateProfile,
  type Settings,
} from '../db/repo';
import type { Profile } from '../db/types';
import { setLanguage } from '../i18n';
import { applyTheme, setHapticsEnabled, setReducedMotionOverride } from '../lib/platform';
import { setSoundEnabled } from '../lib/sound';
import { newId } from '../lib/learning/random';
import { db } from '../db/schema';

export interface Toast {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  duration?: number;
}

interface AppState {
  ready: boolean;
  settings: Settings;
  profile: Profile | null;
  toasts: Toast[];
  boot: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  refreshProfile: () => Promise<Profile>;
  saveProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
}

function applySideEffects(s: Settings) {
  applyTheme(s.theme);
  setSoundEnabled(s.sound);
  setHapticsEnabled(s.haptics);
  setReducedMotionOverride(s.reducedMotion);
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  profile: null,
  toasts: [],

  async boot() {
    const [settings, profile] = await Promise.all([getSettings(), getProfile()]);
    // Deck creation cannot resume after the app was closed (the files are not kept): show it as interrupted.
    await db.decks
      .where('updatedAt')
      .above(0)
      .filter((d) => d.status === 'processing')
      .modify({ status: 'error', errorCode: 'INTERRUPTED' });
    applySideEffects(settings);
    await setLanguage(settings.language);
    set({ settings, profile, ready: true });
  },

  async updateSetting(key, value) {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    applySideEffects(settings);
    if (key === 'language') await setLanguage(value as string);
    await setSetting(key, value);
  },

  async refreshProfile() {
    const profile = await getProfile();
    set({ profile });
    return profile;
  },

  async saveProfile(patch) {
    const profile = await updateProfile(patch);
    set({ profile });
  },

  toast(t) {
    const id = newId();
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    return id;
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
