# P04.R — Senior Code Review & Refactor Guide (Phase 4 — Chat MVP)

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P04.R |
| Phase | 4 — Chat MVP |
| Depends on | P04.T1–T8 hoàn thành |
| Complexity | Medium |
| Risk | Medium |
| Reviewer | Senior Review (AI) |
| Created | 2026-05-31 |

---

## 2. KẾT QUẢ KIỂM TRA SUBTASK

Tất cả 8 subtask P04 đã được implement. Chi tiết:

| Task | Mô tả | Trạng thái | Ghi chú |
|------|-------|------------|---------|
| P04.T1 | DB: Sessions + Messages | ✅ DONE | Migration `20260530162248_add_sessions_messages` apply thành công. Đủ 2 index theo spec. FK CASCADE/SET NULL đúng. |
| P04.T2 | HistoryStoreService | ✅ DONE | Đủ 6 methods. Có mutex write-queue (ngoài spec, tốt). Unit tests đầy đủ (8 cases). |
| P04.T3 | OocService | ✅ DONE | Lua script atomic pullAll đúng. TTL 24h. Unit tests đầy đủ (5 test groups). `removeTemporary` bonus. |
| P04.T4 | PromptBuilderService | ✅ DONE | Template loading, placeholder replace. `buildLlmMessages` inject OOC đúng format. |
| P04.T5 | LlmService | ✅ DONE | Retry 2 lần, Zod validation, `extractJson` với 4 fallback strategies. `summarize` small model. |
| P04.T6 | ChatOrchestratorService | ✅ DONE | Full 12-step pipeline. Persist DB + emit events (ngoài spec, tốt). |
| P04.T7 | ChatController | ✅ DONE | 6 endpoints. Redis lock, rate throttling. `ChatSessionService` tách riêng (tốt hơn spec). |
| P04.T8 | Client Chat Room | ✅ DONE | ChatStore, ChatRoomScreen, MessageBubble, InputBar, OocPanel, CharacterToggleSheet. Đầy đủ. |

---

## 3. ĐÁNH GIÁ TỔNG QUAN

### Điểm mạnh

- **Architecture sạch**: `ChatSessionService` được tách riêng khỏi `ChatController` — đúng Single Responsibility.
- **Mutex write-queue** trong `HistoryStoreService` giải quyết race condition concurrent append không có trong spec — thể hiện tư duy defensive.
- **Lua script atomic** trong `OocService.pullAllEphemeral` — đảm bảo không mất data khi concurrent pull.
- **Zod schema + multi-strategy extractJson** trong `LlmService` — robust với LLM output không chuẩn.
- **Redis TTL 24h** tự động expire session state nếu bị abandon — đúng thiết kế.
- **Test coverage** của T2, T3 rất tốt; orchestrator có mock-based unit test.

### Vấn đề cần refactor

Ưu tiên:
- 🔴 **Critical** — bug logic/correctness
- 🟠 **High** — type safety, semantic error
- 🟡 **Medium** — UX, inconsistency
- 🟢 **Low** — nice-to-have

---

## 4. ISSUES & HƯỚNG DẪN REFACTOR

### [R1] 🔴 `transformToDto` hardcode `triggerMemory: false`

**File**: `apps/server/src/modules/chat/services/chat-orchestrator.service.ts:257`

**Vấn đề**: LLM trả `triggerMemory: true` → emit event đúng → nhưng DTO trả về client luôn là `false`. Phase 8 (Memory) sẽ bị broken ngay từ đầu vì client không bao giờ nhận `triggerMemory: true`.

```typescript
// HIỆN TẠI — SAI
private transformToDto(records: any[]): AssistantBatchDto {
  return {
    messages: records.map((r) => ({ ... })),
    triggerMemory: false, // ← hardcode
  };
}
```

**Fix**: Truyền `triggerMemory` từ LLM response vào method:

