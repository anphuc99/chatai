import { useCallback } from 'react';
import { StoryDto } from '@chatai/shared-types';
import { useStoryStore } from '../store/story.store';
import { storyApi } from '../services/story.api';
import { CreateStoryInput, UpdateStoryInput } from '../services/story.schemas';

export function useStories() {
  const store = useStoryStore();
  const stories: StoryDto[] = store.order
    .map((id) => store.storiesById[id])
    .filter((s): s is StoryDto => s !== undefined);

  const refresh = useCallback(async () => {
    store.setLoading(true);
    try {
      const data = await storyApi.list(undefined, 20);
      store.setPage(data.items, data.nextCursor, true);
    } catch (error) {
      store.setLoading(false);
      throw error;
    }
  }, [store]);

  const loadMore = useCallback(async () => {
    if (!store.nextCursor || store.loading) return;
    store.setLoading(true);
    try {
      const data = await storyApi.list(store.nextCursor, 20);
      store.setPage(data.items, data.nextCursor, false);
    } catch (error) {
      store.setLoading(false);
      throw error;
    }
  }, [store]);

  const create = useCallback(
    async (input: CreateStoryInput): Promise<StoryDto> => {
      const result = await storyApi.create(input);
      store.upsert(result);
      return result;
    },
    [store],
  );

  const update = useCallback(
    async (id: string, patch: UpdateStoryInput): Promise<StoryDto> => {
      const result = await storyApi.update(id, patch);
      store.upsert(result);
      return result;
    },
    [store],
  );

  const deleteStory = useCallback(
    async (id: string): Promise<void> => {
      await storyApi.delete(id);
      store.remove(id);
    },
    [store],
  );

  return {
    stories,
    loading: store.loading,
    nextCursor: store.nextCursor,
    refresh,
    loadMore,
    create,
    update,
    delete: deleteStory,
  };
}
