import { ReadImageRequestSchema, ReadImageResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { readImage } from '../server/answers.js';

export const POST = createHandler({
  name: 'read-image',
  input: ReadImageRequestSchema,
  output: ReadImageResponseSchema,
  run: readImage,
});