```typescript
private transformToDto(records: any[], triggerMemory: boolean): AssistantBatchDto {
  return {
    messages: records.map((r) => ({ ... })),
    triggerMemory,
  };
}

// Tại dòng gọi (line ~145):
return this.transformToDto(insertedAssistantMessages, llmResp.triggerMemory ?? false);
```

---

### [R2] 🔴 `persistMessages` race condition trên `getNextTurnOrder`

**File**: `apps/server/src/modules/chat/services/chat-orchestrator.service.ts:122`

**Vấn đề**: `getNextTurnOrder` được gọi **ngoài** transaction. Nếu Redis lock fail hoặc có bug, hai messages cùng sessionId có thể lấy cùng `startOrder` → `turnOrder` bị trùng → vi phạm thứ tự.

```typescript
// HIỆN TẠI — NGUY HIỂM
const startOrder = await this.getNextTurnOrder(ctx.sessionId); // outside tx
const insertedAssistantMessages = await this.persistMessages(
  ctx.sessionId, userMessage, ephemeralOOC, llmResp.content, characters, startOrder,
);
```

**Fix**: Move `getNextTurnOrder` vào bên trong transaction:

```typescript
private async persistMessages(
  sessionId: string,
  userText: string,
  ephemeralOOC: string | undefined,
  assistantMsgs: Array<AssistantMessage>,
  characters: Character[],
) {
  return this.prisma.$transaction(async (tx) => {
    // Tính startOrder bên trong transaction để atomic
    const maxAgg = await tx.message.aggregate({
      where: { sessionId },
      _max: { turnOrder: true },
    });
    const startOrder = (maxAgg._max.turnOrder ?? 0) + 1;
    
    // ... rest of inserts
  });
}
```

---

### [R3] 🟠 `cleanup()` delete lock ngoài queue

**File**: `apps/server/src/modules/chat/services/history-store.service.ts:160–173`

**Vấn đề**: `this.writeLocks.delete(sid)` được gọi synchronously sau khi queue operation, nhưng trước khi promise resolve. Nếu có write đang pending, lock sẽ bị xóa sớm và write tiếp theo không chain đúng.

```typescript
// HIỆN TẠI
async cleanup(sid: string): Promise<void> {
  const filePath = this.pathFor(sid);
  await this.enqueueWrite(sid, async () => {
    try { await fs.unlink(filePath); } catch (error: any) { ... }
  });
  this.writeLocks.delete(sid); // ← gọi sau await nhưng lock map tự cleanup trong enqueueWrite
}
```

**Fix**: Bỏ dòng `this.writeLocks.delete(sid)` — `enqueueWrite` đã tự cleanup map khi lock chain kết thúc:

