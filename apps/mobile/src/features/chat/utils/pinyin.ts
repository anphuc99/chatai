import { pinyin } from 'pinyin-pro';

const cache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

/**
 * Chuyển đổi chữ Hán sang Pinyin có dấu (tone symbol)
 * Cache kết quả tối đa 1000 phần tử để tối ưu hiệu năng
 */
export function toPinyin(text: string): string {
  if (!text) return '';
  
  if (cache.has(text)) {
    return cache.get(text)!;
  }
  
  const py = pinyin(text, { 
    toneType: 'symbol', 
    type: 'string', 
    nonZh: 'consecutive' 
  });
  
  // Dọn dẹp cache nếu vượt quá giới hạn
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  
  cache.set(text, py);
  return py;
}
