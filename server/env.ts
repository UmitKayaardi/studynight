/** Server configuration from environment variables. The API key is read here only and never returned or logged. */

export interface ServerConfig {
  apiKey: string | undefined;
  generator: string;
  generatorFallback: string | undefined;
  verifier: string;
  verifierFallback: string | undefined;
  vision: string;
  stt: string;
  sttFallback: string | undefined;
}

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function getConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    apiKey: nonEmpty(env.GROQ_API_KEY),
    generator: nonEmpty(env.GROQ_GENERATOR_MODEL) ?? 'openai/gpt-oss-120b',
    generatorFallback: nonEmpty(env.GROQ_GENERATOR_FALLBACK_MODEL) ?? 'openai/gpt-oss-20b',
    verifier: nonEmpty(env.GROQ_VERIFIER_MODEL) ?? 'qwen/qwen3.8-27b',
    verifierFallback: nonEmpty(env.GROQ_VERIFIER_FALLBACK_MODEL) ?? 'openai/gpt-oss-20b',
    vision: nonEmpty(env.GROQ_VISION_MODEL) ?? 'qwen/qwen3.8-27b',
    stt: nonEmpty(env.GROQ_STT_MODEL) ?? 'whisper-large-v3',
    sttFallback: nonEmpty(env.GROQ_STT_FALLBACK_MODEL) ?? 'whisper-large-v3-turbo',
  };
}
