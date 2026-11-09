import { TopicsRequestSchema, TopicsResponseSchema } from '../shared/api.js';
import { createHandler } from '../server/handler.js';
import { buildTopics } from '../server/topics.js';

export const POST = createHandler({
  name: 'topics',
  input: TopicsRequestSchema,
  output: TopicsResponseSchema,
  run: buildTopics,
});
