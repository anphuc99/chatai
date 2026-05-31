import { emojiFor } from '../emotion-emoji';
import { toPinyin } from '../pinyin';

describe('chat utils tests', () => {
  describe('emojiFor', () => {
    it('should return correct emoji for predefined emotions', () => {
      expect(emojiFor('Angry')).toBe('😠');
      expect(emojiFor('Sad')).toBe('😢');
      expect(emojiFor('Shy')).toBe('😳');
      expect(emojiFor('Neutral')).toBe('🙂');
    });

    it('should return default emoji for unknown or null emotions', () => {
      expect(emojiFor('UnknownEmotion')).toBe('🙂');
      expect(emojiFor(null)).toBe('🙂');
      expect(emojiFor(undefined)).toBe('🙂');
    });
  });

  describe('toPinyin', () => {
    it('should convert Chinese characters to Pinyin correctly', () => {
      const result = toPinyin('你好');
      expect(result).toBe('nǐ hǎo');
    });

    it('should handle non-Chinese text correctly', () => {
      const result = toPinyin('Hello你好');
      expect(result).toBe('Hello nǐ hǎo');
    });

    it('should handle empty text', () => {
      expect(toPinyin('')).toBe('');
    });

    it('should use cache for subsequent calls', () => {
      const text = '测试缓存';
      // Gọi lần 1
      const res1 = toPinyin(text);
      // Gọi lần 2 (nên trả về từ cache)
      const res2 = toPinyin(text);
      expect(res1).toBe(res2);
      expect(res2).toBe('cè shì huǎn cún');
    });
  });
});
