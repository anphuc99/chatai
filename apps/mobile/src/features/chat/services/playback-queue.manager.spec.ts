import { Audio } from 'expo-av';
import { PlaybackQueueManager } from './playback-queue.manager';
import TtsFetchService from './tts-fetch.service';
import { ChatMessage } from '../types/message';

// Mocks
const mockUnloadAsync = jest.fn().mockResolvedValue({});
const mockStopAsync = jest.fn().mockResolvedValue({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentUpdateCallback: ((status: any) => void) | null = null;

const mockSound = {
  unloadAsync: mockUnloadAsync,
  stopAsync: mockStopAsync,
  setOnPlaybackStatusUpdate: jest.fn().mockImplementation((cb) => {
    currentUpdateCallback = cb;
  }),
};

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

// A robust helper to wait for assertions to pass
const waitFor = async (callback: () => void, timeout = 1000) => {
  const start = Date.now();
  while (true) {
    try {
      callback();
      return;
    } catch (e) {
      if (Date.now() - start > timeout) {
        throw e;
      }
      await flushPromises();
    }
  }
};

describe('PlaybackQueueManager', () => {
  let manager: PlaybackQueueManager;
  let onBubbleShow: jest.Mock;
  let onQueueFinished: jest.Mock;
  let onError: jest.Mock;
  let charactersVoice: Map<string, { voiceName: import('@chatai/shared-types').VoiceName; pitch: number }>;
  let sleepSpy: jest.SpyInstance;
  let originalCreateAsync: unknown;
  let originalSynthesize: unknown;

  beforeAll(() => {
    originalCreateAsync = Audio.Sound.createAsync;
    originalSynthesize = TtsFetchService.synthesize;
  });

  afterAll(() => {
    Audio.Sound.createAsync = originalCreateAsync as typeof Audio.Sound.createAsync;
    TtsFetchService.synthesize = originalSynthesize as typeof TtsFetchService.synthesize;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUpdateCallback = null;

    // Gán mock trực tiếp lên objects thực để ghi đè mock của preset
    Audio.Sound.createAsync = jest.fn().mockResolvedValue({ sound: mockSound, status: {} });
    TtsFetchService.synthesize = jest.fn();

    onBubbleShow = jest.fn();
    onQueueFinished = jest.fn();
    onError = jest.fn();

    charactersVoice = new Map();
    charactersVoice.set('char_1', { voiceName: 'Aoede', pitch: 1.1 });

    manager = new PlaybackQueueManager({
      onBubbleShow,
      onQueueFinished,
      onError,
      charactersVoice,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sleepSpy = jest.spyOn(manager as any, 'sleepInterruptible').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sleepSpy.mockRestore();
  });

  it('nên phát thành công một tin nhắn character (fetch -> play -> finish)', async () => {
    (TtsFetchService.synthesize as jest.Mock).mockResolvedValue({
      audioUrl: 'https://example.com/char_voice.mp3',
      cached: false,
    });

    const msg: ChatMessage = {
      kind: 'assistant',
      id: 'msg_1',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Chào bạn!',
      timestamp: Date.now(),
    };

    manager.enqueueBatch([msg]);

    // Đợi cho đến khi bubble show và setup sound callback xong
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg);
      expect(currentUpdateCallback).not.toBeNull();
    });

    expect(TtsFetchService.synthesize).toHaveBeenCalledWith({
      text: 'Chào bạn!',
      voiceName: 'Aoede',
      emotion: 'Neutral',
      intensity: 'medium',
      pitch: 1.1,
    });
    expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
      { uri: 'https://example.com/char_voice.mp3' },
      { shouldPlay: true }
    );

    // Mô phỏng phát âm thanh kết thúc
    currentUpdateCallback!({ isLoaded: true, didJustFinish: true });

    // Đợi cho đến khi kết thúc và unload sound
    await waitFor(() => {
      expect(mockUnloadAsync).toHaveBeenCalled();
      expect(onQueueFinished).toHaveBeenCalled();
    });
  });

  it('nên trì hoãn khi gặp Narrator tiếng Việt (không fetch, gọi delay)', async () => {
    const msg: ChatMessage = {
      kind: 'assistant',
      id: 'msg_2',
      characterId: null,
      characterName: 'Narrator',
      text: 'Căn phòng bỗng trở nên im lặng.',
      timestamp: Date.now(),
    };

    manager.enqueueBatch([msg]);

    // Chờ bubble show và kết thúc queue (vì sleepInterruptible đã được mock resolve ngay lập tức)
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg);
      expect(onQueueFinished).toHaveBeenCalled();
    });

    expect(TtsFetchService.synthesize).not.toHaveBeenCalled();
    // Narrator tiếng Việt dài 31 ký tự.
    // estimateNarratorDelayMs: Math.min(Math.max(31 * 80, 800), 5000) = 2480ms.
    expect(sleepSpy).toHaveBeenCalledWith(2480);
  });

  it('nên bỏ qua và tiếp tục phát tin nhắn tiếp theo nếu TTS gặp lỗi', async () => {
    (TtsFetchService.synthesize as jest.Mock).mockRejectedValue(new Error('TTS Error'));

    const msg1: ChatMessage = {
      kind: 'assistant',
      id: 'msg_1',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Tin nhắn lỗi',
      timestamp: Date.now(),
    };

    const msg2: ChatMessage = {
      kind: 'system',
      id: 'msg_2',
      text: 'Tin nhắn hệ thống',
      timestamp: Date.now(),
    };

    manager.enqueueBatch([msg1, msg2]);

    // Đợi cho đến khi onError và onQueueFinished được gọi
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onBubbleShow).toHaveBeenCalledWith(msg2);
      expect(onQueueFinished).toHaveBeenCalled();
    });
  });

  it('nên dừng ngay lập tức khi gọi stop()', async () => {
    (TtsFetchService.synthesize as jest.Mock).mockResolvedValue({
      audioUrl: 'https://example.com/char_voice.mp3',
      cached: false,
    });

    const msg1: ChatMessage = {
      kind: 'assistant',
      id: 'msg_1',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Tin nhắn đang phát',
      timestamp: Date.now(),
    };

    const msg2: ChatMessage = {
      kind: 'assistant',
      id: 'msg_2',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Tin nhắn xếp sau',
      timestamp: Date.now(),
    };

    manager.enqueueBatch([msg1, msg2]);

    // Chờ cho đến khi bắt đầu phát msg1 (currentUpdateCallback được gán)
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg1);
      expect(currentUpdateCallback).not.toBeNull();
    });

    // Gọi stop khi đang phát
    await manager.stop();

    expect(mockStopAsync).toHaveBeenCalled();
    expect(mockUnloadAsync).toHaveBeenCalled();

    // Mô phỏng callback didJustFinish (nếu hệ thống phát ra sau khi dừng)
    if (currentUpdateCallback) {
      currentUpdateCallback!({ isLoaded: true, didJustFinish: true });
    }
    
    // Đợi thêm một lúc xem msg2 có bị phát không
    await flushPromises();
    await flushPromises();

    // Tin nhắn sau không được hiển thị và onQueueFinished không được gọi
    expect(onBubbleShow).not.toHaveBeenCalledWith(msg2);
    expect(onQueueFinished).not.toHaveBeenCalled();
  });

  it('nên gối đầu (enqueue while playing) thêm tin nhắn mới vào queue', async () => {
    (TtsFetchService.synthesize as jest.Mock).mockResolvedValue({
      audioUrl: 'https://example.com/char_voice.mp3',
      cached: false,
    });

    const msg1: ChatMessage = {
      kind: 'assistant',
      id: 'msg_1',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Tin 1',
      timestamp: Date.now(),
    };

    const msg2: ChatMessage = {
      kind: 'assistant',
      id: 'msg_2',
      characterId: 'char_1',
      characterName: 'Mimi',
      text: 'Tin 2',
      timestamp: Date.now(),
    };

    // Chỉ enqueue tin 1 trước
    manager.enqueueBatch([msg1]);
    
    // Chờ bắt đầu phát tin 1
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg1);
      expect(currentUpdateCallback).not.toBeNull();
    });

    // Khi đang phát tin 1, enqueue thêm tin 2
    manager.enqueueBatch([msg2]);
    
    // Đợi một chút để xem tin 2 có bị phát ngay không (không được phát ngay)
    await flushPromises();
    expect(onBubbleShow).not.toHaveBeenCalledWith(msg2);

    // Kích hoạt phát xong tin 1
    const firstCallback = currentUpdateCallback!;
    currentUpdateCallback = null;
    firstCallback({ isLoaded: true, didJustFinish: true });

    // Đợi tin 2 bắt đầu phát
    await waitFor(() => {
      expect(onBubbleShow).toHaveBeenCalledWith(msg2);
      expect(currentUpdateCallback).not.toBeNull();
    });

    // Kích hoạt phát xong tin 2
    currentUpdateCallback!({ isLoaded: true, didJustFinish: true });

    // Đợi toàn bộ queue hoàn thành
    await waitFor(() => {
      expect(onQueueFinished).toHaveBeenCalled();
    });
  });

  it('hàm sleepInterruptible thực tế nên kết thúc sớm nếu isStopped chuyển thành true', async () => {
    // Khôi phục mock sleepInterruptible để test hàm thực tế
    sleepSpy.mockRestore();

    const start = Date.now();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sleepPromise = (manager as any).sleepInterruptible(2000);
    
    // Sau 100ms, gọi stop() để ngắt quãng sleep
    setTimeout(() => {
      manager.stop();
    }, 100);

    await sleepPromise;
    const duration = Date.now() - start;

    // Phải kết thúc sớm hơn nhiều so với 2000ms (thường là khoảng 100ms - 200ms)
    expect(duration).toBeLessThan(1000);
  });
});
