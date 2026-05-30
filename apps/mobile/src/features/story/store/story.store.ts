import { create } from 'zustand';
import { StoryDto } from '@chatai/shared-types';

interface StoryState {
  storiesById: Record<string, StoryDto>;
  order: string[]; // sorted by updatedAt desc
  nextCursor?: string;
  loading: boolean;

  setPage: (items: StoryDto[], nextCursor: string | undefined, replace: boolean) => void;
  upsert: (story: StoryDto) => void;
  remove: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useStoryStore = create<StoryState>((set) => ({
  storiesById: {},
  order: [],
  nextCursor: undefined,
  loading: false,

  setPage: (items, nextCursor, replace) => {
    set((state) => {
      const newById: Record<string, StoryDto> = replace
        ? {}
        : { ...state.storiesById };

      for (const item of items) {
        newById[item.id] = item;
      }

      const newOrder = replace
        ? items.map((i) => i.id)
        : [...state.order, ...items.map((i) => i.id).filter((id) => !state.order.includes(id))];

      return {
        storiesById: newById,
        order: newOrder,
        nextCursor,
        loading: false,
      };
    });
  },

  upsert: (story) => {
    set((state) => {
      const isNew = !state.storiesById[story.id];
      const newOrder = isNew
        ? [story.id, ...state.order]
        : state.order;

      return {
        storiesById: { ...state.storiesById, [story.id]: story },
        order: newOrder,
      };
    });
  },

  remove: (id) => {
    set((state) => {
      const { [id]: _removed, ...rest } = state.storiesById;
      return {
        storiesById: rest,
        order: state.order.filter((oid) => oid !== id),
      };
    });
  },

  setLoading: (loading) => set({ loading }),
}));
