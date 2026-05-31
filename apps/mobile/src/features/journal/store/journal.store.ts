import { create } from 'zustand';
import { SessionSummaryDto, SessionDetailDto } from '@chatai/shared-types';
import { journalService } from '../services/journal.service';

export interface JournalState {
  items: SessionSummaryDto[];
  nextCursor: string | null;
  loading: boolean;
  error: any | null;
  currentDetail: SessionDetailDto | null;
  filterStoryId: string | null;

  loadFirstPage: (opts?: { storyId?: string }) => Promise<void>;
  loadMore: () => Promise<void>;
  loadDetail: (sid: string) => Promise<void>;
  reset: () => void;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  items: [],
  nextCursor: null,
  loading: false,
  error: null,
  currentDetail: null,
  filterStoryId: null,

  loadFirstPage: async (opts) => {
    const storyId = opts?.storyId ?? null;
    set({ loading: true, error: null, filterStoryId: storyId });
    try {
      const page = await journalService.listSessions({ storyId: storyId || undefined, limit: 20 });
      set({ items: page.items, nextCursor: page.nextCursor });
    } catch (e: any) {
      set({ error: e });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    const { nextCursor, loading, filterStoryId, items } = get();
    if (!nextCursor || loading) return;
    set({ loading: true, error: null });
    try {
      const page = await journalService.listSessions({
        storyId: filterStoryId || undefined,
        cursor: nextCursor,
        limit: 20,
      });
      set({
        items: [...items, ...page.items],
        nextCursor: page.nextCursor,
      });
    } catch (e: any) {
      set({ error: e });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  loadDetail: async (sid) => {
    set({ loading: true, error: null, currentDetail: null });
    try {
      const d = await journalService.getDetail(sid);
      set({ currentDetail: d });
    } catch (e: any) {
      set({ error: e });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  reset: () =>
    set({
      items: [],
      nextCursor: null,
      loading: false,
      error: null,
      currentDetail: null,
      filterStoryId: null,
    }),
}));
