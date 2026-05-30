# Phase 10 — Vocabulary Notebook + SRS Review

> **Mục tiêu**: User lưu từ từ chat vào sổ tay → Ôn tập SRS với AI → Từ vựng thăng cấp.  
> **Phụ thuộc**: Phase 5 (Word Tooltip "Lưu" button), Phase 7 (Journal).

---

## P10.T1 — Database: Vocabulary Table

**Status**: `[ ]`  
**Depends on**: P9.T5 (Phase 9 hoàn thành)

**Mô tả chi tiết**:
1. Thêm model vào `prisma/schema.prisma`:
   ```prisma
   model Vocabulary {
     id              String   @id @default(uuid())
     userId          String   @map("user_id")
     sourceSessionId String?  @map("source_session_id")
     hz              String   // Chữ Hán
     py              String   // Pinyin
     vn              String   // Nghĩa Việt
     sourceSentence  String?  @map("source_sentence") @db.Text
     status          String   @default("learning") // "learning" | "mastered"
     stepIndex       Int      @default(0) @map("step_index") // 0..25 (SRS schedule)
     nextReviewDate  BigInt   @map("next_review_date") // timestamp ms
     createdAt       DateTime @default(now()) @map("created_at")

     user UsersMeta @relation(fields: [userId], references: [uid])

     @@unique([userId, hz], name: "unique_user_hz")
     @@index([userId, nextReviewDate, status])
     @@map("vocabulary")
   }
   ```
2. Run migration: `npx prisma migrate dev --name add_vocabulary`.
3. SRS Schedule array (từ `Document/Vocabulary/srs_schedule.md`):
   ```typescript
   // packages/shared-types/src/srs.ts
   export const SRS_SCHEDULE = [
     0,          // step 0: review ngay
     4 * 3600,   // step 1: 4 giờ
     8 * 3600,   // step 2: 8 giờ
     24 * 3600,  // step 3: 1 ngày
     2 * 86400,  // step 4: 2 ngày
     4 * 86400,  // step 5: 4 ngày
     7 * 86400,  // step 6: 1 tuần
     14 * 86400, // step 7: 2 tuần
     30 * 86400, // step 8: 1 tháng
     60 * 86400, // step 9: 2 tháng
     // ... extend to step 25
   ] as const; // seconds
   ```

**Output kiểm chứng**:
- Migration thành công, unique constraint hoạt động.
- Cùng user + cùng `hz` → INSERT fail (UPSERT instead).

---

## P10.T2 — Server: VocabularyModule (CRUD + SRS Logic)

**Status**: `[ ]`  
**Depends on**: P10.T1

**Mô tả chi tiết**:
1. Tạo `src/modules/vocabulary/`:
   ```
   vocabulary/
   ├── vocabulary.module.ts
   ├── vocabulary.controller.ts
   ├── vocabulary.service.ts
   ├── srs-scheduler.service.ts
   └── dto/
       ├── save-word.dto.ts
       └── vocab-response.dto.ts
   ```
2. `vocabulary.controller.ts`:
   ```typescript
   @Controller('vocabulary')
   export class VocabularyController {
     // POST /vocabulary/save — Lưu từ mới (UPSERT)
     @Post('save')
     async save(@Body() dto: SaveWordDto, @CurrentUser() user) {
       const result = await this.vocabService.collectWord(user.uid, dto);
       this.eventEmitter.emit('USER_SAVED_WORD', { userId: user.uid, wordId: result.id });
       return { wordId: result.id, isNew: result.isNew };
     }

     // GET /vocabulary — Danh sách sổ từ
     @Get()
     async list(@CurrentUser() user) {
       return this.vocabService.listAll(user.uid);
     }

     // GET /vocabulary/due — Từ cần ôn hôm nay
     @Get('due')
     async getDue(@CurrentUser() user) {
       return this.vocabService.getDueToday(user.uid);
     }

     // DELETE /vocabulary/:id
     @Delete(':id')
     async remove(@Param('id') id, @CurrentUser() user) {
       await this.vocabService.remove(id, user.uid);
     }
   }
   ```
