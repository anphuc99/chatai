import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  CHROMA_URL: Joi.string().uri().default('http://localhost:8000'),
  OLLAMA_BASE_URL: Joi.string().uri().default('http://localhost:11434'),
  OLLAMA_MODEL_LARGE: Joi.string().default('qwen2.5:14b'),
  OLLAMA_MODEL_SMALL: Joi.string().default('qwen2.5:3b'),
  OLLAMA_EMBED_MODEL: Joi.string().default('bge-m3'),
  TTS_ENGINE_URL: Joi.string().uri().default('http://localhost:5000'),
  TTS_DATASET_ABS_PATH: Joi.string().optional().allow(''),
  FIREBASE_PROJECT_ID: Joi.string().optional().allow(''),
  FIREBASE_SERVICE_ACCOUNT_PATH: Joi.string().optional().allow(''),
  FIREBASE_STORAGE_BUCKET: Joi.string().optional().allow(''),
  MAX_HISTORY_TOKENS: Joi.number().default(20000),
  HISTORY_STORE_BASE_PATH: Joi.string().default('./data/chat-cache'),
});
