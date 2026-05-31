import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ZodSchema } from 'zod';
import { TemplateLoader } from '@chatai/prompts';
import { AppException, ERR } from '@/shared/errors/app-exception';
import { LlmMessage } from '../types/llm-message';

interface OllamaResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  eval_count?: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly axios: AxiosInstance;
  private readonly largeModel: string;
  private readonly smallModel: string;
  private readonly timeoutMs = 60000;
  private readonly maxRetries = 2;

  constructor(private readonly configService: ConfigService) {
    const ollamaUrl = this.configService.get<string>('ollamaBaseUrl') || 'http://localhost:11434';
    this.largeModel = this.configService.get<string>('ollamaModelLarge') || 'qwen2.5:14b';
    this.smallModel = this.configService.get<string>('ollamaModelSmall') || 'qwen2.5:3b';

    this.axios = axios.create({
      baseURL: ollamaUrl,
      timeout: this.timeoutMs,
    });
  }

  async chatJson<T>(
    messages: LlmMessage[],
    schema: ZodSchema<T>,
    opts?: { model?: string }
  ): Promise<T> {
    let attempt = 0;
    const workingMessages = [...messages];
    let lastError: string | null = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      if (lastError && attempt > 1) {
        const correctionMsg = {
          role: 'system' as const,
          content: `Lần trước response KHÔNG hợp lệ JSON schema. Lỗi: ${lastError}. CHỈ trả về JSON đúng schema, không markdown, không text thừa.`,
        };
        let lastIdx = -1;
        for (let i = workingMessages.length - 1; i >= 0; i--) {
          const m = workingMessages[i];
          if (m && m.role === 'system' && m.content.includes('Lần trước response KHÔNG hợp lệ JSON schema')) {
            lastIdx = i;
            break;
          }
        }
        if (lastIdx >= 0) workingMessages.splice(lastIdx, 1);
        workingMessages.push(correctionMsg);
      }

      let ollamaResp: OllamaResponse;
      try {
        ollamaResp = await this.callOllama(
          opts?.model ?? this.largeModel,
          workingMessages,
          'json'
        );
      } catch (e) {
        // network/timeout -> no retry, throw directly
        throw e;
      }

      const raw = ollamaResp.message.content;
      let parsed: unknown;
      try {
        parsed = this.extractJson(raw);
      } catch (e: any) {
        lastError = `JSON parse: ${e.message}`;
        this.logger.warn(
          { attempt, raw, lastError },
          'LLM JSON parse fail'
        );
        continue;
      }

      const validation = schema.safeParse(parsed);
      if (validation.success) {
        this.logger.debug(
          { attempt, evalCount: ollamaResp.eval_count },
          'LLM ok'
        );
        return validation.data;
      } else {
        lastError = JSON.stringify(validation.error.issues.slice(0, 3));
        this.logger.warn({ attempt, lastError }, 'LLM schema fail');
        continue;
      }
    }

    throw new AppException(ERR.LLM_PARSE_FAIL, lastError ?? 'unknown');
  }

  async summarize(
    text: string,
    mode: 'plot' | 'session' | 'character'
  ): Promise<string> {
    const templateName = `summary_${mode}` as const;
    const systemTemplate = TemplateLoader.loadTemplate(templateName);
    const messages: LlmMessage[] = [
      { role: 'system', content: systemTemplate },
      { role: 'user', content: text },
    ];

    const ollamaResp = await this.callOllama(
      this.smallModel,
      messages,
      undefined
    );
    return ollamaResp.message.content.trim();
  }

  private async callOllama(
    model: string,
    messages: LlmMessage[],
    format?: 'json'
  ): Promise<OllamaResponse> {
    const body = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      ...(format === 'json' ? { format: 'json' } : {}),
      options: {
        temperature: 0.7,
        num_predict: 2048,
      },
    };

    try {
      const res = await this.axios.post('/api/chat', body);
      return res.data;
    } catch (e: any) {
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || e.message?.includes('timeout')) {
        throw new AppException(ERR.LLM_TIMEOUT);
      }
      if (e.code === 'ECONNREFUSED' || !e.response) {
        throw new AppException(ERR.LLM_UNAVAILABLE);
      }
      throw new AppException(ERR.LLM_UNAVAILABLE, e.message);
    }
  }

  private extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    // 1. Thử parse trực tiếp
    try {
      return JSON.parse(trimmed);
    } catch {}

    // 2. Thử trích xuất từ ```json ... ``` hoặc ``` ... ``` fenced code blocks
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch && fencedMatch[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim());
      } catch {}
    }

    // 3. Thử tìm { ... } hoặc [ ... ] đầu tiên và cuối cùng
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {}
    }

    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
      } catch {}
    }

    throw new Error('No JSON found in response');
  }
}
