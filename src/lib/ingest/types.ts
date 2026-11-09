/** Where a piece of text came from: file, page/slide, heading path. */
export interface SourceRef {
  sourceId: string;
  page?: number;
  slide?: number;
  headingPath: string[];
}

export interface Block {
  kind: 'heading' | 'text';
  text: string;
  /** Heading level 1–6 (headings only). */
  level?: number;
  ref: SourceRef;
}

export interface ExtractResult {
  blocks: Block[];
  /** Pages or slides in the file (1 for plain text). */
  units: number;
  /** PDF pages with (almost) no extractable text that need vision reading. */
  visionPages: number[];
}

export const INGEST_LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  units: 400,
  photos: 30,
  chars: 200_000,
  visionPages: 30,
} as const;

export type IngestErrorCode =
  | 'UNSUPPORTED'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'TOO_MANY_PHOTOS'
  | 'TOO_LONG'
  | 'PASSWORD'
  | 'NO_TEXT'
  | 'EMPTY'
  | 'CORRUPT';

export class IngestError extends Error {
  constructor(
    readonly code: IngestErrorCode,
    readonly fileName?: string,
  ) {
    super(code);
    this.name = 'IngestError';
  }
}

export type SourceKind = 'pdf' | 'pptx' | 'docx' | 'text' | 'markdown' | 'photo' | 'paste';

export function kindOf(file: { name: string; type: string }): SourceKind | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  if (file.type === 'text/plain' || name.endsWith('.txt')) return 'text';
  if (/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/.test(name))
    return 'photo';
  return null;
}
