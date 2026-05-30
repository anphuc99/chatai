import { Audio } from 'expo-av';
import { apiClient } from '../../../api/client';

let currentSound: Audio.Sound | null = null;

export const ttsClientService = {
  /**
   * Gọi API nghe thử giọng nói từ Server
   */
  async testVoice(voiceName: string, pitch: number, sampleText?: string): Promise<string> {
    try {
      const response = await apiClient.post<{ audioUrl: string }>('/tts/test-voice', {
        voiceName,
        pitch,
        sampleText,
      });
      return response.audioUrl;
    } catch (error) {
      // Re-throw để phía UI xử lý
      throw error;
    }
  },

  /**
   * Tải và phát âm thanh từ URL
   */
  async playUrl(url: string): Promise<Audio.Sound> {
    // 1. Nếu có âm thanh đang phát, hãy dừng nó trước
    await this.stop();

    // 2. Tạo đối tượng sound mới và phát lập tức
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true }
    );

    currentSound = sound;

    // 3. Lắng nghe trạng thái phát để giải phóng tài nguyên sau khi phát xong
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded) {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (currentSound === sound) {
            currentSound = null;
          }
        }
      } else if (status.error) {
        console.error('[TtsClientService] Playback error:', status.error);
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) {
          currentSound = null;
        }
      }
    });

    return sound;
  },

  /**
   * Dừng và giải phóng tài nguyên âm thanh hiện tại
   */
  async stop(): Promise<void> {
    if (currentSound) {
      try {
        await currentSound.stopAsync();
      } catch (e) {
        // Bỏ qua lỗi nếu âm thanh đã dừng sẵn
      }
      try {
        await currentSound.unloadAsync();
      } catch (e) {
        // Bỏ qua lỗi giải phóng tài nguyên
      }
      currentSound = null;
    }
  },
};

export default ttsClientService;
