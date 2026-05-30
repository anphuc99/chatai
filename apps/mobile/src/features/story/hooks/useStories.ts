import { useCallback } from 'react';
import { StoryDto } from '@chatai/shared-types';
import { useStoryStore } from '../store/story.store';
import { storyApi } from '../services/story.api';
import { CreateStoryInput, UpdateStoryInput } from '../services/story.schemas';

export function useStories() {
  const storiesById = useStoryStore((s) => s.storiesById);
  const order = useStoryStore((s) => s.order);
  const loading = useStoryStore((s) => s.loading);
  const nextCursor = useStoryStore((s) => s.nextCursor);
  const setLoading = useStoryStore((s) => s.setLoading);
  const setPage = useStoryStore((s) => s.setPage);
  const upsert = useStoryStore((s) => s.upsert);
  const remove = useStoryStore((s) => s.remove);

  const stories: StoryDto[] = order
    .map((id) => storiesById[id])
    .filter((s): s is StoryDto => s !== undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storyApi.list(undefined, 20);
      setPage(data.items, data.nextCursor, true);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  }, [setLoading, setPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const data = await storyApi.list(nextCursor, 20);
      setPage(data.items, data.nextCursor, false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  }, [loading, nextCursor, setLoading, setPage]);

  const create = useCallback(
    async (input: CreateStoryInput): Promise<StoryDto> => {
      const result = await storyApi.create(input);
      upsert(result);
      return result;
    },
    [upsert],
  );

  const update = useCallback(
    async (id: string, patch: UpdateStoryInput): Promise<StoryDto> => {
      const result = await storyApi.update(id, patch);
      upsert(result);
      return result;
    },
    [upsert],
  );

  const deleteStory = useCallback(
    async (id: string): Promise<void> => {
      await storyApi.delete(id);
      remove(id);
    },
    [remove],
  );

  return {
    stories,
    loading,
    nextCursor,
    refresh,
    loadMore,
    create,
    update,
    delete: deleteStory,
  };
}
