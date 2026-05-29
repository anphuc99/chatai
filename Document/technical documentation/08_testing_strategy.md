# 08 — Testing Strategy

> Chiến lược test phù hợp cho **solo developer**. Tập trung vào **critical paths**, tránh over-test code đơn giản.  
> Mục tiêu: 70% coverage trên service layer, ≥1 integration test per module, e2e cho 3 critical flows.

---

## 1. Test Pyramid

```mermaid
graph TB
    subgraph E2E["🔺 E2E Tests (ít nhất, chậm nhất)"]
        e1[Full chat flow: send → receive → playback]
        e2[End chat → Journal created]
        e3[Auth → create story → start chat]
    end

    subgraph INT["🔶 Integration Tests (trung bình)"]
        i1[ChatOrchestrator + mock LLM]
        i2[HistoryStore .jsonl real file]
        i3[VocabularyService + real Postgres]
        i4[TtsService + mock GPT-SoVITS]
        i5[MemoryService + mock ChromaDB]
        i6[MissionTracker + EventEmitter]
    end

    subgraph UNIT["🟢 Unit Tests (nhiều nhất, nhanh nhất)"]
        u1[PromptBuilder]
        u2[SRSScheduler]
        u3[OocService logic]
        u4[CacheHashService]
        u5[Token counter]
        u6[DTO validation - Zod schemas]
        u7[PlaybackQueueManager state]
    end

    E2E --> INT --> UNIT
```

**Tỉ lệ mục tiêu:** ~60% Unit, ~30% Integration, ~10% E2E

---

## 2. Công cụ & Framework

| Layer | Tool | Lý do |
|-------|------|-------|
| Unit + Integration (Server) | **Jest** + `@nestjs/testing` | NestJS native support |
| E2E (Server) | **Supertest** + Jest | HTTP endpoint testing |
| Unit (Mobile) | **Jest** + React Native Testing Library | Component + hook testing |
| E2E (Mobile) | **Detox** (hoặc Maestro) | UI automation |
| Mocking | **jest.mock** + custom fixtures | |
| DB Test | **Testcontainers** hoặc in-memory Postgres | Isolated DB per test suite |
| Coverage | **Jest --coverage** | Istanbul reporter |

---

## 3. Mock Strategy

### 3.1. External Service Mocks

| Service | Mock Strategy | Implementation |
|---------|--------------|----------------|
| **Ollama (LLM)** | Fixture JSON responses | `__mocks__/ollama.service.ts` trả pre-built AssistantBatch |
| **GPT-SoVITS** | Return fake audio URL | `__mocks__/gpt-sovits.client.ts` trả `https://fake.url/audio.wav` |
| **ChromaDB** | In-memory array + filter | `__mocks__/chroma.client.ts` simulate similarity search |
| **Firebase Auth** | Mock `verifyIdToken` | Return decoded token fixture |
| **Firebase Storage** | Mock upload/getSignedUrl | Return fake URLs |
| **Redis** | **ioredis-mock** | In-memory Redis compatible |

### 3.2. LLM Mock Fixtures

```typescript
// apps/server/test/fixtures/llm-responses.ts
export const VALID_ASSISTANT_BATCH = {
  content: [
    {
      characterName: "Narrator",
      text: "Mimi nhìn anh trai với ánh mắt ngạc nhiên.",
      Emotion: "Surprised",
      Intensity: "medium",
      translation: null,
      words: null,
      shopEvent: null,
    },
    {
      characterName: "Mimi",
      text: "你怎么来了？",
      Emotion: "Surprised",
      Intensity: "medium",
      translation: "Sao anh lại đến đây?",
      words: [
        { hz: "你", py: "nǐ", vn: "anh" },
        { hz: "怎么", py: "zěnme", vn: "sao" },
        { hz: "来", py: "lái", vn: "đến" },
        { hz: "了", py: "le", vn: "(trợ từ)" },
      ],
      shopEvent: null,
    },
  ],
};

export const MALFORMED_JSON_RESPONSE = '{"content": [{"characterName": "Mimi", "text": "incomplete...';

export const SHOP_EVENT_RESPONSE = {
  content: [
    {
      characterName: "Narrator",
      text: "Mimi chỉ tay vào chiếc váy hồng trên kệ.",
      Emotion: "Neutral",
      Intensity: "low",
      shopEvent: { itemName: "Váy hồng", price: 15 },
    },
  ],
};
```

