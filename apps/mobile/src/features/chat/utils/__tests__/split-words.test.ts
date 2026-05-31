import { splitTextByWords } from '../split-words';
import { Word } from '../../types/message';

describe('splitTextByWords', () => {
  it('should return empty array for empty text', () => {
    expect(splitTextByWords('', [])).toEqual([]);
  });

  it('should return a single non-word segment if words is null, undefined, or empty', () => {
    const text = '我想喝奶茶';
    expect(splitTextByWords(text, null)).toEqual([{ text, isWord: false }]);
    expect(splitTextByWords(text, undefined)).toEqual([{ text, isWord: false }]);
    expect(splitTextByWords(text, [])).toEqual([{ text, isWord: false }]);
  });

  it('should correctly segment text with a single matching word', () => {
    const text = '我想喝奶茶';
    const words: Word[] = [{ hz: '奶茶', py: 'nǎichá', vn: 'trà sữa' }];

    const result = splitTextByWords(text, words);
    expect(result).toEqual([
      { text: '我想喝', isWord: false },
      { text: '奶茶', isWord: true, word: words[0] },
    ]);
  });

  it('should apply greedy longest-match when words overlap', () => {
    const text = '我想喝奶茶';
    const words: Word[] = [
      { hz: '奶茶', py: 'nǎichá', vn: 'trà sữa' },
      { hz: '喝奶茶', py: 'hē nǎichá', vn: 'uống trà sữa' },
    ];

    const result = splitTextByWords(text, words);
    expect(result).toEqual([
      { text: '我想', isWord: false },
      { text: '喝奶茶', isWord: true, word: words[1] },
    ]);
  });

  it('should handle words that do not exist in the text (silent skip / hallucination)', () => {
    const text = '你好吗？';
    const words: Word[] = [{ hz: '奶茶', py: 'nǎichá', vn: 'trà sữa' }];

    const result = splitTextByWords(text, words);
    expect(result).toEqual([{ text: '你好吗？', isWord: false }]);
  });

  it('should work when there are multiple matching words', () => {
    const text = '今天天气很好';
    const words: Word[] = [
      { hz: '今天', py: 'jīntiān', vn: 'hôm nay' },
      { hz: '天气', py: 'tiānqì', vn: 'thời tiết' },
      { hz: '很好', py: 'hěn hǎo', vn: 'rất tốt' },
    ];

    const result = splitTextByWords(text, words);
    expect(result).toEqual([
      { text: '今天', isWord: true, word: words[0] },
      { text: '天气', isWord: true, word: words[1] },
      { text: '很好', isWord: true, word: words[2] },
    ]);
  });
});
