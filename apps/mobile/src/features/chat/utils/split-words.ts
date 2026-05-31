import { Word } from '../types/message';

export interface Segment {
  text: string;
  isWord: boolean;
  word?: Word;
}

/**
 * Tách văn bản chữ Hán thành các đoạn từ vựng (tương tác được) và không phải từ vựng.
 * Sử dụng giải thuật greedy longest-match.
 */
export function splitTextByWords(
  text: string,
  words: Word[] | null | undefined
): Segment[] {
  if (!text) {
    return [];
  }
  if (!words || words.length === 0) {
    return [{ text, isWord: false }];
  }

  // Lọc các từ hợp lệ và sắp xếp theo độ dài chữ Hán giảm dần (greedy longest match)
  const sortedWords = [...words]
    .filter((w) => w && typeof w.hz === 'string' && w.hz.length > 0)
    .sort((a, b) => b.hz.length - a.hz.length);

  if (sortedWords.length === 0) {
    return [{ text, isWord: false }];
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    let matched: Word | null = null;
    for (const w of sortedWords) {
      if (text.slice(i, i + w.hz.length) === w.hz) {
        matched = w;
        break;
      }
    }

    if (matched) {
      segments.push({
        text: matched.hz,
        isWord: true,
        word: matched,
      });
      i += matched.hz.length;
    } else {
      const last = segments[segments.length - 1];
      if (last && !last.isWord) {
        last.text += text[i] || '';
      } else {
        segments.push({
          text: text[i] || '',
          isWord: false,
        });
      }
      i++;
    }
  }

  return segments;
}