### 3.3. Test Database

```typescript
// apps/server/test/setup/test-database.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container;

beforeAll(async () => {
  // Option A: Testcontainers (isolated, slower startup)
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('chatai_test')
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();

  // Run migrations
  execSync('npx prisma migrate deploy', { env: process.env });
});

afterAll(async () => {
  await container?.stop();
});

// Option B: Shared test DB (faster, less isolated)
// Dùng transaction rollback per test
beforeEach(async () => {
  await prisma.$executeRaw`BEGIN`;
});
afterEach(async () => {
  await prisma.$executeRaw`ROLLBACK`;
});
```

---

## 4. Unit Tests — Chi tiết

### 4.1. PromptBuilder

```typescript
describe('PromptBuilder', () => {
  it('should include all active characters in system prompt', () => {
    const prompt = builder.buildSystemPrompt(story, [charMimi, charBrother]);
    expect(prompt).toContain('Mimi');
    expect(prompt).toContain('Anh trai');
  });

  it('should inject HSK level constraint', () => {
    const prompt = builder.buildSystemPrompt(story, chars, { hskLevel: 'HSK2' });
    expect(prompt).toContain('HSK2');
  });

  it('should include persistent OOC in user prompt', () => {
    const prompt = builder.renderUserPrompt({
      text: '你好',
      persistentOOC: 'Đang ở trong quán cafe',
      ephemeralOOC: '',
    });
    expect(prompt).toContain('Đang ở trong quán cafe');
  });

  it('should include temporary characters', () => {
    const prompt = builder.renderUserPrompt({
      text: 'test',
      temporaryCharacters: [{ name: 'Bà già', description: 'Bà bán hàng ở chợ' }],
    });
    expect(prompt).toContain('Bà già');
  });
});
```

### 4.2. SRSScheduler

```typescript
describe('SRSScheduler', () => {
  const SRS_SCHEDULE = [1,1,1,1,1,2,1,1,4,1,1,8,1,1,20,1,1,1,60,1,1,1,150,1,1,1];

  it('should return next review date based on step_index', () => {
    const result = scheduler.getNextReviewDate(0, new Date('2026-01-01'));
    expect(result).toEqual(new Date('2026-01-02')); // +1 day
  });

  it('should mark mastered when step_index reaches end', () => {
    const result = scheduler.advance(25); // last index
    expect(result.status).toBe('mastered');
  });

  it('should handle step_index 14 (20 days gap)', () => {
    const result = scheduler.getNextReviewDate(14, new Date('2026-01-01'));
    expect(result).toEqual(new Date('2026-01-21'));
  });
});
```

### 4.3. CacheHashService

```typescript
describe('CacheHashService', () => {
  it('should generate consistent hash for same inputs', () => {
    const hash1 = service.computeHash('Kore', 'ref_001.wav', '你好');
    const hash2 = service.computeHash('Kore', 'ref_001.wav', '你好');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different ref_file', () => {
    const hash1 = service.computeHash('Kore', 'ref_001.wav', '你好');
    const hash2 = service.computeHash('Kore', 'ref_002.wav', '你好');
    expect(hash1).not.toBe(hash2);
  });
});
```

### 4.4. Zod Schema Validation

```typescript
describe('SendMessagePayload schema', () => {
  it('should reject empty userMessage', () => {
    const result = SendMessageSchema.safeParse({ userMessage: '' });
    expect(result.success).toBe(false);
  });

  it('should accept valid payload with ephemeral OOC', () => {
    const result = SendMessageSchema.safeParse({
      userMessage: '你好',
      ephemeralOOC: 'Đang mưa',
    });
    expect(result.success).toBe(true);
  });

  it('should reject temporary character without name', () => {
    const result = SendMessageSchema.safeParse({
      userMessage: 'test',
      temporaryCharacters: [{ description: 'no name' }],
    });
    expect(result.success).toBe(false);
  });
});
```

---

## 5. Integration Tests — Chi tiết

### 5.1. ChatOrchestrator (Mock LLM, real logic)