3. `vocabulary.service.ts`:
   ```typescript
   async collectWord(userId: string, dto: SaveWordDto): Promise<{ id: string, isNew: boolean }> {
     // UPSERT: nếu đã có (user_id, hz) → update source_sentence, không reset step
     const existing = await this.prisma.vocabulary.findUnique({
       where: { unique_user_hz: { userId, hz: dto.hz } }
     });
     if (existing) {
       await this.prisma.vocabulary.update({
         where: { id: existing.id },
         data: { sourceSentence: dto.sourceSentence, sourceSessionId: dto.sourceSessionId }
       });
       return { id: existing.id, isNew: false };
     }
     // Tạo mới: nextReviewDate = now (review ngay lần đầu)
     const word = await this.prisma.vocabulary.create({
       data: { userId, hz: dto.hz, py: dto.py, vn: dto.vn, sourceSentence: dto.sourceSentence, sourceSessionId: dto.sourceSessionId, nextReviewDate: BigInt(Date.now()) }
     });
     return { id: word.id, isNew: true };
   }

   async getDueToday(userId: string): Promise<VocabWord[]> {
     return this.prisma.vocabulary.findMany({
       where: { userId, status: 'learning', nextReviewDate: { lte: BigInt(Date.now()) } },
       orderBy: { nextReviewDate: 'asc' },
       take: 50 // max 50 từ per session
     });
   }
   ```
4. `srs-scheduler.service.ts`:
   ```typescript
   @Injectable()
   export class SrsSchedulerService {
     advance(word: Vocabulary): { nextReviewDate: number, newStep: number, mastered: boolean } {
       const newStep = Math.min(word.stepIndex + 1, SRS_SCHEDULE.length - 1);
       const interval = SRS_SCHEDULE[newStep] * 1000; // convert to ms
       const nextReviewDate = Date.now() + interval;
       const mastered = newStep >= SRS_SCHEDULE.length - 1;
       return { nextReviewDate, newStep, mastered };
     }

     reset(word: Vocabulary): { nextReviewDate: number, newStep: number } {
       // Reset về step 0 khi fail
       return { nextReviewDate: Date.now(), newStep: 0 };
     }
   }
   ```

**Output kiểm chứng**:
- Save word → UPSERT đúng (không duplicate).
- getDue → trả từ có nextReviewDate ≤ now.
- advance → nextReviewDate tăng đúng schedule.

---

## P10.T3 — Server: VocabReviewService (AI Review Session)

**Status**: `[ ]`  
**Depends on**: P10.T2

