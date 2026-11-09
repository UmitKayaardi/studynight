import { AskRequestSchema, AskResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { ask } from '../server/answers.js';

export const POST = createHandler({
  name: 'ask',
  input: AskRequestSchema,
  output: AskResponseSchema,
  run: ask,
});
