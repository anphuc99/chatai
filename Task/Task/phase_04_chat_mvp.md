# Phase 4 — Chat MVP (Core Logic, No Memory, No Checkpoint)

> **Mục tiêu**: User gửi message → AI trả JSON đa nhân vật → lưu `.jsonl`. OOC hoạt động. Toggle character hoạt động.  
> **Phụ thuộc**: Phase 2 (Story/Character), Phase 3 (TTS — optional, có thể skip audio ở phase này).

---

## P4.T1 — Database: Sessions + Messages Tables

**Status**: `[done]`  
**Depends on**: P3.T5 (Phase 3 hoàn thành)

**Mô tả chi tiết**:
1. Thêm models vào `prisma/schema.prisma`:
   ```prisma
   model Session {
     id        String   @id @default(uuid())
     userId    String   @map("user_id")
     storyId   String   @map("story_id")
     status    String   @default("active") // "active" | "ended"
     summary   String?  @db.Text
     startedAt BigInt   @map("started_at")
     endedAt   BigInt?  @map("ended_at")
     createdAt DateTime @default(now()) @map("created_at")

     user     UsersMeta @relation(fields: [userId], references: [uid])
     story    Story     @relation(fields: [storyId], references: [id], onDelete: Cascade)
     messages Message[]

     @@index([userId, storyId, status])
     @@map("sessions")
   }

   model Message {
     id            String  @id @default(uuid())
     sessionId     String  @map("session_id")
     characterId   String? @map("character_id")
     role          String  // "user" | "assistant" | "persistent_ooc" | "ephemeral_ooc"
     characterName String? @map("character_name")
     text          String  @db.Text
     translation   String? @db.Text
     emotion       String?
     intensity     String?
     words         Json?   // [{hz, py, vn}]
     shopEvent     Json?   @map("shop_event")
     turnOrder     Int     @map("turn_order")
     timestamp     BigInt

     session   Session    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
     character Character? @relation(fields: [characterId], references: [id], onDelete: SetNull)

     @@index([sessionId, turnOrder])
     @@map("messages")
   }
   ```
2. Thêm relations vào `UsersMeta` và `Story`.
3. Run `npx prisma migrate dev --name add_sessions_messages`.

**Output kiểm chứng**:
- Migration thành công.
- Prisma Studio: tạo session → tạo messages → index hoạt động.

---

## P4.T2 — Server: HistoryStoreService (.jsonl Adapter)

