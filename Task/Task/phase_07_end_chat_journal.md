# Phase 7 — End Chat + Journal + Story Progress

> **Mục tiêu**: Kết thúc session → tóm tắt → lưu messages vào DB → tạo journal entry → cập nhật story progress → cleanup.  
> **Phụ thuộc**: Phase 4, Phase 6.

---

## P7.T1 — Server: EndChatService (Orchestration)

**Status**: `[ ]`  
**Depends on**: P6.T3 (Phase 6 hoàn thành)

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/end-chat.service.ts`:
   ```typescript
   @Injectable()
   export class EndChatService {
     constructor(
       private historyStore: HistoryStoreService,
       private llmService: LlmService,
       private prisma: PrismaService,
       private oocService: OocService,
       private eventEmitter: EventEmitter2,
       private logger: Logger,
     ) {}

     async execute(sessionId: string, userId: string): Promise<EndChatResult> {
       // 0. Idempotency check: nếu session.status đã 'ended' → trả kết quả cached
       const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
       if (session.status === 'ended') {
         return this.getCachedResult(sessionId);
       }
       if (session.userId !== userId) throw new ForbiddenException();

       // 1. Đọc toàn bộ .jsonl
       const allEntries = await this.historyStore.readAll(sessionId);

       // 2. Song song: tóm tắt plot + tóm tắt session overview
       const [plotSummary, sessionSummary] = await Promise.all([
         this.llmService.summarize(this.formatForPlot(allEntries), 'plot'),
         this.llmService.summarize(this.formatForOverview(allEntries), 'session'),
       ]);

       // 3. Transaction: commit tất cả vào Postgres
       const result = await this.prisma.$transaction(async (tx) => {
         // 3a. Update session status
         await tx.session.update({
           where: { id: sessionId },
           data: { status: 'ended', summary: sessionSummary, endedAt: BigInt(Date.now()) }
         });

         // 3b. Batch insert messages (từ .jsonl entries)
         const messages = this.extractMessages(allEntries, sessionId);
         await tx.message.createMany({ data: messages });

         // 3c. Update story.currentProgress
         await tx.story.update({
           where: { id: session.storyId },
           data: { currentProgress: { append: `\n\n---\n${plotSummary}` } }
           // Hoặc: currentProgress = currentProgress + plotSummary
         });

         return { messageCount: messages.length };
       });

       // 4. Cleanup .jsonl file (sau transaction thành công)
       await this.historyStore.cleanup(sessionId);

       // 5. Cleanup OOC Redis keys
       await this.oocService.cleanupSession(sessionId);

       // 6. Emit domain events
       this.eventEmitter.emit('SESSION_ENDED', { userId, sessionId, storyId: session.storyId });
       this.eventEmitter.emit('MEMORY_TRIGGER', { sessionId, type: 'plot' });

       return {
         journalSessionId: sessionId,
         summary: sessionSummary,
         messageCount: result.messageCount,
       };
     }
   }
   ```
2. `extractMessages(entries, sessionId)`:
   - Loop qua entries:
     - `type === 'user'` → tạo Message row: `{ role: 'user', text: entry.data.text, turnOrder: counter++ }`
     - `type === 'assistant_batch'` → loop `entry.data.messages` → mỗi item tạo Message row: `{ role: 'assistant', characterName, text, translation, emotion, intensity, words, shopEvent, turnOrder: counter++ }`
   - Assign `sessionId`, `timestamp` cho mỗi row.
3. Summarize prompt templates:
   - `packages/prompts/v1/summarize_plot.md`: Tóm tắt sự kiện cốt truyện (góc nhìn thứ 3).
   - `packages/prompts/v1/summarize_session.md`: Tóm tắt session overview cho journal.

**Output kiểm chứng**:
- End Chat → session status = 'ended', messages in DB, .jsonl deleted, Redis keys gone.
- Gọi End Chat lần 2 → trả cùng result (idempotent).
- Story.currentProgress có đoạn summary mới append.

---

## P7.T2 — Server: Chat Controller — End Endpoint

**Status**: `[ ]`  
**Depends on**: P7.T1

**Mô tả chi tiết**:
1. Thêm vào `chat.controller.ts`:
   ```typescript
   @Post('sessions/:id/end')
   async endSession(@Param('id') id: string, @CurrentUser() user) {
     // Validate session exists + ownership + status active
     // Acquire lock (prevent concurrent end)
     const result = await this.endChatService.execute(id, user.uid);
     return result; // { journalSessionId, summary, messageCount }
   }
   ```
2. Error cases:
   - Session not found → 404.
   - Session already ended → 200 (idempotent, trả cached result).
   - Not owner → 403.
   - Lock conflict → 409 (đang end bởi request khác).
3. Cập nhật `Idempotency-Key` handling:
   - Lưu result vào Redis (TTL 1h) keyed by `idempotency:{key}`.
   - Nếu request đến với cùng key → trả cached response.

**Output kiểm chứng**:
- `POST /chat/sessions/:id/end` → 200 với result.
- Gọi lại → cùng result (idempotent).
- Session đã ended → 200 (not error).

---

## P7.T3 — Server: JournalModule (List + Detail)

**Status**: `[ ]`  
**Depends on**: P7.T1

**Mô tả chi tiết**:
1. Tạo `src/modules/journal/`:
   ```
   journal/
   ├── journal.module.ts
   ├── journal.controller.ts
   └── journal.service.ts
   ```
2. `journal.controller.ts`:
   ```typescript
   @Controller('journal')
   export class JournalController {
     // GET /journal/sessions?storyId=&cursor=&limit=20
     @Get('sessions')
     async listSessions(@Query() query, @CurrentUser() user) {
       // Query sessions WHERE userId AND status='ended'
       // Optional filter by storyId
       // Cursor pagination by createdAt
       // Return { items: SessionSummary[], nextCursor }
     }

     // GET /journal/sessions/:id
     @Get('sessions/:id')
     async getSessionDetail(@Param('id') id, @CurrentUser() user) {
       // Verify ownership
       // Load session + all messages (ordered by turnOrder)
       // Return SessionDetail { ...session, messages: Message[] }
     }
   }
   ```
3. Response DTOs:
   ```typescript
   interface SessionSummary {
     id: string;
     storyTitle: string;
     summary: string;
     startedAt: number;
     endedAt: number;
     messageCount: number;
     wordCount: number;  // COUNT messages WHERE words IS NOT NULL
   }
   interface SessionDetail extends SessionSummary {
     messages: MessageDto[];
   }
   ```
4. Performance: Index `sessions(userId, status, createdAt)` đã có.

**Output kiểm chứng**:
- After End Chat → `GET /journal/sessions` hiện session mới.
- `GET /journal/sessions/:id` → trả đầy đủ messages sorted.
- Pagination hoạt động với cursor.

---

## P7.T4 — Client: End Chat Flow + Navigate to Journal

**Status**: `[ ]`  
**Depends on**: P7.T2

**Mô tả chi tiết**:
1. Cập nhật `ChatRoomScreen.tsx`:
   - Header nút "Kết thúc" → Confirm Alert "Bạn muốn kết thúc phiên chat?".
   - Khi confirm:
     1. Stop PlaybackQueue.
     2. Show loading overlay.
     3. Gọi `POST /chat/sessions/:id/end`.
     4. Navigate to JournalDetailScreen({ sessionId: result.journalSessionId }).
2. Tạo `src/features/journal/screens/JournalListScreen.tsx`:
   - FlatList hiển thị SessionSummary cards.
   - Mỗi card: storyTitle, summary (truncated), date, message count.
   - Tap → navigate JournalDetailScreen.
3. Tạo `src/features/journal/screens/JournalDetailScreen.tsx`:
   - Header: story title + date range.
   - Summary section ở đầu.
   - FlatList messages (reuse MessageBubble, NarratorBubble, UserBubble components).
   - Read-only mode (no input bar, no playback).
   - Tap word → tooltip vẫn hoạt động (reuse).
4. Wire vào navigation:
   - MainTab: Journal tab → JournalListScreen.
   - Stack: JournalList → JournalDetail.

**Output kiểm chứng**:
- End Chat → tự chuyển sang Journal detail.
- Journal tab: danh sách sessions, tap vào → replay full chat history.
- Word tooltip hoạt động trong Journal view.

---

## P7.T5 — Client: Story Progress Display

**Status**: `[ ]`  
**Depends on**: P7.T1

**Mô tả chi tiết**:
1. Cập nhật `StoryDetailScreen.tsx`:
   - Section "Tiến độ cốt truyện" (`currentProgress`):
     - Hiển thị text (có thể dài → ScrollView hoặc collapsible).
     - Mỗi đoạn summary ngăn cách bởi `---`.
     - Show "Chưa có tiến độ" nếu empty.
2. Cập nhật `story.store.ts`:
   - Sau End Chat, refetch story detail để lấy currentProgress mới.
   - Hoặc optimistic update từ response summary.

**Output kiểm chứng**:
- Sau End Chat → quay về StoryDetail → thấy đoạn summary mới trong progress.
- Nhiều sessions → progress có nhiều đoạn ngăn cách.

---
