import { TranscribeRequestSchema, TranscribeResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { transcribeAudio } from '../server/answers.js';

export const POST = createHandler({
  name: 'transcribe',
  input: TranscribeRequestSchema,
  output: TranscribeResponseSchema,
  run: transcribeAudio,
});
