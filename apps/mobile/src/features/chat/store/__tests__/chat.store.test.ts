import { useChatStore } from '../chat.store';
import { chatService } from '../../services/chat.service';
import { characterApi } from '../../../character/services/character.api';
import { setPlaybackManagerSingleton } from '../../services/playback-queue.manager';

jest.mock('../../services/chat.service', () => ({
  chatService: {
    startSession: jest.fn(),
    getHistory: jest.fn(),
    sendMessage: jest.fn(),
    setOoc: jest.fn(),
    toggleCharacter: jest.fn(),
    addTempCharacter: jest.fn(),
  },
}));

jest.mock('../../../character/services/character.api', () => ({
  characterApi: {
    listByStory: jest.fn(),
  },
}));

describe('ChatStore', () => {
  beforeEach(() => {
    // Reset Zustand store trước mỗi test case
    useChatStore.getState().reset();
    jest.clearAllMocks();
  });

  it('nên khởi tạo state mặc định chính xác', () => {
    const state = useChatStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.storyId).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.activeCharacters).toEqual([]);
    expect(state.persistentOOC).toBe('');
    expect(state.temporaryCharacters).toEqual([]);
    expect(state.charactersFull).toEqual([]);
    expect(state.inputLocked).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('nên startSession thành công', async () => {
    const mockRes = {
      sessionId: 'session-123',
      isResumed: false,
      initialActiveCharacters: ['char-1', 'char-2'],
    };
    (chatService.startSession as jest.Mock).mockResolvedValue(mockRes);

    await useChatStore.getState().startSession('story-123');

    const state = useChatStore.getState();
    expect(state.sessionId).toBe('session-123');
    expect(state.storyId).toBe('story-123');
    expect(state.activeCharacters).toEqual(['char-1', 'char-2']);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(chatService.startSession).toHaveBeenCalledWith('story-123');
  });

  it('nên loadHistory thành công và map các tin nhắn chính xác', async () => {
    const mockHistory = {
      messages: [
        { role: 'user', text: 'Xin chào', timestamp: 1000 },
        { role: 'assistant', characterName: 'Lý Bạch', text: '你好', timestamp: 2000, translation: 'Chào bạn', emotion: 'vui vẻ', intensity: 'vừa phải' },
        { role: 'persistent_ooc', text: 'Hai người ở quán rượu', timestamp: 3000 },
      ],
      persistentOOC: 'Hai người ở quán rượu',
      activeCharacters: ['char-1'],
    };

    useChatStore.setState({ sessionId: 'session-123' });
    (chatService.getHistory as jest.Mock).mockResolvedValue(mockHistory);

    await useChatStore.getState().loadHistory();

    const state = useChatStore.getState();
    expect(state.messages.length).toBe(3);
    
    // Check user message
    expect(state.messages[0]).toEqual({
      kind: 'user',
      id: expect.any(String),
      text: 'Xin chào',
      timestamp: 1000,
    });

    // Check assistant message
    expect(state.messages[1]).toEqual({
      kind: 'assistant',
      id: expect.any(String),
      characterId: null,
      characterName: 'Lý Bạch',
      text: '你好',
      translation: 'Chào bạn',
      emotion: 'vui vẻ',
      intensity: 'vừa phải',
      timestamp: 2000,
    });

    // Check persistent_ooc message
    expect(state.messages[2]).toEqual({
      kind: 'persistent_ooc',
      id: expect.any(String),
      text: 'Hai người ở quán rượu',
      timestamp: 3000,
    });

    expect(state.persistentOOC).toBe('Hai người ở quán rượu');
    expect(state.activeCharacters).toEqual(['char-1']);
  });

  it('nên thực hiện optimistic update khi sendMessage và lưu tin nhắn từ server thành công', async () => {
    useChatStore.setState({ sessionId: 'session-123', messages: [] });
    
    const mockBatch = {
      messages: [
        {
          id: 'assistant-msg-1',
          characterId: 'char-1',
          characterName: 'Lý Bạch',
          text: '你好!',
          translation: 'Chào bạn!',
          emotion: 'hào hứng',
          intensity: 'mạnh',
          words: [{ hz: '你', py: 'nǐ', vn: 'bạn' }],
          shopEvent: null,
          timestamp: 2000,
        },
      ],
      triggerMemory: false,
    };

    let sendPromise: Promise<void> | null = null;
    (chatService.sendMessage as jest.Mock).mockImplementation(() => {
      // Khi đang gọi API, kiểm tra xem optimistic update đã thêm tin nhắn user vào store chưa và input có bị khóa không
      const stateDuringApiCall = useChatStore.getState();
      expect(stateDuringApiCall.messages.length).toBe(2); // 1 user + 1 ephemeral_ooc
      expect(stateDuringApiCall.messages[0]?.kind).toBe('user');
      expect(stateDuringApiCall.messages[0]?.text).toBe('Chào');
      expect(stateDuringApiCall.messages[1]?.kind).toBe('ephemeral_ooc');
      expect(stateDuringApiCall.messages[1]?.text).toBe('Đang cười');
      expect(stateDuringApiCall.inputLocked).toBe(true);

      return Promise.resolve(mockBatch);
    });

    sendPromise = useChatStore.getState().sendMessage('Chào', 'Đang cười');
    await sendPromise;

    const finalState = useChatStore.getState();
    expect(finalState.inputLocked).toBe(false);
    expect(finalState.messages.length).toBe(3); // user + ephemeral_ooc + assistant
    expect(finalState.messages[2]).toEqual({
      kind: 'assistant',
      id: 'assistant-msg-1',
      characterId: 'char-1',
      characterName: 'Lý Bạch',
      text: '你好!',
      translation: 'Chào bạn!',
      emotion: 'hào hứng',
      intensity: 'mạnh',
      words: [{ hz: '你', py: 'nǐ', vn: 'bạn' }],
      shopEvent: null,
      timestamp: 2000,
    });
  });

  it('nên setPersistentOOC và thêm optimistic bubble bối cảnh mới', async () => {
    useChatStore.setState({ sessionId: 'session-123', messages: [] });
    (chatService.setOoc as jest.Mock).mockResolvedValue({ status: 'ok' });

    await useChatStore.getState().setPersistentOOC('Trời đổ mưa to');

    const state = useChatStore.getState();
    expect(state.persistentOOC).toBe('Trời đổ mưa to');
    expect(state.messages.length).toBe(1);
    expect(state.messages[0]?.kind).toBe('persistent_ooc');
    expect(state.messages[0]?.text).toBe('Trời đổ mưa to');
    expect(chatService.setOoc).toHaveBeenCalledWith('session-123', 'persistent', 'Trời đổ mưa to');
  });

  it('nên toggleCharacter hoạt động và cập nhật activeCharacters tương ứng', async () => {
    useChatStore.setState({ sessionId: 'session-123', activeCharacters: ['char-1'] });
    (chatService.toggleCharacter as jest.Mock).mockResolvedValue({ status: 'ok' });

    // Bật thêm char-2
    await useChatStore.getState().toggleCharacter('char-2', true);
    expect(useChatStore.getState().activeCharacters).toEqual(['char-1', 'char-2']);

    // Tắt char-1
    await useChatStore.getState().toggleCharacter('char-1', false);
    expect(useChatStore.getState().activeCharacters).toEqual(['char-2']);
  });

  it('nên loadStoryCharacters thành công và cập nhật charactersFull', async () => {
    const mockChars = [
      { id: 'char-1', name: 'Lý Bạch', storyId: 'story-123', age: 30, personality: 'Hào sảng', avatarUrl: null, voiceName: 'Charon' as const, pitch: 1.0, createdAt: '' },
    ];
    useChatStore.setState({ storyId: 'story-123' });
    (characterApi.listByStory as jest.Mock).mockResolvedValue(mockChars);

    await useChatStore.getState().loadStoryCharacters();

    const state = useChatStore.getState();
    expect(state.charactersFull).toEqual(mockChars);
    expect(characterApi.listByStory).toHaveBeenCalledWith('story-123');
  });

  it('nên addTempCharacter thành công, cập nhật temporaryCharacters và append tin nhắn system', async () => {
    useChatStore.setState({ sessionId: 'session-123', temporaryCharacters: [] });
    (chatService.addTempCharacter as jest.Mock).mockResolvedValue({ tempId: 'temp-char-1' });

    const tempId = await useChatStore.getState().addTempCharacter('A Phàm', 'Bán trà đá');

    expect(tempId).toBe('temp-char-1');
    const state = useChatStore.getState();
    expect(state.temporaryCharacters).toEqual([
      { tempId: 'temp-char-1', name: 'A Phàm', description: 'Bán trà đá' },
    ]);
    expect(state.messages.length).toBe(1);
    expect(state.messages[0]?.kind).toBe('system');
    expect(state.messages[0]?.text).toContain('A Phàm');
  });

  it('nên pushEphemeralOOC và append ephemeral_ooc bubble cục bộ', async () => {
    useChatStore.setState({ sessionId: 'session-123', messages: [] });
    (chatService.setOoc as jest.Mock).mockResolvedValue({ status: 'ok' });

    await useChatStore.getState().pushEphemeralOOC('Trời đang mưa to');

    const state = useChatStore.getState();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0]?.kind).toBe('ephemeral_ooc');
    expect(state.messages[0]?.text).toBe('Trời đang mưa to');
    expect(chatService.setOoc).toHaveBeenCalledWith('session-123', 'ephemeral', 'Trời đang mưa to');
  });

  it('nên setInputLocked cập nhật trạng thái inputLocked chính xác', () => {
    useChatStore.getState().setInputLocked(true);
    expect(useChatStore.getState().inputLocked).toBe(true);

    useChatStore.getState().setInputLocked(false);
    expect(useChatStore.getState().inputLocked).toBe(false);
  });

  it('nên appendAssistantBubble thêm tin nhắn assistant vào mảng messages', () => {
    useChatStore.setState({ messages: [] });
    const mockMsg = { kind: 'assistant' as const, id: 'msg-1', characterName: 'Lý Bạch', text: '你好', timestamp: 123 };
    
    useChatStore.getState().appendAssistantBubble(mockMsg);
    
    expect(useChatStore.getState().messages).toEqual([mockMsg]);
  });

  it('nên gọi PlaybackQueueManager.enqueueBatch khi enqueueAssistantBatch và có manager', () => {
    const mockManager = {
      enqueueBatch: jest.fn(),
    };
    setPlaybackManagerSingleton(mockManager as any);

    const mockMsgs = [{ kind: 'assistant' as const, id: 'msg-1', characterName: 'Lý Bạch', text: '你好', timestamp: 123 }];
    useChatStore.getState().enqueueAssistantBatch(mockMsgs);

    expect(mockManager.enqueueBatch).toHaveBeenCalledWith(mockMsgs);

    // Dọn dẹp
    setPlaybackManagerSingleton(null);
  });
});
