import { VoiceName } from '@chatai/shared-types';
import { apiClient } from '../../../api/client';

export interface TtsSynthesizeRequest {
  text: string;
  voiceName: VoiceName;
  emotion?: string;
  intensity?: string;
  pitch?: number;
}

export interface TtsSynthesizeResponse {
  audioUrl: string;
  cached: boolean;
}

export const TtsFetchService = {
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResponse> {
    return apiClient.post<TtsSynthesizeResponse>('/tts/synthesize', req);
  },
};

export default TtsFetchService;