```typescript
async cleanup(sid: string): Promise<void> {
  const filePath = this.pathFor(sid);
  await this.enqueueWrite(sid, async () => {
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to delete history file for session: ${sid}`, error);
        throw error;
      }
    }
  });
  // KHÔNG cần delete manually — enqueueWrite tự dọn khi chain kết thúc
}
```

---

### [R4] 🟠 `toggleCharacter` ghi sai type vào JSONL

**File**: `apps/server/src/modules/chat/chat.controller.ts:141–145`

**Vấn đề**: Toggle character event được ghi vào JSONL với type `persistent_ooc` — semantically sai. Khi `readSinceLastCheckpoint` build lại history để gửi LLM, entry này sẽ bị skip (vì `persistent_ooc` không được process trong `buildLlmMessages`). Thông tin toggle sẽ mất, AI không biết character đã vào/ra.

```typescript
// HIỆN TẠI — SAI TYPE
await this.historyStore.append(sid, {
  type: 'persistent_ooc', // ← sai
  timestamp: Date.now(),
  data: { text: `[Toggle] ${char.name} ${dto.on ? 'on' : 'off'}` },
});
```

**Fix step 1**: Thêm `'character_toggle'` vào `HistoryEntry` type:

```typescript
// apps/server/src/modules/chat/types/history-entry.ts
export type HistoryEntry = {
  type: 'user' | 'assistant_batch' | 'persistent_ooc' | 'ephemeral_ooc' 
       | 'checkpoint' | 'system' | 'character_toggle'; // ← thêm
  timestamp: number;
  data: any;
};
```

**Fix step 2**: Đổi type trong controller:

```typescript
await this.historyStore.append(sid, {
  type: 'character_toggle', // ← đúng
  timestamp: Date.now(),
  data: { characterId: dto.characterId, name: char.name, on: dto.on },
});
```

**Fix step 3**: Xử lý trong `buildLlmMessages` (PromptBuilderService) để inject vào prompt:

```typescript
case 'character_toggle': {
  const action = entry.data.on ? 'vừa xuất hiện' : 'vừa rời khỏi cảnh';
  messages.push({
    role: 'system',
    content: `[Thông báo: ${entry.data.name} ${action}]`,
  });
  break;
}
```

---

### [R5] 🟠 Session rehydration ambiguity khi Redis expire

**File**: `apps/server/src/modules/chat/services/chat-session.service.ts:29–38`

**Vấn đề**: Nếu Redis expire (TTL 24h hết hạn), `getActiveCharacters` trả `[]`. Code lúc này rehydrate ALL characters từ story. Nhưng nếu user đã intentionally toggle off một số characters, thông tin đó bị mất — session resume không đúng state.

```typescript
// HIỆN TẠI
if (activeCharIds.length === 0) {
  // Redis expired → restore all
  const allChars = await this.prisma.character.findMany({ where: { storyId } });
  await this.ooc.setActiveCharacters(activeSession.id, allChars.map(c => c.id));
}
```

**Giải pháp đề xuất** (chọn 1 trong 2):

**Option A — Persist active chars vào DB Session** (recommended):
- Thêm field `activeCharacterIds String[]` vào `Session` model hoặc một table `session_active_characters`.
- Khi toggle, save vào DB; khi resume, restore từ DB vào Redis.

**Option B — Dùng Redis TTL dài hơn** (quick fix):
- Tăng TTL từ 24h → 7 ngày cho active_chars key để giảm probability expire trong session active.
- Kết hợp với `Session.status` — nếu session `active` mà Redis expire thì restore từ DB.

Hiện tại Option B không implement đầy đủ. Ít nhất cần log warning khi phát hiện rehydrate:

```typescript
if (activeCharIds.length === 0) {
  this.logger.warn(`Session ${activeSession.id} Redis chars expired, rehydrating from story`);
  // ... rehydrate
}
```

---

### [R6] 🟠 LlmService retry messages accumulate

**File**: `apps/server/src/modules/chat/services/llm.service.ts:47–53`

**Vấn đề**: Mỗi retry thêm 1 correction message vào `workingMessages`. Nếu attempt=3 (max retry), mảng `workingMessages` có 2 correction system messages. LLM có thể bị confused nếu correction messages mâu thuẫn nhau (vd retry 1 lỗi JSON, retry 2 lỗi schema → 2 messages khác nhau).

```typescript
// HIỆN TẠI
while (attempt <= this.maxRetries) {
  attempt++;
  if (lastError && attempt > 1) {
    workingMessages.push({ role: 'system', content: `Lần trước... ${lastError}` });
    // Sau retry 1 fail, tiếp tục push lần 2 → 2 correction messages
  }
  ...
}
```

**Fix**: Chỉ giữ 1 correction message — replace thay vì push:

```typescript
while (attempt <= this.maxRetries) {
  attempt++;
  if (lastError && attempt > 1) {
    // Replace (hoặc remove + add) thay vì push thêm
    const correctionMsg = {
      role: 'system' as const,
      content: `Response không hợp lệ. Lỗi: ${lastError}. CHỈ trả JSON đúng schema.`,
    };
    // Xóa correction message cũ nếu có, thêm mới
    const lastIdx = workingMessages.findLastIndex(m => m.role === 'system' && m.content.includes('Response không hợp lệ'));
    if (lastIdx >= 0) workingMessages.splice(lastIdx, 1);
    workingMessages.push(correctionMsg);
  }
  ...
}
```

---

### [R7] 🟡 `any` types trong ChatOrchestratorService

**File**: `apps/server/src/modules/chat/services/chat-orchestrator.service.ts`

**Vấn đề**: Nhiều `as any` và `: any[]` làm mất type safety.

```typescript
// Dòng 89 — sai type
activeCharacters: characters as any,

