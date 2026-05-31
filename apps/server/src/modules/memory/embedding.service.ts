import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../shared/redis/redis.service';
import { AppException, ERR } from '../../shared/errors/app-exception';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import pLimit from 'p-limit';

@Injectable()
export class EmbeddingService {
  private readonly axios: AxiosInstance;
  private readonly model: string;
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly ttl = 86400; // 24h (86400 seconds)

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    const baseURL = this.configService.get<string>('ollamaBaseUrl') || 'http://localhost:11434';
    this.axios = axios.create({
      baseURL,
      timeout: 30000,
    });
    this.model = this.configService.get<string>('ollamaEmbedModel') || 'bge-m3';
  }

  async embed(text: string): Promise<number[]> {
    if (typeof text !== 'string') {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Input must be a string');
    }
    const trimmed = text.trim().slice(0, 8000);
    if (!trimmed) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Text cannot be empty after trimming');
    }

    const key = this.cacheKey(trimmed);
    try {
      const cached = await this.redis.getJson<number[]>(key);
      if (cached !== null) {
        return cached;
      }
    } catch (e: any) {
      this.logger.warn(`Redis get cache failed: ${e.message}`);
    }

    const vec = await this.callOllama(trimmed);

    try {
      await this.redis.setJson(key, vec, this.ttl);
    } catch (e: any) {
      this.logger.warn(`Redis set cache failed: ${e.message}`);
    }

    return vec;
  }

  async embedBatch(texts: string[], concurrency = 3): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Input must be an array of strings');
    }
    const limit = pLimit(concurrency);
    const tasks = texts.map((t) => limit(() => this.embed(t)));
    return Promise.all(tasks);
  }

  private cacheKey(text: string): string {
    const hash = crypto.createHash('md5').update(text).digest('hex');
    return `embed:${this.model}:${hash}`;
  }

  private async callOllama(text: string): Promise<number[]> {
    try {
      const res = await this.axios.post('/api/embeddings', {
        model: this.model,
        prompt: text,
      });

      const embedding = res.data?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new AppException(ERR.EMBED_UNAVAILABLE, 'Ollama returned invalid embedding format');
      }

      return embedding as number[];
    } catch (e: any) {
      const errCode = e.code || (e.response && e.response.code);
      if (errCode === 'ECONNREFUSED' || errCode === 'ECONNABORTED' || e.message?.includes('timeout')) {
        throw new AppException(ERR.EMBED_UNAVAILABLE, `Ollama service is unavailable: ${e.message}`);
      }
      if (e instanceof AppException) {
        throw e;
      }
      throw new AppException(ERR.EMBED_UNAVAILABLE, `Ollama call failed: ${e.message}`);
    }
  }
}