```typescript
describe('ChatOrchestrator Integration', () => {
  let orchestrator: ChatOrchestrator;
  let mockLlm: jest.Mocked<LlmService>;

  beforeEach(() => {
    mockLlm = createMockLlmService();
    mockLlm.chatJson.mockResolvedValue(VALID_ASSISTANT_BATCH);
    orchestrator = new ChatOrchestrator(
      new HistoryStoreService(tempDir),
      new OocService(redisMock),
      mockMemoryService,
      mockLlm,
      new PromptBuilder(),
    );
  });

  it('should process user message and return valid batch', async () => {
    const result = await orchestrator.handleUserTurn(ctx, 'Hello');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].characterName).toBe('Narrator');
  });

  it('should retry on malformed JSON from LLM', async () => {
    mockLlm.chatJson
      .mockRejectedValueOnce(new Error('JSON parse fail'))
      .mockResolvedValueOnce(VALID_ASSISTANT_BATCH);
    
    const result = await orchestrator.handleUserTurn(ctx, 'test');
    expect(mockLlm.chatJson).toHaveBeenCalledTimes(2);
    expect(result.messages).toHaveLength(2);
  });

  it('should trigger checkpoint when tokens exceed threshold', async () => {
    // Simulate long history
    for (let i = 0; i < 50; i++) {
      await orchestrator.handleUserTurn(ctx, `message ${i}`);
    }
    // Verify checkpoint was written
    const history = await historyStore.readAll(sessionId);
    expect(history.some(e => e.role === 'checkpoint')).toBe(true);
  });
});
```

### 5.2. HistoryStore (.jsonl real file I/O)

```typescript
describe('HistoryStoreService', () => {
  let service: HistoryStoreService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync('/tmp/chatai-test-');
    service = new HistoryStoreService(tempDir);
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true }));

  it('should append and read entries', async () => {
    await service.append('session-1', { role: 'user', text: '你好', timestamp: Date.now() });
    await service.append('session-1', { role: 'assistant', content: [...], timestamp: Date.now() });
    
    const entries = await service.readAll('session-1');
    expect(entries).toHaveLength(2);
  });

  it('should readSince last checkpoint', async () => {
    await service.append('s1', { role: 'user', text: 'msg1' });
    await service.writeCheckpoint('s1', 'Summary of messages');
    await service.append('s1', { role: 'user', text: 'msg2' });
    
    const recent = await service.readSince('s1', true);
    expect(recent).toHaveLength(1); // only msg2
    expect(recent[0].text).toBe('msg2');
  });

  it('should handle concurrent appends safely', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      service.append('s1', { role: 'user', text: `msg${i}` })
    );
    await Promise.all(promises);
    const entries = await service.readAll('s1');
    expect(entries).toHaveLength(10);
  });
});
```

### 5.3. Mission Event Integration

```typescript
describe('MissionTracker', () => {
  it('should increment counter on USER_SENT_MESSAGE', async () => {
    eventEmitter.emit('USER_SENT_MESSAGE', { userId: 'u1', sessionId: 's1' });
    
    const mission = await missionRepo.findToday('u1', 'send_messages');
    expect(mission.progress).toBe(1);
  });

  it('should complete mission and award gems at target', async () => {
    for (let i = 0; i < 10; i++) {
      eventEmitter.emit('USER_SENT_MESSAGE', { userId: 'u1', sessionId: 's1' });
    }
    
    const mission = await missionRepo.findToday('u1', 'send_messages');
    expect(mission.status).toBe('completed');
  });
});
```

---

## 6. E2E Tests — Critical Flows

### 6.1. Full Chat Flow (Server-side E2E)