**Status**: `[done]`  
**Depends on**: P4.T1

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/history-store.service.ts`:
   ```typescript
   @Injectable()
   export class HistoryStoreService {
     private basePath: string; // từ config, e.g. './data/chat-cache/'

     // Append 1 entry vào file .jsonl của session
     async append(sessionId: string, entry: HistoryEntry): Promise<void>;

     // Đọc tất cả entries từ file (hoặc từ checkpoint cuối)
     async readAll(sessionId: string): Promise<HistoryEntry[]>;

     // Đọc từ checkpoint gần nhất (nếu có) đến cuối
     async readSinceLastCheckpoint(sessionId: string): Promise<HistoryEntry[]>;

     // Đếm ước lượng tokens (đơn giản: count chars / 2 cho tiếng Trung)
     async estimateTokens(sessionId: string): Promise<number>;

     // Xoá file sau khi End Chat commit xong
     async cleanup(sessionId: string): Promise<void>;

     // Kiểm tra file tồn tại (session đã có cache chưa)
     async exists(sessionId: string): Promise<boolean>;
   }
   ```
2. `HistoryEntry` type:
   ```typescript
   type HistoryEntry = {
     type: 'user' | 'assistant_batch' | 'persistent_ooc' | 'ephemeral_ooc' | 'checkpoint' | 'system';
     timestamp: number;
     data: any; // tuỳ type
   };
   ```
3. File format `.jsonl` — mỗi dòng là 1 JSON object:
   ```jsonl
   {"type":"system","timestamp":1730000000,"data":{"storyId":"...","activeCharacters":["Linh","Nam"]}}
   {"type":"user","timestamp":1730000001,"data":{"text":"我们去喝奶茶吧","ephemeralOOC":"hai bạn đang ở trên phố"}}
   {"type":"assistant_batch","timestamp":1730000002,"data":{"messages":[...]}}
   {"type":"persistent_ooc","timestamp":1730000003,"data":{"text":"bối cảnh: trời đang mưa"}}
   {"type":"checkpoint","timestamp":1730000100,"data":{"summary":"..."}}
   ```
4. Tạo thư mục `data/chat-cache/` (gitignored).
5. File operations:
   - `append`: `fs.appendFile(path, JSON.stringify(entry) + '\n')`.
   - `readAll`: `fs.readFile` → split lines → parse each.
   - `readSinceLastCheckpoint`: tìm dòng cuối có `type=checkpoint`, đọc từ đó.

**Output kiểm chứng**:
- Unit test: append 5 entries → readAll trả 5 → readSinceLastCheckpoint trả subset đúng.
- File trên disk là valid JSONL.

---

## P4.T3 — Server: OocService (Redis-backed)

**Status**: `[done]`  
**Depends on**: P4.T1, P0.T6

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/ooc.service.ts`:
   ```typescript
   @Injectable()
   export class OocService {
     constructor(private redis: RedisService) {}

     // === Persistent OOC ===
     // Key: ooc:persistent:{sessionId}
     async setPersistent(sessionId: string, text: string): Promise<void>;
     async getPersistent(sessionId: string): Promise<string | null>;
     async clearPersistent(sessionId: string): Promise<void>;

     // === Ephemeral OOC (queue, consumed once) ===
     // Key: ooc:ephemeral:{sessionId} (Redis List, RPUSH / LPOP all)
     async pushEphemeral(sessionId: string, text: string): Promise<void>;
     async pullAllEphemeral(sessionId: string): Promise<string[]>;  // consume & clear

     // === Active Characters ===
     // Key: ooc:active_chars:{sessionId} (Redis Set)
     async setActiveCharacters(sessionId: string, characterIds: string[]): Promise<void>;
     async addActive(sessionId: string, characterId: string): Promise<void>;
     async removeActive(sessionId: string, characterId: string): Promise<void>;
     async getActiveCharacters(sessionId: string): Promise<string[]>;

     // === Temporary Characters ===
     // Key: ooc:temp_chars:{sessionId} (Redis Hash)
     async addTemporary(sessionId: string, tempChar: TempCharacter): Promise<string>; // return tempId
     async getTemporaries(sessionId: string): Promise<TempCharacter[]>;

     // Cleanup toàn bộ khi end session
     async cleanupSession(sessionId: string): Promise<void>;
   }
   ```
2. Redis key design:
   - TTL cho tất cả keys: 24h (auto-expire nếu session bị abandon).
   - `cleanupSession`: DEL tất cả keys liên quan.
3. Ephemeral logic:
   - `pushEphemeral`: RPUSH vào list.
   - `pullAllEphemeral`: LRANGE 0 -1 rồi DEL key (atomic với Lua script hoặc pipeline).
4. Active Characters:
   - Init khi session bắt đầu: tất cả characters của story.
   - Toggle: SADD / SREM.

**Output kiểm chứng**:
- Unit test: set persistent → get → đúng.
- Push 3 ephemeral → pullAll → trả 3 → pullAll lần 2 → trả [].
- Active chars: add/remove/get correct.

---

## P4.T4 — Server: PromptBuilder Service

