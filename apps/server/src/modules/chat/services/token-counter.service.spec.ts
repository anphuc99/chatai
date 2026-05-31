import { TokenCounterService } from './token-counter.service';
import { HistoryEntry } from '../types/history-entry';
import { LlmMessage } from '../types/llm-message';

describe('TokenCounterService', () => {
  let service: TokenCounterService;

  beforeEach(() => {
    service = new TokenCounterService();
  });

  describe('estimateTokens', () => {
    it('should correctly estimate tokens for empty or null/undefined text', () => {
      expect(service.estimateTokens('')).toBe(0);
      expect(service.estimateTokens(null)).toBe(0);
      expect(service.estimateTokens(undefined)).toBe(0);
    });

    it('should correctly estimate Chinese characters', () => {
      // 4 chinese characters -> ceil(4 / 1.5) = 3
      expect(service.estimateTokens('你好世界')).toBe(3);
    });

    it('should correctly estimate non-Chinese characters', () => {
      // 11 characters -> ceil(11 / 4) = 3
      expect(service.estimateTokens('Hello world')).toBe(3);
    });

    it('should correctly estimate mixed text', () => {
      // 2 Chinese + 6 other (including space) -> ceil(2/1.5 + 6/4) = ceil(1.333 + 1.5) = 3
      expect(service.estimateTokens('你好 hello')).toBe(3);
    });
  });

  describe('estimateHistoryTokens', () => {
    it('should correctly sum tokens for various history entries', () => {
      const entries: HistoryEntry[] = [
        {
          type: 'user',
          timestamp: Date.now(),
          data: {
            text: '你好', // 2 Chinese -> ceil(2 / 1.5) = 2
            ephemeralOOC: 'Hello', // 5 other -> ceil(5 / 4) = 2
          },
        }, // total = 4
        {
          type: 'assistant_batch',
          timestamp: Date.now(),
          data: {
            messages: [
              {
                characterName: 'Mimi',
                text: '嗨', // 1 Chinese -> ceil(1 / 1.5) = 1
                translation: 'Hi', // 2 other -> ceil(2 / 4) = 1
              },
            ],
          },
        }, // total = 2
        {
          type: 'persistent_ooc',
          timestamp: Date.now(),
          data: {
            text: 'Test', // 4 other -> ceil(4 / 4) = 1
          },
        }, // total = 1
        {
          type: 'checkpoint',
          timestamp: Date.now(),
          data: {
            summary: 'Tóm tắt', // 7 other -> ceil(7 / 4) = 2
            tokensBefore: 100,
            entriesCovered: 5,
          },
        }, // total = 2
        {
          type: 'system',
          timestamp: Date.now(),
          data: {
            storyId: 'story-1',
            activeCharacters: ['Mimi'],
          },
        }, // total = 50 (fixed)
        {
          type: 'character_toggle',
          timestamp: Date.now(),
          data: {
            characterId: 'char-1',
            name: 'Mimi', // 4 other -> ceil(4/4) = 1. Plus 8 overhead -> total = 9
            on: true,
          },
        }, // total = 9
      ];

      expect(service.estimateHistoryTokens(entries)).toBe(4 + 2 + 1 + 2 + 50 + 9);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should calculate total tokens with per-message overhead', () => {
      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a teacher.' }, // 18 chars -> ceil(18/4) = 5. Overhead 4 -> 9
        { role: 'user', content: 'Hello' }, // 5 chars -> ceil(5/4) = 2. Overhead 4 -> 6
        { role: 'assistant', content: '你好' }, // 2 Chinese -> ceil(2/1.5) = 2. Overhead 4 -> 6
      ];

      expect(service.estimateMessagesTokens(messages)).toBe(9 + 6 + 6);
    });
  });
});
