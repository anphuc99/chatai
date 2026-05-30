import { create } from 'zustand';
import { CharacterDto } from '@chatai/shared-types';

interface CharacterState {
  byStory: Record<string, CharacterDto[]>;
  loadingByStory: Record<string, boolean>;

  setForStory: (sid: string, list: CharacterDto[]) => void;
  upsert: (character: CharacterDto) => void;
  remove: (id: string, sid: string) => void;
  setLoading: (sid: string, loading: boolean) => void;
}

export const useCharacterStore = create<CharacterState>((set) => ({
  byStory: {},
  loadingByStory: {},

  setForStory: (sid, list) =>
    set((state) => ({
      byStory: {
        ...state.byStory,
        [sid]: list,
      },
    })),

  upsert: (character) =>
    set((state) => {
      const sid = character.storyId;
      const list = state.byStory[sid] || [];
      const index = list.findIndex((c) => c.id === character.id);
      let newList;
      if (index >= 0) {
        newList = [...list];
        newList[index] = character;
      } else {
        newList = [...list, character];
      }
      return {
        byStory: {
          ...state.byStory,
          [sid]: newList,
        },
      };
    }),

  remove: (id, sid) =>
    set((state) => {
      const list = state.byStory[sid] || [];
      return {
        byStory: {
          ...state.byStory,
          [sid]: list.filter((c) => c.id !== id),
        },
      };
    }),

  setLoading: (sid, loading) =>
    set((state) => ({
      loadingByStory: {
        ...state.loadingByStory,
        [sid]: loading,
      },
    })),
}));