**Mô tả chi tiết**:
1. Tạo `src/modules/vocabulary/services/vocab-review.service.ts`:
   ```typescript
   @Injectable()
   export class VocabReviewService {
     // Bắt đầu phiên review
     async startSession(userId: string): Promise<ReviewSession> {
       // 1. Lấy due words (max 20 per session)
       const words = await this.vocabService.getDueToday(userId);
       if (words.length === 0) throw new BadRequestException('NO_WORDS_DUE');

       // 2. Tạo review session (có thể lưu Redis hoặc .jsonl riêng)
       const sessionId = uuid();
       const queue = words.map(w => ({ id: w.id, hz: w.hz, py: w.py, vn: w.vn }));
       
       // 3. Lưu session state vào Redis
       await this.redis.setex(`review:${sessionId}`, 3600, JSON.stringify({
         userId, queue, currentBatch: 0, results: []
       }));

       // 4. Build system prompt cho AI review
       const systemPrompt = this.buildReviewSystemPrompt(queue);

       return { sessionId, queue, systemPrompt };
     }

     // Xử lý 1 lượt user text
     async processTurn(sessionId: string, userText: string): Promise<ReviewTurnResult> {
       const state = await this.getSessionState(sessionId);
       
       // 1. Gọi LLM verify: user đã sử dụng đúng từ vựng chưa?
       //    - Strict verification: check xem hz có xuất hiện trong userText
       //    - AI cũng verify ngữ pháp, context
       
       // 2. Xác định từ nào đã dùng đúng
       const usedWords = this.verifyWordUsage(userText, state.queue);
       
       // 3. Nếu có từ chưa dùng → AI gợi ý (Puzzle Hint)
       //    Prompt: "User chưa sử dụng từ X. Hãy gợi ý bằng cách đặt câu hỏi dẫn dắt."
       
       // 4. AI response (tiếp tục dialogue + feedback)
       const aiResponse = await this.llmService.chatJson(messages, ReviewResponseSchema);
       
       // 5. Update state
       for (const word of usedWords) {
         const advancement = this.srsScheduler.advance(word);
         state.results.push({ wordId: word.id, success: true, ...advancement });
       }
       
       await this.saveSessionState(sessionId, state);
       
       return {
         assistantText: aiResponse.text,
         wordsUsed: usedWords.map(w => w.hz),
         wordsMissing: state.queue.filter(w => !usedWords.includes(w)).map(w => w.hz),
         hint: aiResponse.hint || null
       };
     }

     // Kết thúc review session
     async finishSession(sessionId: string): Promise<ReviewSummary> {
       const state = await this.getSessionState(sessionId);
       
       // Batch update vocabulary trong DB
       for (const result of state.results) {
         if (result.success) {
           await this.prisma.vocabulary.update({
             where: { id: result.wordId },
             data: { stepIndex: result.newStep, nextReviewDate: BigInt(result.nextReviewDate), status: result.mastered ? 'mastered' : 'learning' }
           });
         }
       }
       
       // Emit event
       this.eventEmitter.emit('USER_COMPLETED_REVIEW', { userId: state.userId, wordCount: state.results.length });
       
       // Cleanup Redis
       await this.redis.del(`review:${sessionId}`);
       
       return {
         wordsMastered: state.results.filter(r => r.mastered).length,
         wordsAdvanced: state.results.filter(r => r.success).length,
       };
     }
   }
   ```
2. Verification logic:
   ```typescript
   private verifyWordUsage(userText: string, queue: VocabWord[]): VocabWord[] {
     // Simple: check if hz appears in userText
     return queue.filter(w => userText.includes(w.hz));
   }
   ```
3. Review System Prompt (từ `packages/prompts/v1/review_session.md`):
   ```
   Bạn là giáo viên tiếng Trung. Student cần ôn tập các từ sau: {{WORD_LIST}}.
   Hãy tạo một đoạn hội thoại tự nhiên để student sử dụng các từ này.
   Sau mỗi lượt, kiểm tra student đã dùng đúng từ nào.
   Nếu student chưa dùng hết, gợi ý bằng câu hỏi dẫn dắt (không nói đáp án trực tiếp).
   ```

**Output kiểm chứng**:
- Start session → nhận queue words.
- User viết text chứa 2/5 từ → response xác nhận 2 từ, gợi ý 3 từ còn lại.
- Finish → words updated SRS, event emitted.

---

## P10.T4 — Server: Review Endpoints

**Status**: `[ ]`  
**Depends on**: P10.T3

**Mô tả chi tiết**:
1. Thêm endpoints vào `vocabulary.controller.ts`:
   ```typescript
   @Post('review-session/start')
   async startReview(@CurrentUser() user) {
     return this.reviewService.startSession(user.uid);
   }

   @Post('review-session/:id/turn')
   async reviewTurn(@Param('id') id, @Body() dto: ReviewTurnDto, @CurrentUser() user) {
     return this.reviewService.processTurn(id, dto.userText);
   }

   @Post('review-session/:id/finish')
   async finishReview(@Param('id') id, @CurrentUser() user) {
     return this.reviewService.finishSession(id);
   }
   ```
