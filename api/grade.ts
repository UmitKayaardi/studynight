import { GradeRequestSchema, GradeResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { grade } from '../server/answers.js';

export const POST = createHandler({
  name: 'grade',
  input: GradeRequestSchema,
  output: GradeResponseSchema,
  run: grade,
});