**Status**: `[done]`  
**Depends on**: P4.T3

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/prompt-builder.service.ts`:
   ```typescript
   @Injectable()
   export class PromptBuilderService {
     // Build System Prompt theo template packages/prompts/v1/system_chat.md
     buildSystemPrompt(ctx: PromptContext): string;

     // Build User Prompt (tin nhắn cuối + OOC context)
     buildUserPrompt(ctx: UserPromptContext): string;
   }
   ```
2. `PromptContext`:
   ```typescript
   interface PromptContext {
     story: { title, initialSetting, currentProgress };
     activeCharacters: CharacterDto[];
     temporaryCharacters: TempCharacter[];
     hskLevel: string;
     narratorLanguage: string;
   }
   ```
3. System Prompt template (load từ `packages/prompts/v1/system_chat.md`):
   - Replace placeholders: `{{CHARACTERS_BLOCK}}`, `{{STORY_TITLE}}`, `{{HSK_LEVEL}}`, etc.
   - `{{CHARACTERS_BLOCK}}`: Loop mỗi active character → format name, age, personality.
4. User Prompt construction:
   ```typescript
   interface UserPromptContext {
     userMessage: string;
     persistentOOC: string | null;
     ephemeralOOC: string[];
     memoryContext: string | null;  // Phase 8 sẽ inject, tạm null
     chatHistory: HistoryEntry[];   // từ .jsonl readSinceCheckpoint
   }
   ```
   - Format chat history thành messages array cho LLM:
     - `{ role: 'system', content: systemPrompt }`
     - Mỗi user entry → `{ role: 'user', content: ... }`
     - Mỗi assistant_batch → `{ role: 'assistant', content: JSON.stringify(...) }`
   - Inject OOC:
     - Persistent OOC: thêm vào cuối system prompt section "BỐI CẢNH CỐ ĐỊNH".
     - Ephemeral OOC: gắn cùng user message dưới dạng `[OOC: ...]`.
5. Tạo `packages/prompts/v1/system_chat.md` (copy từ doc `09_prompt_engineering_guide.md`).

**Output kiểm chứng**:
- Unit test: buildSystemPrompt với mock data → output chứa tên characters, story title, HSK level.
- buildUserPrompt với OOC → output chứa `[OOC: ...]`.

---

## P4.T5 — Server: LlmService (Ollama JSON Mode + Retry)

**Status**: `[done]`  
**Depends on**: P4.T4

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   pnpm add @langchain/community @langchain/core
   # hoặc gọi trực tiếp Ollama REST API
   ```
2. Tạo `src/modules/chat/services/llm.service.ts`:
   ```typescript
   @Injectable()
   export class LlmService {
     private ollamaUrl: string;  // từ config

     // Chat với JSON mode
     async chatJson(messages: LlmMessage[], schema: ZodSchema): Promise<any> {
       // 1. Gọi Ollama POST /api/chat
       //    body: { model: 'qwen2.5:14b', messages, format: 'json', stream: false }
       // 2. Parse response.message.content as JSON
       // 3. Validate với Zod schema
       // 4. Nếu parse fail hoặc validate fail → retry (max 2 lần)
       //    - Retry: thêm message "Previous response was invalid JSON. Fix:" + error detail
       // 5. Nếu vẫn fail sau 2 retry → throw LlmException
     }

     // Summarize (Small AI)
     async summarize(text: string, mode: 'plot' | 'session' | 'character'): Promise<string> {
       // Model: qwen2.5:3b
       // System prompt tuỳ mode
       // Không cần JSON mode, trả plain text
     }
   }
   ```
3. `LlmMessage` type:
   ```typescript
   interface LlmMessage {
     role: 'system' | 'user' | 'assistant';
     content: string;
   }
   ```
4. Zod schema cho AssistantBatch response:
   ```typescript
   const AssistantBatchSchema = z.object({
     content: z.array(z.object({
       characterName: z.string(),
       text: z.string(),
       Emotion: z.enum([...EMOTIONS]),
       Intensity: z.enum(['low','medium','high']),
       translation: z.string().nullable(),
       words: z.array(z.object({ hz: z.string(), py: z.string(), vn: z.string() })).nullable(),
       shopEvent: z.object({ itemName: z.string(), price: z.number() }).nullable()
     })),
     triggerMemory: z.boolean().optional()
   });
   ```
5. Error handling:
   - Ollama unreachable → `ServiceUnavailableException('LLM_UNAVAILABLE')`.
   - Timeout 60s.
   - Log mọi prompt + response (structured, redact nếu có PII).

**Output kiểm chứng**:
- Integration test (cần Ollama running): send prompt → nhận valid JSON → Zod pass.
- Unit test (mock HTTP): invalid JSON response → retry → cuối cùng throw exception.

---

## P4.T6 — Server: ChatOrchestrator (handleUserTurn)

