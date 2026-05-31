import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { PromptContext } from '../types/prompt-context';
import { HistoryEntry } from '../types/history-entry';
import { CharacterDto, HskLevel, NarratorLanguage } from '@chatai/shared-types';
import { TempCharacter } from '../types/temp-character';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptBuilderService],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
    // Gọi onModuleInit một cách thủ công để load template
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildSystemPrompt', () => {
    const defaultCtx: PromptContext = {
      story: {
        title: 'Chuyến Đi Bắc Kinh',
        initialSetting: 'Ga tàu điện ngầm lúc 8h sáng',
        currentProgress: 'Người dùng vừa gặp Mimi',
      },
      activeCharacters: [],
      temporaryCharacters: [],
      hskLevel: 'HSK1',
      narratorLanguage: 'vi',
    };

    it('buildSystemPrompt should contain story title and setting', () => {
      const prompt = service.buildSystemPrompt(defaultCtx);
      expect(prompt).toContain('Chuyến Đi Bắc Kinh');
      expect(prompt).toContain('Ga tàu điện ngầm lúc 8h sáng');
      expect(prompt).toContain('Người dùng vừa gặp Mimi');
    });

    it('buildSystemPrompt should render 0 char block warning', () => {
      const prompt = service.buildSystemPrompt(defaultCtx);
      expect(prompt).toContain('Chưa có nhân vật active. Chỉ Narrator nói chuyện.');
    });

    it('buildSystemPrompt should render active characters details', () => {
      const characters: CharacterDto[] = [
        {
          id: 'char1',
          storyId: 'story1',
          name: 'Mimi',
          age: 18,
          personality: 'Vui vẻ, hoạt bát',
          avatarUrl: null,
          voiceName: 'Kore',
          pitch: 1.0,
          createdAt: new Date().toISOString(),
        },
      ];
      const ctx: PromptContext = {
        ...defaultCtx,
        activeCharacters: characters,
      };
      const prompt = service.buildSystemPrompt(ctx);
      expect(prompt).toContain('Tên: Mimi, Tuổi: 18');
      expect(prompt).toContain('Tính cách: Vui vẻ, hoạt bát');
      expect(prompt).not.toContain('Chưa có nhân vật active');
    });

    it('buildSystemPrompt should render temporary characters details', () => {
      const temps: TempCharacter[] = [
        {
          tempId: 'temp1',
          name: 'Bác bán nước',
          description: 'Thân thiện, hay cười',
          createdAt: Date.now(),
        },
      ];
      const ctx: PromptContext = {
        ...defaultCtx,
        temporaryCharacters: temps,
      };
      const prompt = service.buildSystemPrompt(ctx);
      expect(prompt).toContain('Bác bán nước — Thân thiện, hay cười');
    });

    it('applyPlaceholders should replace all double-bracket tags', () => {
      const prompt = service.buildSystemPrompt(defaultCtx);
      // Kiểm tra xem còn ngoặc nhọn {{ }} nào chưa thay thế không
      // Ngoại trừ biểu diễn JSON trong schema ví dụ (nhưng ví dụ schema của chúng ta không có placeholder)
      const matches = prompt.match(/\{\{[A-Z_]+\}\}/g);
      expect(matches).toBeNull();
    });
  });

  describe('buildLlmMessages', () => {
    const systemPrompt = 'Đây là system prompt mẫu.';

    it('buildLlmMessages should inject persistentOOC in system message', () => {
      const messages = service.buildLlmMessages(
        systemPrompt,
        [],
        'Chào bạn',
        'Bối cảnh cố định: Trời đang mưa',
        []
      );

      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toContain('Đây là system prompt mẫu.');
      expect(messages[0]!.content).toContain('## BỐI CẢNH CỐ ĐỊNH');
      expect(messages[0]!.content).toContain('Bối cảnh cố định: Trời đang mưa');
    });

    it('buildLlmMessages should inject memoryContext in system message', () => {
      const messages = service.buildLlmMessages(
        systemPrompt,
        [],
        'Chào bạn',
        null,
        [],
        'Ký ức: Mimi thích uống trà sữa.'
      );

      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toContain('## KÝ ỨC LIÊN QUAN');
      expect(messages[0]!.content).toContain('Mimi thích uống trà sữa.');
    });

    it('buildLlmMessages should prepend ephemeralOOCs into the last user message', () => {
      const messages = service.buildLlmMessages(
        systemPrompt,
        [],
        'Đi thôi!',
        null,
        ['Hành động nhanh', 'Không nói nhiều']
      );

      expect(messages).toHaveLength(2);
      expect(messages[1]!.role).toBe('user');
      expect(messages[1]!.content).toBe('[OOC: Hành động nhanh; Không nói nhiều]\nĐi thôi!');
    });

    it('buildLlmMessages should process history entries correctly', () => {
      const history: HistoryEntry[] = [
        {
          type: 'user',
          timestamp: 1000,
          data: { text: 'Hello', ephemeralOOC: 'Cười tươi' },
        },
        {
          type: 'assistant_batch',
          timestamp: 2000,
          data: {
            messages: [
              {
                characterName: 'Mimi',
                text: '你好',
                emotion: 'Happy',
                intensity: 'medium',
                translation: 'Chào bạn',
              },
            ],
            triggerMemory: true,
          },
        },
        {
          type: 'checkpoint',
          timestamp: 3000,
          data: { summary: 'Hai người chào hỏi nhau', tokensBefore: 10, entriesCovered: 2 },
        },
        {
          type: 'system',
          timestamp: 4000,
          data: { storyId: 's1', activeCharacters: ['Mimi'] },
        },
      ];

      const messages = service.buildLlmMessages(
        systemPrompt,
        history,
        'Tiếp tục đi',
        null,
        []
      );

      // System message ở đầu (1) + user 'Hello' (2) + assistant '你好' (3) + checkpoint (4) + current user (5)
      // entry 'system' bị skip.
      expect(messages).toHaveLength(5);

      expect(messages[1]!.role).toBe('user');
      expect(messages[1]!.content).toBe('[OOC: Cười tươi]\nHello');

      expect(messages[2]!.role).toBe('assistant');
      const batchData = JSON.parse(messages[2]!.content);
      expect(batchData.triggerMemory).toBe(true);
      expect(batchData.content[0].characterName).toBe('Mimi');

      expect(messages[3]!.role).toBe('system');
      expect(messages[3]!.content).toBe('## TÓM TẮT TRƯỚC ĐÓ (PHỤ)\nHai người chào hỏi nhau');

      expect(messages[4]!.role).toBe('user');
      expect(messages[4]!.content).toBe('Tiếp tục đi');
    });

    it('buildLlmMessages should extract first checkpoint as main summary and shift history', () => {
      const history: HistoryEntry[] = [
        {
          type: 'checkpoint',
          timestamp: 1000,
          data: { summary: 'Tóm tắt cốt truyện cũ', tokensBefore: 100, entriesCovered: 10 },
        },
        {
          type: 'user',
          timestamp: 2000,
          data: { text: 'Hello' },
        },
        {
          type: 'assistant_batch',
          timestamp: 3000,
          data: {
            messages: [{ characterName: 'Mimi', text: 'Chào anh!' }],
          },
        },
      ];

      const messages = service.buildLlmMessages(
        systemPrompt,
        history,
        'Tin nhắn mới',
        null,
        []
      );

      // System ban đầu (1) + checkpoint đầu (2) + user (3) + assistant (4) + final user (5)
      expect(messages).toHaveLength(5);
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toContain('Đây là system prompt mẫu.');

      expect(messages[1]!.role).toBe('system');
      expect(messages[1]!.content).toBe('## TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ\nTóm tắt cốt truyện cũ');

      expect(messages[2]!.role).toBe('user');
      expect(messages[2]!.content).toBe('Hello');

      expect(messages[4]!.role).toBe('user');
      expect(messages[4]!.content).toBe('Tin nhắn mới');
    });

    it('buildLlmMessages should order messages correctly: combined system -> main checkpoint summary -> history -> final user message', () => {
      const history: HistoryEntry[] = [
        {
          type: 'checkpoint',
          timestamp: 1000,
          data: { summary: 'Checkpoint chính', tokensBefore: 100, entriesCovered: 5 },
        },
        {
          type: 'user',
          timestamp: 2000,
          data: { text: 'Nội dung history' },
        },
      ];

      const messages = service.buildLlmMessages(
        systemPrompt,
        history,
        'Nội dung hiện tại',
        'Bối cảnh OOC cố định',
        ['OOC tạm thời'],
        'Ký ức cũ'
      );

      expect(messages).toHaveLength(4);

      // 1. Combined System Message
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toContain('Đây là system prompt mẫu.');
      expect(messages[0]!.content).toContain('## BỐI CẢNH CỐ ĐỊNH\nBối cảnh OOC cố định');
      expect(messages[0]!.content).toContain('## KÝ ỨC LIÊN QUAN\nKý ức cũ');

      // 2. Checkpoint Summary
      expect(messages[1]!.role).toBe('system');
      expect(messages[1]!.content).toBe('## TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ\nCheckpoint chính');

      // 3. History
      expect(messages[2]!.role).toBe('user');
      expect(messages[2]!.content).toBe('Nội dung history');

      // 4. Final User Message with Ephemeral OOC
      expect(messages[3]!.role).toBe('user');
      expect(messages[3]!.content).toBe('[OOC: OOC tạm thời]\nNội dung hiện tại');
    });

    it('buildLlmMessages should handle history with no checkpoint properly', () => {
      const history: HistoryEntry[] = [
        {
          type: 'user',
          timestamp: 1000,
          data: { text: 'Nội dung history' },
        },
      ];

      const messages = service.buildLlmMessages(
        systemPrompt,
        history,
        'Nội dung hiện tại',
        null,
        []
      );

      // 1 (system) + 1 (history) + 1 (final user) = 3
      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).not.toContain('TÓM TẮT');
      expect(messages[1]!.content).toBe('Nội dung history');
    });

    it('should process a long history of 100 entries without errors', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 50; i++) {
        history.push({
          type: 'user',
          timestamp: Date.now() + i * 2,
          data: { text: `User message ${i}` },
        });
        history.push({
          type: 'assistant_batch',
          timestamp: Date.now() + i * 2 + 1,
          data: {
            messages: [
              {
                characterName: 'Mimi',
                text: `Response ${i}`,
              },
            ],
          },
        });
      }

      const messages = service.buildLlmMessages(
        systemPrompt,
        history,
        'Latest message',
        'Persistent OOC',
        []
      );

      // 1 (system) + 100 (history) + 1 (latest) = 102
      expect(messages).toHaveLength(102);
      expect(messages[101]!.role).toBe('user');
      expect(messages[101]!.content).toBe('Latest message');
    });
  });
});
