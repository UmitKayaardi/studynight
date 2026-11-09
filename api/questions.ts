import { QuestionsRequestSchema, QuestionsResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { generateQuestions } from '../server/questions.js';

export const POST = createHandler({
  name: 'questions',
  input: QuestionsRequestSchema,
  output: QuestionsResponseSchema,
  run: generateQuestions,
});