2. `ReviewTurnDto`: `{ userText: string }` (max 500 chars).

**Output kiểm chứng**:
- Full flow: start → turn (multiple) → finish → words SRS updated.

---

## P10.T5 — Client: Wire "Lưu" Button + VocabularyNotebook Screen

**Status**: `[ ]`  
**Depends on**: P10.T2

**Mô tả chi tiết**:
1. Cập nhật `WordTooltip.tsx` (từ Phase 5):
   - Nút "Lưu" → gọi `POST /vocabulary/save { hz, py, vn, sourceSentence, sourceSessionId }`.
   - Success → Toast "Đã lưu ✓" + icon đổi thành ✓.
   - Already exists (isNew=false) → Toast "Từ này đã có trong sổ".
2. Tạo `src/features/vocabulary/screens/VocabNotebookScreen.tsx`:
   - FlatList hiển thị tất cả từ.
   - Mỗi item: hz | py | vn | status badge | next review date.
   - Swipe-to-delete.
   - Filter tabs: "Tất cả" | "Đang học" | "Đã thuộc".
   - Badge trên tab: số từ cần ôn hôm nay.
3. Tạo `src/features/vocabulary/store/vocabulary.store.ts`:
   ```typescript
   interface VocabState {
     words: VocabWord[];
     dueCount: number;
     fetchAll: () => Promise<void>;
     fetchDue: () => Promise<void>;
     saveWord: (word: SaveWordInput) => Promise<void>;
     deleteWord: (id: string) => Promise<void>;
   }
   ```
4. Wire vào navigation: MainTab thêm tab hoặc trong Profile section.

**Output kiểm chứng**:
- Tap word in chat → Lưu → hiện trong VocabNotebook.
- Duplicate save → "Đã có".
- Delete → từ biến mất.

---

## P10.T6 — Client: VocabReviewScreen (AI Review Flow)

**Status**: `[ ]`  
**Depends on**: P10.T4, P10.T5

**Mô tả chi tiết**:
1. Tạo `src/features/vocabulary/screens/VocabReviewScreen.tsx`:
   - Entry: từ VocabNotebook, nút "Ôn tập" (disabled nếu dueCount = 0).
   - Flow:
     1. Call `startReview` → nhận queue + systemPrompt.
     2. Hiển thị danh sách từ cần ôn (sidebar hoặc top bar).
     3. Chat interface (giống ChatRoom nhưng đơn giản hơn):
        - User input: TextInput (tiếng Trung).
        - AI response: bubble text.
        - Word status indicators: ✅ đã dùng, ⬜ chưa dùng.
     4. Khi tất cả từ đã dùng hoặc user nhấn "Kết thúc":
        - Call `finishReview`.
        - Hiện Result screen: X từ thăng cấp, X từ cần ôn lại.
2. Word status panel:
   ```
   ┌─────────────────────┐
   │ Từ cần ôn:          │
   │ ✅ 奶茶  ✅ 好吃    │
   │ ⬜ 一起  ⬜ 喜欢    │
   └─────────────────────┘
   ```
   Update realtime khi AI confirm word used.
3. Hint display:
   - Nếu AI trả `hint` → hiện trong bubble đặc biệt (màu vàng nhạt).
4. Result screen:
   ```
   ┌─────────────────────────┐
   │  🎉 Kết quả ôn tập     │
   │                         │
   │  Từ đã dùng: 4/5       │
   │  Từ thăng cấp: 3       │
   │  Gems nhận: +5 💎      │
   │                         │
   │  [Quay về]              │
   └─────────────────────────┘
   ```

**Output kiểm chứng**:
- Start review → chat with AI → use words → finish → SRS updated.
- Word panel updates realtime.
- No due words → button disabled, message "Chưa đến lúc ôn".

---
