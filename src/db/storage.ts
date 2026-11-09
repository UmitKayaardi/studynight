/** Storage persistence, usage and full data deletion. */
import Dexie from 'dexie';
import { db } from './schema';

/** Asks the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

/** True for "storage full" errors from IndexedDB or Cache Storage. */
export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string; inner?: { name?: string } })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  return (
    name === 'QuotaExceededError' || inner === 'QuotaExceededError' || name === Dexie.errnames.QuotaExceeded
  );
}

/** Deletes everything this app stored on the device: IndexedDB, Cache Storage and preferences. */
export async function deleteAllData(): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
  try {
    if ('caches' in globalThis) for (const key of await caches.keys()) await caches.delete(key);
  } catch {
    /* Cache Storage unavailable */
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage blocked */
  }
}
