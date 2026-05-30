export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  chromaUrl: string;
  firebaseProjectId: string;
  firebaseServiceAccountPath: string;
  firebaseStorageBucket: string;
  ollamaBaseUrl: string;
  ollamaModelLarge: string;
  ollamaModelSmall: string;
  ollamaEmbedModel: string;
  ttsEngineUrl: string;
  ttsDatasetAbsPath: string;
  maxHistoryTokens: number;
}

export default (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModelLarge: process.env.OLLAMA_MODEL_LARGE || 'qwen2.5:14b',
  ollamaModelSmall: process.env.OLLAMA_MODEL_SMALL || 'qwen2.5:3b',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'bge-m3',
  ttsEngineUrl: process.env.TTS_ENGINE_URL || 'http://localhost:5000',
  ttsDatasetAbsPath: process.env.TTS_DATASET_ABS_PATH || '',
  maxHistoryTokens: parseInt(process.env.MAX_HISTORY_TOKENS || '20000', 10),
});
