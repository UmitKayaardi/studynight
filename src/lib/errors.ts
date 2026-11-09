/** Maps any failure to a translated, specific message key with a suggested next action. */
import { ApiFailure } from './api';
import { IngestError } from './ingest/types';
import { isQuotaError } from '../db/storage';

export type ErrorKey =
  | 'UNSUPPORTED'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'TOO_MANY_PHOTOS'
  | 'TOO_LONG'
  | 'PASSWORD'
  | 'NO_TEXT'
  | 'EMPTY'
  | 'CORRUPT'
  | 'OFFLINE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UPSTREAM'
  | 'UNREADABLE'
  | 'TOO_LARGE'
  | 'BAD_INPUT'
  | 'STORAGE_FULL'
  | 'INTERRUPTED'
  | 'UNKNOWN';

export function errorKey(e: unknown): ErrorKey {
  if (e instanceof IngestError) return e.code;
  if (e instanceof ApiFailure) return e.code;
  if (isQuotaError(e)) return 'STORAGE_FULL';
  return 'UNKNOWN';
}

export function errorFile(e: unknown): string | undefined {
  return e instanceof IngestError ? e.fileName : undefined;
}
