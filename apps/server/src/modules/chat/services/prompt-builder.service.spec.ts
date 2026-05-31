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
      expect(messages[3]!.content).toBe('## TÓM TẮT TRƯỚC ĐÓ\nHai người chào hỏi nhau');

      expect(messages[4]!.role).toBe('user');
      expect(messages[4]!.content).toBe('Tiếp tục đi');
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
