import { useJournalStore } from '../store/journal.store';

export function useJournalList() {
  const items = useJournalStore((state) => state.items);
  const nextCursor = useJournalStore((state) => state.nextCursor);
  const loading = useJournalStore((state) => state.loading);
  const error = useJournalStore((state) => state.error);
  const currentDetail = useJournalStore((state) => state.currentDetail);

  const loadFirstPage = useJournalStore((state) => state.loadFirstPage);
  const loadMore = useJournalStore((state) => state.loadMore);
  const loadDetail = useJournalStore((state) => state.loadDetail);
  const reset = useJournalStore((state) => state.reset);

  return {
    items,
    nextCursor,
    loading,
    error,
    currentDetail,
    loadFirstPage,
    loadMore,
    loadDetail,
    reset,
  };
}

export default useJournalList;
