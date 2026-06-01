import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../chat/services/llm.service';
import { TemplateLoader } from '@chatai/prompts';
import { z } from 'zod';

const MultiQuerySchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(5),
});

@Injectable()
export class MultiQueryGenerator {
  private readonly logger = new Logger(MultiQueryGenerator.name);
  private readonly smallModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly llmService: LlmService,
  ) {
    this.smallModel = this.configService.get<string>('ollamaModelSmall') || 'qwen2.5:3b';
  }

  async generate(userMessage: string): Promise<string[]> {
    if (!userMessage || !userMessage.trim()) {
      return [];
    }

    try {
      const template = TemplateLoader.loadTemplate('multi_query');
      const prompt = template.replace('{{USER_MESSAGE}}', userMessage);

      const res = await this.llmService.chatJson(
        [{ role: 'user', content: prompt }],
        MultiQuerySchema,
        { model: this.smallModel },
      );

      if (res && Array.isArray(res.queries) && res.queries.length > 0) {
        return res.queries.slice(0, 3);
      }

      this.logger.warn('LLM returned empty or invalid queries format, falling back to original message');
      return [userMessage];
    } catch (e: any) {
      this.logger.warn(`Failed to generate multi-queries: ${e.message}. Falling back to original message`);
      return [userMessage];
    }
  }
}
