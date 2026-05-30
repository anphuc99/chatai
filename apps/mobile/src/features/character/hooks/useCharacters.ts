import { useCallback } from 'react';
import { CharacterDto } from '@chatai/shared-types';
import { useCharacterStore } from '../store/character.store';
import { characterApi } from '../services/character.api';
import { CreateCharacterInput, UpdateCharacterInput } from '../services/character.schemas';
import { avatarService } from '../../profile/services/avatar.service';

export function useCharacters() {
  const store = useCharacterStore();

  const getCharactersByStory = useCallback(
    (sid: string): CharacterDto[] => {
      return store.byStory[sid] || [];
    },
    [store.byStory],
  );

  const getLoadingByStory = useCallback(
    (sid: string): boolean => {
      return !!store.loadingByStory[sid];
    },
    [store.loadingByStory],
  );

  const load = useCallback(
    async (sid: string) => {
      store.setLoading(sid, true);
      try {
        const data = await characterApi.listByStory(sid);
        store.setForStory(sid, data);
      } catch (error) {
        store.setLoading(sid, false);
        throw error;
      }
    },
    [store],
  );

  const create = useCallback(
    async (sid: string, dto: CreateCharacterInput): Promise<CharacterDto> => {
      const result = await characterApi.create(sid, dto);
      store.upsert(result);
      return result;
    },
    [store],
  );

  const update = useCallback(
    async (id: string, dto: UpdateCharacterInput): Promise<CharacterDto> => {
      const result = await characterApi.update(id, dto);
      store.upsert(result);
      return result;
    },
    [store],
  );

  const deleteCharacter = useCallback(
    async (id: string, sid: string): Promise<void> => {
      await characterApi.delete(id);
      store.remove(id, sid);
    },
    [store],
  );

  const uploadAvatar = useCallback(
    async (id: string, uri: string): Promise<string> => {
      const prepared = await avatarService.resizeAndCompress(uri);
      if (prepared.sizeBytes > 2 * 1024 * 1024) {
        throw new Error('Dung lượng ảnh quá lớn (vượt quá 2MB)');
      }
      const fd = avatarService.toFormData(prepared);
      const { avatarUrl } = await characterApi.uploadAvatar(id, fd);

      const storeState = useCharacterStore.getState();
      let foundChar = null;
      for (const sid of Object.keys(storeState.byStory)) {
        const char = storeState.byStory[sid]?.find((c) => c.id === id);
        if (char) {
          foundChar = char;
          break;
        }
      }
      if (foundChar) {
        store.upsert({ ...foundChar, avatarUrl });
      }
      return avatarUrl;
    },
    [store],
  );

  return {
    charactersByStory: getCharactersByStory,
    loadingByStory: getLoadingByStory,
    load,
    create,
    update,
    delete: deleteCharacter,
    uploadAvatar,
  };
}