// Dòng 183 — thiếu type
private async persistMessages(
  ...
  assistantMsgs: Array<any>, // ← any
  characters: Array<any>,   // ← any
```

**Fix**: Import và dùng Prisma generated types:

```typescript
import { Character, Prisma } from '@prisma/client';
import { AssistantMessage } from '../schemas/assistant-batch.schema';

// PromptContext activeCharacters nhận Character[] (Character có name, age, personality)
const systemPrompt = this.promptBuilder.buildSystemPrompt({
  ...
  activeCharacters: characters, // Character[] — đã có đúng shape
  ...
});

// persistMessages với typed params
private async persistMessages(
  sessionId: string,
  userText: string,
  ephemeralOOC: string | undefined,
  assistantMsgs: AssistantMessage[],
  characters: Character[],
): Promise<Prisma.MessageGetPayload<{}>[]>
```

Cần cập nhật `PromptContext` interface để `activeCharacters` accept `Character[]` thay vì custom DTO.

---

### [R8] 🟡 `setOoc` endpoint trả 200 thay vì 204

**File**: `apps/server/src/modules/chat/chat.controller.ts:89–113`

**Vấn đề**: Spec định nghĩa `Return 204` nhưng implementation trả `{ status: 'ok' }` với HTTP 200. Không blocking nhưng inconsistent với API contract.

**Fix**:

```typescript
import { HttpCode, HttpStatus } from '@nestjs/common';

@Post('sessions/:sid/ooc')
@HttpCode(HttpStatus.NO_CONTENT)
async setOoc(...) {
  ...
  // Không return gì (204 No Content)
}
```

Tương tự cho `character-toggle` endpoint.

---

### [R9] 🟡 InputBar maxLength 1000 < Server limit 2000

**File**: `apps/mobile/src/features/chat/components/InputBar.tsx:82`

**Vấn đề**: Client `maxLength={1000}` nhưng server validate `userMessage.length <= 2000`. Không lỗi nhưng misleading. Nên đồng bộ hoặc extract thành shared constant.

**Fix** (option 1 — quickfix):
```tsx
// InputBar.tsx
<TextInput maxLength={2000} ... />
```

**Fix** (option 2 — proper):
```typescript
// packages/shared-types/src/constants.ts
export const CHAT_LIMITS = {
  USER_MESSAGE_MAX_LENGTH: 2000,
  EPHEMERAL_OOC_MAX_LENGTH: 500,
  PERSISTENT_OOC_MAX_LENGTH: 5000,
} as const;
```

Dùng `CHAT_LIMITS.USER_MESSAGE_MAX_LENGTH` trong cả client và server.

---

### [R10] 🟡 Error banner trong ChatRoomScreen bị ẩn khi đã có messages

**File**: `apps/mobile/src/features/chat/screens/ChatRoomScreen.tsx:135`

**Vấn đề**: Error banner chỉ hiện khi `messages.length === 0`. Nếu lỗi xảy ra giữa chat, user không thấy thông báo gì (sendMessage đã handle Alert riêng, nhưng `loadHistory` lỗi sau resume thì không).

```tsx
// HIỆN TẠI
{error && messages.length === 0 ? (
  <View style={styles.errorBanner}>...</View>
) : null}
```

**Fix**: Bỏ điều kiện `messages.length === 0`, thêm dismiss button:

```tsx
{error ? (
  <View style={styles.errorBanner}>
    <Text style={styles.errorText}>⚠️ {error?.message || 'Lỗi kết nối'}</Text>
    <TouchableOpacity onPress={() => set({ error: null })}>
      <Text style={styles.retryText}>✕</Text>
    </TouchableOpacity>
  </View>
) : null}
```

---

### [R11] 🟢 `MessageBubble` — case 'assistant' thiếu block scope

**File**: `apps/mobile/src/features/chat/components/MessageBubble.tsx:38`

**Vấn đề**: `const hasWords = ...` khai báo trực tiếp trong switch case không có `{}`. ESLint `no-case-declarations` sẽ báo lỗi.

```tsx
// HIỆN TẠI — lint error
case 'assistant':
  const hasWords = msg.words && msg.words.length > 0; // ← lỗi no-case-declarations
  return (...)
```

**Fix**: Wrap trong block scope:

```tsx
case 'assistant': {
  const hasWords = msg.words && msg.words.length > 0;
  return (...);
}
```

---

### [R12] 🟢 `useChat` hook — individual selectors thay vì shallow compare

**File**: `apps/mobile/src/features/chat/hooks/useChat.ts`

**Vấn đề**: 14 lần gọi `useChatStore((state) => state.X)` riêng lẻ. Zustand v4 đề xuất dùng `useShallow` hoặc grouped selector để giảm re-renders.

**Fix** (nếu upgrade Zustand v4):

```typescript
import { useShallow } from 'zustand/react/shallow';

export function useChat() {
  return useChatStore(
    useShallow((state) => ({
      sessionId: state.sessionId,
      messages: state.messages,
      // ... rest
    }))
  );
}
```

---

## 5. REFACTOR PRIORITY PLAN

### Sprint 1 — Trước khi test E2E (Blocking bugs)

| # | Issue | File | Effort |
|---|-------|------|--------|
| R1 | Fix `triggerMemory` hardcode | orchestrator.service.ts | 5 min |
| R2 | Move `getNextTurnOrder` vào transaction | orchestrator.service.ts | 15 min |
| R3 | Bỏ `writeLocks.delete` trong `cleanup` | history-store.service.ts | 5 min |
| R4 | Fix `toggleCharacter` JSONL type + PromptBuilder | controller + types + prompt-builder | 30 min |

### Sprint 2 — Trước merge → main

| # | Issue | File | Effort |
|---|-------|------|--------|
| R5 | Log warning cho session rehydration | chat-session.service.ts | 10 min |
| R6 | Fix retry message accumulation | llm.service.ts | 10 min |
| R7 | Remove `any` types | orchestrator.service.ts | 30 min |
| R8 | Đổi setOoc/toggleCharacter → 204 | chat.controller.ts | 10 min |
| R9 | Sync maxLength constant | shared-types + client | 20 min |

### Sprint 3 — Polish

| # | Issue | File | Effort |
|---|-------|------|--------|
| R10 | Error banner không phụ thuộc messages count | ChatRoomScreen.tsx | 10 min |
| R11 | Block scope trong switch case | MessageBubble.tsx | 2 min |
| R12 | useShallow trong useChat | useChat.ts | 10 min |

---

## 6. FILES CẦN THAY ĐỔI

| File | Issues |
|------|--------|
| `apps/server/src/modules/chat/services/chat-orchestrator.service.ts` | R1, R2, R7 |
| `apps/server/src/modules/chat/services/history-store.service.ts` | R3 |
| `apps/server/src/modules/chat/chat.controller.ts` | R4, R8 |
| `apps/server/src/modules/chat/types/history-entry.ts` | R4 |
| `apps/server/src/modules/chat/services/prompt-builder.service.ts` | R4 |
| `apps/server/src/modules/chat/services/chat-session.service.ts` | R5 |
| `apps/server/src/modules/chat/services/llm.service.ts` | R6 |
| `apps/mobile/src/features/chat/components/InputBar.tsx` | R9 |
| `apps/mobile/src/features/chat/screens/ChatRoomScreen.tsx` | R10 |
| `apps/mobile/src/features/chat/components/MessageBubble.tsx` | R11 |
| `apps/mobile/src/features/chat/hooks/useChat.ts` | R12 |
| `packages/shared-types/src/constants.ts` (tạo mới) | R9 |
