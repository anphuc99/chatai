# Phase 6 — Checkpoint Mechanism

> **Mục tiêu**: Khi chat dài vượt ngưỡng token, tự tóm tắt history cũ thành checkpoint để giảm prompt size.  
> **Phụ thuộc**: Phase 4 (Chat MVP).

---

## P6.T1 — Token Counter + Threshold Config

**Status**: `[ ]`  
**Depends on**: P5.T5 (Phase 5 hoàn thành)

**Mô tả chi tiết**:
1. Tạo `src/modules/chat/services/token-counter.service.ts`:
   ```typescript
   @Injectable()
   export class TokenCounterService {
     // Ước lượng token count cho text
     estimateTokens(text: string): number {
       // Qwen tokenizer: ~1.5 chars/token cho tiếng Trung, ~4 chars/token cho tiếng Anh
       // Simplified approach:
       const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
       const otherChars = text.length - chineseChars;
       return Math.ceil(chineseChars / 1.5 + otherChars / 4);
     }

     // Tính tổng tokens cho danh sách messages
     estimateHistoryTokens(entries: HistoryEntry[]): number {
       return entries.reduce((sum, entry) => {
         const text = JSON.stringify(entry.data);
         return sum + this.estimateTokens(text);
       }, 0);
     }
   }
   ```
2. Config threshold (trong `.env` hoặc config module):
   ```env
   MAX_HISTORY_TOKENS=6000         # Ngưỡng kích hoạt checkpoint
   CHECKPOINT_TRIGGER_RATIO=0.8    # Khi đạt 80% MAX → trigger
   ```
   - Khi `currentTokens >= MAX_HISTORY_TOKENS * CHECKPOINT_TRIGGER_RATIO` → trigger checkpoint.
3. Lý do ngưỡng 6000:
   - Qwen 14b context window: ~32k tokens.
   - System prompt + Memory context: ~3000-5000 tokens.
   - Để dư cho response: ~2000 tokens.
   - History budget: ~6000-8000 tokens.

**Output kiểm chứng**:
- Unit test: text 100 chữ Hán → ~67 tokens. Text 100 chars English → ~25 tokens.
- `estimateHistoryTokens` với mock entries → đúng khoảng.

---

## P6.T2 — Checkpoint Writer (Small AI Summarize)

**Status**: `[ ]`  
**Depends on**: P6.T1

**Mô tả chi tiết**:
1. Cập nhật `ChatOrchestratorService.handleUserTurn`:
   - Sau khi append assistant_batch, thêm logic:
   ```typescript
   // Sau bước 10 (append assistant)
   // 11. Kiểm tra cần checkpoint không
   const history = await this.historyStore.readSinceLastCheckpoint(ctx.sessionId);
   const tokens = this.tokenCounter.estimateHistoryTokens(history);
   
   if (tokens >= this.config.MAX_HISTORY_TOKENS * this.config.CHECKPOINT_TRIGGER_RATIO) {
     // Trigger checkpoint async (không block response)
     this.createCheckpoint(ctx.sessionId, history).catch(err => this.logger.error(err));
   }
   ```
2. `createCheckpoint` method:
   ```typescript
   private async createCheckpoint(sessionId: string, history: HistoryEntry[]): Promise<void> {
     // 1. Format history thành readable text
     const historyText = this.formatHistoryForSummary(history);
     
     // 2. Gọi Small AI summarize
     const summary = await this.llmService.summarize(historyText, 'session');
     
     // 3. Append checkpoint entry vào .jsonl
     await this.historyStore.append(sessionId, {
       type: 'checkpoint',
       timestamp: Date.now(),
       data: { summary }
     });
     
     this.logger.info(`Checkpoint created for session ${sessionId}, summarized ${history.length} entries`);
   }
   ```
3. Tạo summarize prompt template (`packages/prompts/v1/summarize_session.md`):
   ```markdown
   Tóm tắt đoạn hội thoại roleplay sau đây thành 1 đoạn ngắn gọn (200-400 từ).
   Giữ lại: tên nhân vật, sự kiện chính, trạng thái cảm xúc, quyết định quan trọng.
   Bỏ qua: chi tiết nhỏ, lời thoại lặp lại, từ vựng riêng lẻ.
   
   === LỊCH SỬ ===
   {{HISTORY_TEXT}}
   
   === TÓM TẮT ===
   ```
4. Cập nhật `HistoryStoreService.readSinceLastCheckpoint`:
   - Tìm entry cuối có `type === 'checkpoint'`.
   - Nếu tìm thấy: đọc checkpoint summary + tất cả entries sau nó.
   - Nếu không: đọc tất cả.
   - Khi build LLM messages: checkpoint summary → thêm như 1 system message "Tóm tắt trước đó: ..."

**Output kiểm chứng**:
- Chat 20+ lượt → checkpoint xuất hiện trong .jsonl.
- Messages sau checkpoint: prompt size nhỏ hơn đáng kể.
- AI vẫn nhớ context từ summary (test thủ công: hỏi về sự kiện cũ).

---

## P6.T3 — Integration: Prompt Builder đọc Checkpoint

**Status**: `[ ]`  
**Depends on**: P6.T2

**Mô tả chi tiết**:
1. Cập nhật `PromptBuilderService.buildLlmMessages`:
   ```typescript
   buildLlmMessages(systemPrompt, history, userMessage, persistentOOC, ephemeralOOCs, memoryContext?) {
     const messages: LlmMessage[] = [
       { role: 'system', content: systemPrompt }
     ];

     // Nếu history bắt đầu bằng checkpoint
     const firstEntry = history[0];
     if (firstEntry?.type === 'checkpoint') {
       messages.push({
         role: 'system',
         content: `[TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ]\n${firstEntry.data.summary}`
       });
       history = history.slice(1); // bỏ checkpoint entry, chỉ lấy messages sau
     }

     // Memory context (Phase 8)
     if (memoryContext) {
       messages.push({
         role: 'system',
         content: `[TRÍ NHỚ DÀI HẠN]\n${memoryContext}`
       });
     }

     // Persistent OOC
     if (persistentOOC) {
       messages.push({
         role: 'system',
         content: `[BỐI CẢNH CỐ ĐỊNH (OOC)]\n${persistentOOC}`
       });
     }

     // Convert history entries → user/assistant messages
     for (const entry of history) {
       if (entry.type === 'user') {
         let content = entry.data.text;
         if (entry.data.ephemeralOOC) content += `\n[OOC: ${entry.data.ephemeralOOC}]`;
         messages.push({ role: 'user', content });
       } else if (entry.type === 'assistant_batch') {
         messages.push({ role: 'assistant', content: JSON.stringify(entry.data) });
       }
       // persistent_ooc, ephemeral_ooc entries → skip (đã xử lý inline)
     }

     // Current user message + ephemeral OOCs
     let userContent = userMessage;
     if (ephemeralOOCs.length > 0) {
       userContent += `\n[OOC: ${ephemeralOOCs.join('; ')}]`;
     }
     messages.push({ role: 'user', content: userContent });

     return messages;
   }
   ```
2. Test: tạo history với checkpoint → buildLlmMessages → verify:
   - System message đầu tiên chứa systemPrompt.
   - System message thứ 2 chứa summary.
   - Không có raw messages từ trước checkpoint.

**Output kiểm chứng**:
- Unit test: history có checkpoint → messages array bắt đầu bằng summary, không có entries cũ.
- Token count của messages array < MAX_HISTORY_TOKENS.

---
