import { ListSessionsResponseDto, SessionDetailDto } from '@chatai/shared-types';
import { apiClient } from '../../../api/client';

export const journalService = {
  listSessions: (opts: {
    storyId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListSessionsResponseDto> => {
    const params = new URLSearchParams();
    if (opts.storyId) params.append('storyId', opts.storyId);
    if (opts.cursor) params.append('cursor', opts.cursor);
    if (opts.limit) params.append('limit', opts.limit.toString());

    const query = params.toString();
    const url = `/journal/sessions${query ? `?${query}` : ''}`;
    return apiClient.get(url);
  },

  getDetail: (sid: string): Promise<SessionDetailDto> =>
    apiClient.get(`/journal/sessions/${sid}`),
};

export default journalService;
