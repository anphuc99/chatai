import { Injectable } from '@nestjs/common';
import { HistoryEntry } from '../types/history-entry';
import { LlmMessage } from '../types/llm-message';

@Injectable()
export class TokenCounterService {
  /**
   * Estimate the token count for a text string using heuristic rules.
   * Chinese characters: 1.5 characters per token.
   * Other characters: 4 characters per token.
   */
  estimateTokens(text?: string | null): number {
    if (!text) {
      return 0;
    }
    const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * Estimate the token count for a list of HistoryEntry objects.
   */
  estimateHistoryTokens(entries: HistoryEntry[]): number {
    let sum = 0;
    for (const e of entries) {
      switch (e.type) {
        case 'user':
          sum += this.estimateTokens(e.data.text) + (e.data.ephemeralOOC ? this.estimateTokens(e.data.ephemeralOOC) : 0);
          break;
        case 'assistant_batch':
          if (e.data.messages) {
            for (const m of e.data.messages) {
              sum += this.estimateTokens(m.text) + (m.translation ? this.estimateTokens(m.translation) : 0);
            }
          }
          break;
        case 'persistent_ooc':
        case 'ephemeral_ooc':
          sum += this.estimateTokens(e.data.text);
          break;
        case 'checkpoint':
          sum += this.estimateTokens(e.data.summary);
          break;
        case 'character_toggle':
          sum += this.estimateTokens(e.data.name) + 8;
          break;
        case 'system':
          sum += 50; // fixed overhead for system messages
          break;
        default:
          // Skip other entry types
          break;
      }
    }
    return sum;
  }

  /**
   * Estimate the token count for a list of LlmMessage objects.
   */
  estimateMessagesTokens(messages: LlmMessage[]): number {
    let sum = 0;
    for (const m of messages) {
      sum += this.estimateTokens(m.content) + 4; // 4 overhead tokens per message
    }
    return sum;
  }
}