**Status**: `[done]`  
**Depends on**: P4.T2, P4.T3, P4.T4, P4.T5

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/chat-orchestrator.service.ts`:
   ```typescript
   @Injectable()
   export class ChatOrchestratorService {
     constructor(
       private historyStore: HistoryStoreService,
       private oocService: OocService,
       private promptBuilder: PromptBuilderService,
       private llmService: LlmService,
       private prisma: PrismaService,
       // private memoryService: MemoryService, // Phase 8
     ) {}

     async handleUserTurn(ctx: ChatContext, userMessage: string, ephemeralOOC?: string): Promise<AssistantBatch> {
       // 1. Append user entry vào .jsonl
       await this.historyStore.append(ctx.sessionId, {
         type: 'user',
         timestamp: Date.now(),
         data: { text: userMessage, ephemeralOOC }
       });

       // 2. Lấy OOC contexts
       const persistentOOC = await this.oocService.getPersistent(ctx.sessionId);
       const ephemeralOOCs = await this.oocService.pullAllEphemeral(ctx.sessionId);
       if (ephemeralOOC) ephemeralOOCs.push(ephemeralOOC);

       // 3. Lấy active characters detail từ DB
       const activeCharIds = await this.oocService.getActiveCharacters(ctx.sessionId);
       const characters = await this.prisma.character.findMany({ where: { id: { in: activeCharIds } } });
       const tempChars = await this.oocService.getTemporaries(ctx.sessionId);

       // 4. Lấy story info
       const story = await this.prisma.story.findUnique({ where: { id: ctx.storyId } });

       // 5. Lấy user preferences (HSK, narrator language)
       const userMeta = await this.prisma.usersMeta.findUnique({ where: { uid: ctx.userId } });
       // (Firestore preferences - cần fetch hoặc cache)

       // 6. Build prompts
       const systemPrompt = this.promptBuilder.buildSystemPrompt({ story, activeCharacters: characters, temporaryCharacters: tempChars, hskLevel, narratorLanguage });
       
       // 7. Đọc history từ checkpoint
       const history = await this.historyStore.readSinceLastCheckpoint(ctx.sessionId);
       
       // 8. Build messages array cho LLM
       const llmMessages = this.promptBuilder.buildLlmMessages(systemPrompt, history, userMessage, persistentOOC, ephemeralOOCs);

       // 9. Call LLM
       const response = await this.llmService.chatJson(llmMessages, AssistantBatchSchema);

       // 10. Append assistant batch vào .jsonl
       await this.historyStore.append(ctx.sessionId, {
         type: 'assistant_batch',
         timestamp: Date.now(),
         data: { messages: response.content, triggerMemory: response.triggerMemory }
       });

       // 11. Transform response → AssistantBatch DTO
       return this.transformToDto(response, characters);
     }
   }
   ```
2. `ChatContext`:
   ```typescript
   interface ChatContext {
     sessionId: string;
     userId: string;
     storyId: string;
   }
   ```

**Output kiểm chứng**:
- E2E (Ollama running): tạo session → send message → nhận AssistantBatch hợp lệ.
- File .jsonl có đầy đủ user + assistant entries.

---

## P4.T7 — Server: ChatController (Endpoints)

**Status**: `[done]`  
**Depends on**: P4.T6

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/chat.controller.ts`:
   ```typescript
   @Controller('chat')
   export class ChatController {
     // POST /chat/sessions — Tạo hoặc resume session
     @Post('sessions')
     async startSession(@Body() dto: StartSessionDto, @CurrentUser() user) {
       // Check có active session cho story này không → resume
       // Nếu không → tạo mới (INSERT sessions, init .jsonl, init OOC active chars)
       // Return { sessionId, isResumed, initialActiveCharacters }
     }

     // GET /chat/sessions/:id/history — Hydrate UI khi vào lại room
     @Get('sessions/:id/history')
     async getHistory(@Param('id') id: string, @CurrentUser() user) {
       // Verify ownership
       // Read .jsonl → transform to client-friendly messages
       // Return { messages, persistentOOC, activeCharacters }
     }

     // POST /chat/sessions/:id/message — Gửi 1 lượt
     @Post('sessions/:id/message')
     async sendMessage(@Param('id') id, @Body() dto: SendMessageDto, @CurrentUser() user) {
       // Validate session active + ownership
       // Rate limit: 1 message/2s per session (Redis)
       // Call orchestrator.handleUserTurn
       // Emit USER_SENT_MESSAGE event (placeholder, wire Phase 11)
       // Return AssistantBatch
     }

     // POST /chat/sessions/:id/ooc
     @Post('sessions/:id/ooc')
     async setOoc(@Param('id') id, @Body() dto: OocDto, @CurrentUser() user) {
       // dto.type = 'persistent' → oocService.setPersistent + historyStore.append
       // dto.type = 'ephemeral' → oocService.pushEphemeral
       // Return 204
     }

     // POST /chat/sessions/:id/character-toggle
     @Post('sessions/:id/character-toggle')
     async toggleCharacter(@Param('id') id, @Body() dto: ToggleDto, @CurrentUser() user) {
       // dto.on = true → addActive + pushEphemeral("{name} đã vào cảnh")
       // dto.on = false → removeActive + pushEphemeral("{name} đã rời cảnh")
       // Append persistent_ooc entry to .jsonl
       // Return 204
     }

     // POST /chat/sessions/:id/temp-character
     @Post('sessions/:id/temp-character')
     async addTempCharacter(@Param('id') id, @Body() dto: TempCharDto, @CurrentUser() user) {
       // oocService.addTemporary → return tempId
       // pushEphemeral("Nhân vật tạm thời {name} xuất hiện: {description}")
     }
   }
   ```
