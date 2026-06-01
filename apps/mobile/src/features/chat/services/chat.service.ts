import {
  SessionResultDto,
  HydratedHistoryDto,
  AssistantBatchDto,
  EndChatResultDto,
} from '@chatai/shared-types';
import { apiClient } from '../../../api/client';

export const chatService = {
  startSession: (storyId: string): Promise<SessionResultDto> =>
    apiClient.post('/chat/sessions', { storyId }),

  getHistory: (sid: string): Promise<HydratedHistoryDto> =>
    apiClient.get(`/chat/sessions/${sid}/history`),

  sendMessage: (
    sid: string,
    userMessage: string,
    ephemeralOOC?: string,
  ): Promise<AssistantBatchDto> =>
    apiClient.post(`/chat/sessions/${sid}/message`, {
      userMessage,
      ephemeralOOC,
    }),

  setOoc: (
    sid: string,
    type: 'persistent' | 'ephemeral',
    text: string,
  ): Promise<{ status: string }> =>
    apiClient.post(`/chat/sessions/${sid}/ooc`, { type, text }),

  toggleCharacter: (
    sid: string,
    characterId: string,
    on: boolean,
  ): Promise<{ status: string }> =>
    apiClient.post(`/chat/sessions/${sid}/character-toggle`, {
      characterId,
      on,
    }),

  addTempCharacter: (
    sid: string,
    name: string,
    description: string,
  ): Promise<{ tempId: string }> =>
    apiClient.post(`/chat/sessions/${sid}/temp-character`, {
      name,
      description,
    }),

  endSession: (
    sid: string,
    idempotencyKey: string,
  ): Promise<EndChatResultDto> =>
    apiClient.post(
      `/chat/sessions/${sid}/end`,
      {},
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    ),

  postAutoContinue: (sid: string, signal?: AbortSignal): Promise<AssistantBatchDto> =>
    apiClient.post(`/chat/sessions/${sid}/auto-continue`, {}, { signal }),
};

export default chatService;
