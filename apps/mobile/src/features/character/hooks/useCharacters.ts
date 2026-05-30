import { useCallback } from 'react';
import { CharacterDto } from '@chatai/shared-types';
import { useCharacterStore } from '../store/character.store';
import { characterApi } from '../services/character.api';
import { CreateCharacterInput, UpdateCharacterInput } from '../services/character.schemas';
import { avatarService } from '../../profile/services/avatar.service';

export function useCharacters() {
  const byStory = useCharacterStore((s) => s.byStory);
  const loadingByStoryState = useCharacterStore((s) => s.loadingByStory);
  const setLoading = useCharacterStore((s) => s.setLoading);
  const setForStory = useCharacterStore((s) => s.setForStory);
  const upsert = useCharacterStore((s) => s.upsert);
  const remove = useCharacterStore((s) => s.remove);

  const getCharactersByStory = useCallback(
    (sid: string): CharacterDto[] => {
      return byStory[sid] || [];
    },
    [byStory],
  );

  const getLoadingByStory = useCallback(
    (sid: string): boolean => {
      return !!loadingByStoryState[sid];
    },
    [loadingByStoryState],
  );

  const load = useCallback(
    async (sid: string) => {
      setLoading(sid, true);
      try {
        const data = await characterApi.listByStory(sid);
        setForStory(sid, data);
      } catch (error) {
        setLoading(sid, false);
        throw error;
      }
    },
    [setLoading, setForStory],
  );

  const create = useCallback(
    async (sid: string, dto: CreateCharacterInput): Promise<CharacterDto> => {
      const result = await characterApi.create(sid, dto);
      upsert(result);
      return result;
    },
    [upsert],
  );

  const update = useCallback(
    async (id: string, dto: UpdateCharacterInput): Promise<CharacterDto> => {
      const result = await characterApi.update(id, dto);
      upsert(result);
      return result;
    },
    [upsert],
  );

  const deleteCharacter = useCallback(
    async (id: string, sid: string): Promise<void> => {
      await characterApi.delete(id);
      remove(id, sid);
    },
    [remove],
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
        useCharacterStore.getState().upsert({ ...foundChar, avatarUrl });
      }
      return avatarUrl;
    },
    [],
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