2. DTOs:
   - `StartSessionDto`: `{ storyId: string }`
   - `SendMessageDto`: `{ userMessage: string, ephemeralOOC?: string }`
   - `OocDto`: `{ type: 'persistent'|'ephemeral', text: string }`
   - `ToggleDto`: `{ characterId: string, on: boolean }`
   - `TempCharDto`: `{ name: string, description: string }`
3. Session lock (Redis):
   - Khi `sendMessage` xử lý → acquire lock `chat:lock:{sessionId}` (5s TTL).
   - Prevent concurrent messages to same session.
   - Nếu locked → `409 SESSION_LOCKED`.

**Output kiểm chứng**:
- Full flow: startSession → sendMessage → getHistory → toggleChar → sendMessage again.
- Concurrent send → 1 pass, 1 get 409.
- OOC persistent → xuất hiện trong prompt lần gọi tiếp.

---

## P4.T8 — Client: ChatStore + ChatRoom Screen (Minimal)

**Status**: `[done]`  
**Depends on**: P4.T7

**Mô tả chi tiết**:
1. Tạo `src/features/chat/`:
   ```
   chat/
   ├── screens/
   │   └── ChatRoomScreen.tsx
   ├── store/
   │   └── chat.store.ts
   ├── services/
   │   └── chat.service.ts
   ├── hooks/
   │   └── useChat.ts
   └── components/
       ├── MessageBubble.tsx       # (đơn giản, polish ở Phase 5)
       ├── InputBar.tsx
       └── OocPanel.tsx            # Sidebar/Modal cho persistent OOC
   ```
2. `chat.store.ts` (Zustand):
   ```typescript
   interface ChatState {
     sessionId: string | null;
     messages: ChatMessage[];
     inputLocked: boolean;
     isLoading: boolean;
     activeCharacters: string[];
     persistentOOC: string;
     
     startSession: (storyId: string) => Promise<void>;
     sendMessage: (text: string, ephemeralOOC?: string) => Promise<void>;
     loadHistory: () => Promise<void>;
     toggleCharacter: (charId: string, on: boolean) => Promise<void>;
     setPersistentOOC: (text: string) => Promise<void>;
   }
   ```
3. `ChatRoomScreen.tsx`:
   - FlatList inverted hiển thị messages.
   - `InputBar`: TextInput + Send button. Disabled khi `inputLocked`.
   - Header: Story title + nút mở OOC panel + nút End Chat (placeholder).
   - Khi enter room: `startSession(storyId)` → `loadHistory()`.
   - `sendMessage`: optimistic add user bubble → API call → append assistant bubbles.
4. `MessageBubble.tsx` (basic version):
   - Character message: tên + text + translation (slide down).
   - Narrator message: italic, background khác.
   - User message: align right.
5. Wire vào navigation:
   - Từ `StoryDetailScreen` nút "Bắt đầu Chat" → navigate `ChatRoomScreen` with `storyId`.

**Output kiểm chứng**:
- Nhấn "Bắt đầu Chat" → vào room → gõ text → nhận response AI → hiển thị bubbles.
- OOC panel: set text → message tiếp AI có ngữ cảnh.
- Quay lại → vào lại room → history load đúng.

---