```typescript
describe('E2E: Chat Flow', () => {
  it('should complete full message lifecycle', async () => {
    // 1. Auth
    const token = await getTestFirebaseToken();
    
    // 2. Create story + character
    const story = await request(app)
      .post('/api/v1/stories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', initialSetting: 'Test setting' })
      .expect(201);
    
    // 3. Start session
    const session = await request(app)
      .post('/api/v1/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ storyId: story.body.id })
      .expect(201);
    
    // 4. Send message
    const response = await request(app)
      .post(`/api/v1/chat/sessions/${session.body.sessionId}/message`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ userMessage: '你好' })
      .expect(200);
    
    expect(response.body.messages).toBeDefined();
    expect(response.body.messages.length).toBeGreaterThan(0);
    
    // 5. Verify history persisted
    const history = await request(app)
      .get(`/api/v1/chat/sessions/${session.body.sessionId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(history.body.messages.length).toBeGreaterThanOrEqual(2);
  });
});
```

### 6.2. End Chat → Journal

```typescript
describe('E2E: End Chat', () => {
  it('should create journal entry and cleanup', async () => {
    // Setup: create session with some messages
    // ...
    
    // End chat
    const result = await request(app)
      .post(`/api/v1/chat/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    
    expect(result.body.journalSessionId).toBeDefined();
    expect(result.body.summary).toBeTruthy();
    
    // Verify journal exists
    const journal = await request(app)
      .get(`/api/v1/journal/sessions/${result.body.journalSessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(journal.body.messages.length).toBeGreaterThan(0);
    
    // Verify .jsonl cleaned up
    const filePath = path.join(JSONL_DIR, `history_${sessionId}.jsonl`);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
```

---

## 7. Mobile Testing

### 7.1. Unit Tests (Jest + Testing Library)

```typescript
describe('ChatStore', () => {
  it('should lock input after sendMessage', () => {
    const { result } = renderHook(() => useChatStore());
    act(() => result.current.sendMessage('test'));
    expect(result.current.inputLocked).toBe(true);
  });
});

describe('PlaybackQueueManager', () => {
  it('should play messages sequentially', async () => {
    const queue = new PlaybackQueueManager();
    const onPlay = jest.fn();
    queue.on('play', onPlay);
    
    queue.enqueueBatch([msg1, msg2, msg3]);
    await queue.playNext();
    
    expect(onPlay).toHaveBeenCalledWith(msg1);
  });
});
```

### 7.2. Detox E2E (Critical path only)

```typescript
describe('Login Flow', () => {
  it('should login with Google and see Home', async () => {
    await element(by.id('google-signin-btn')).tap();
    // Mock Google Sign-In returns test credential
    await waitFor(element(by.id('home-screen'))).toBeVisible().withTimeout(10000);
  });
});
```

---

## 8. Test Data Management

### 8.1. Seed Data cho Tests

```typescript
// apps/server/test/fixtures/seed.ts
export async function seedTestData(prisma: PrismaClient) {
  const user = await prisma.usersMeta.create({
    data: { uid: 'test-user-1', gems: 100, currentStreak: 5 },
  });
  
  const story = await prisma.stories.create({
    data: { userId: user.uid, title: 'Test Story', initialSetting: '...' },
  });
  
  const character = await prisma.characters.create({
    data: { storyId: story.id, name: 'Mimi', voiceName: 'Kore', pitch: 1.0 },
  });
  
  return { user, story, character };
}
```

### 8.2. Firebase Emulator cho Tests

```json
// firebase.json
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 }
  }
}
```

---

## 9. CI Test Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  server-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: chatai_test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter server prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/chatai_test
      - run: pnpm --filter server test --coverage
      - run: pnpm --filter server test:e2e
      - uses: codecov/codecov-action@v3

  mobile-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter mobile test --coverage
```

---

## 10. Coverage Targets

| Module | Target | Critical Methods |
|--------|--------|-----------------|
| `ChatOrchestrator` | 80% | handleUserTurn, handleAutoTurn, handleShopChoice |
| `HistoryStoreService` | 90% | append, readSince, writeCheckpoint, cleanup |
| `PromptBuilder` | 85% | buildSystemPrompt, renderUserPrompt |
| `LlmService` | 70% | chatJson (retry logic) |
| `TtsService` | 70% | process, computeHash |
| `MemoryService` | 75% | retrieveContext, writeChunk |
| `SRSScheduler` | 95% | Pure logic, dễ test |
| `MissionTracker` | 80% | Event handling |
| `EndChatService` | 80% | execute (orchestration) |
| Controllers | 50% | Chủ yếu delegation |

**Tổng target: ≥ 70% service layer, ≥ 50% controller, ≥ 1 e2e per critical flow**
