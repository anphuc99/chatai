import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HistoryStoreService } from './history-store.service';
import { HistoryEntry } from '../types/history-entry';
import { AppException } from '../../../shared/errors/app-exception';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('HistoryStoreService', () => {
  let service: HistoryStoreService;
  const testCachePath = path.join(__dirname, '../../../../../../data/test-chat-cache');

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'historyStoreBasePath') {
        return testCachePath;
      }
      return null;
    }),
  };

  beforeAll(async () => {
    try {
      await fs.rm(testCachePath, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryStoreService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<HistoryStoreService>(HistoryStoreService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    try {
      await fs.rm(testCachePath, { recursive: true, force: true });
    } catch {}
  });

  afterAll(async () => {
    try {
      await fs.rm(testCachePath, { recursive: true, force: true });
    } catch {}
  });

  const getDummyUserEntry = (text: string): HistoryEntry => ({
    type: 'user',
    timestamp: Date.now(),
    data: { text },
  });

  const getDummyCheckpointEntry = (summary: string): HistoryEntry => ({
    type: 'checkpoint',
    timestamp: Date.now(),
    data: { summary, tokensBefore: 100, entriesCovered: 5 },
  });

  const getDummyAssistantEntry = (text: string, translation?: string): HistoryEntry => ({
    type: 'assistant_batch',
    timestamp: Date.now(),
    data: {
      messages: [
        {
          characterName: 'Mimi',
          text,
          translation,
        },
      ],
    },
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('exists should return false if file does not exist', async () => {
    const sid = '12345678-1234-1234-1234-123456789abc';
    const result = await service.exists(sid);
    expect(result).toBe(false);
  });

  it('should append and readAll entries in correct order', async () => {
    const sid = '12345678-1234-1234-1234-123456789012';
    const entries: HistoryEntry[] = [
      getDummyUserEntry('Xin chào Mimi!'),
      getDummyAssistantEntry('Chào bạn!', 'Hello there!'),
      getDummyUserEntry('Bạn khoẻ không?'),
    ];

    for (const entry of entries) {
      await service.append(sid, entry);
    }

    const hasFile = await service.exists(sid);
    expect(hasFile).toBe(true);

    const result = await service.readAll(sid);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('user');
    expect((result[0] as any).data.text).toBe('Xin chào Mimi!');
    expect(result[1]!.type).toBe('assistant_batch');
    expect((result[1] as any).data.messages[0].translation).toBe('Hello there!');
    expect(result[2]!.type).toBe('user');
    expect((result[2] as any).data.text).toBe('Bạn khoẻ không?');
  });

  it('should readSinceLastCheckpoint correctly', async () => {
    const sid = '87654321-4321-4321-4321-210987654321';
    const e1 = getDummyUserEntry('User 1');
    const e2 = getDummyAssistantEntry('Assistant 1');
    const eCheckpoint = getDummyCheckpointEntry('Tóm tắt checkpoint');
    const e3 = getDummyUserEntry('User 2');
    const e4 = getDummyAssistantEntry('Assistant 2');

    await service.append(sid, e1);
    await service.append(sid, e2);
    await service.append(sid, eCheckpoint);
    await service.append(sid, e3);
    await service.append(sid, e4);

    const result = await service.readSinceLastCheckpoint(sid);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('checkpoint');
    expect((result[0] as any).data.summary).toBe('Tóm tắt checkpoint');
    expect(result[1]!.type).toBe('user');
    expect((result[1] as any).data.text).toBe('User 2');
    expect(result[2]!.type).toBe('assistant_batch');
    expect((result[2] as any).data.messages[0].text).toBe('Assistant 2');
  });

  it('should return all if readSinceLastCheckpoint has no checkpoint', async () => {
    const sid = '11111111-2222-3333-4444-555555555555';
    const e1 = getDummyUserEntry('User 1');
    const e2 = getDummyAssistantEntry('Assistant 1');

    await service.append(sid, e1);
    await service.append(sid, e2);

    const result = await service.readSinceLastCheckpoint(sid);
    expect(result).toHaveLength(2);
  });

  it('should compute estimateTokens correctly', async () => {
    const sid = 'aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    // format UUID correct
    const validSid = 'abcdefab-abcd-abcd-abcd-abcdefabcdef';
    
    // User entry: "Hello" (length 5) -> zhEstimate = 2.5
    // with ephemeralOOC: "World" (length 5) -> zhEstimate = 2.5
    // Total User = 5
    const userEntry: HistoryEntry = {
      type: 'user',
      timestamp: Date.now(),
      data: { text: 'Hello', ephemeralOOC: 'World' }
    };

    // Assistant entry: Mimi "Hi" (length 2, zhEstimate = 1) & trans "Vi" (length 2, zhEstimate = 1) -> Total msg = 2
    const assistantEntry: HistoryEntry = {
      type: 'assistant_batch',
      timestamp: Date.now(),
      data: {
        messages: [
          { characterName: 'Mimi', text: 'Hi', translation: 'Vi' }
        ]
      }
    };

    // Persistent OOC: "Test" (length 4, zhEstimate = 2)
    const oocEntry: HistoryEntry = {
      type: 'persistent_ooc',
      timestamp: Date.now(),
      data: { text: 'Test' }
    };

    await service.append(validSid, userEntry);
    await service.append(validSid, assistantEntry);
    await service.append(validSid, oocEntry);

    const tokens = await service.estimateTokens(validSid);
    // Expected: 2.5 (Hello) + 2.5 (World) + 1 (Hi) + 1 (Vi) + 2 (Test) = 9 tokens
    expect(tokens).toBe(9);
  });

  it('should cleanup history and locks successfully', async () => {
    const sid = 'abcdef12-abcd-abcd-abcd-abcdef123456';
    await service.append(sid, getDummyUserEntry('Bắt đầu'));
    expect(await service.exists(sid)).toBe(true);

    await service.cleanup(sid);
    expect(await service.exists(sid)).toBe(false);
  });

  it('should sequentialize concurrent appends using mutex lock', async () => {
    const sid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const totalAppends = 15;

    // Trigger concurrent appends
    const promises = Array.from({ length: totalAppends }).map((_, i) =>
      service.append(sid, getDummyUserEntry(`Dòng thứ ${i + 1}`))
    );

    await Promise.all(promises);

    const result = await service.readAll(sid);
    expect(result).toHaveLength(totalAppends);
    
    // Check that we can read them all back, even if they were requested in parallel
    for (let i = 0; i < totalAppends; i++) {
      expect((result[i] as any).data.text).toContain('Dòng thứ');
    }
  });

  it('should throw an AppException if session ID is not a UUID', async () => {
    const invalidSid = 'invalid-session-id';
    const entry = getDummyUserEntry('test');

    await expect(service.append(invalidSid, entry)).rejects.toThrow(AppException);
    await expect(service.readAll(invalidSid)).rejects.toThrow(AppException);
  });

  it('should throw AppException if file is corrupted', async () => {
    const sid = 'badbadba-dbad-badb-adba-dbadbadbadba';
    const filePath = path.join(testCachePath, `${sid}.jsonl`);

    // Ghi dữ liệu lỗi (không phải json hợp lệ) trực tiếp vào file
    await fs.writeFile(filePath, 'invalid json content\n', 'utf8');

    await expect(service.readAll(sid)).rejects.toThrow(AppException);
  });
});
