import { useState, useEffect } from 'react';
import { CharacterDto } from '@chatai/shared-types';
import { characterApi } from '../../character/services/character.api';

const cache: Record<string, Map<string, CharacterDto>> = {};

/**
 * Hook để lấy Map<characterId, CharacterDto> cho một storyId.
 * Cache toàn cục để tránh gọi API nhiều lần khi render các bong bóng chat.
 */
export function useCharactersMap(storyId: string | null) {
  const [charMap, setCharMap] = useState<Map<string, CharacterDto>>(new Map());

  useEffect(() => {
    if (!storyId) return;

    // Trả về từ cache nếu có
    if (cache[storyId]) {
      setCharMap(cache[storyId]);
      return;
    }

    let active = true;

    characterApi
      .listByStory(storyId)
      .then((list) => {
        if (!active) return;
        const map = new Map<string, CharacterDto>();
        (list || []).forEach((c) => {
          if (c && c.id) {
            map.set(c.id, c);
          }
        });
        cache[storyId] = map;
        setCharMap(map);
      })
      .catch((err) => {
        console.error('[useCharactersMap] failed to load characters:', err);
      });

    return () => {
      active = false;
    };
  }, [storyId]);

  return charMap;
}
