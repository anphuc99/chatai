# Review P07 - Task/P07 so với main

**Ngày review**: 2026-05-31  
**Nhánh review**: `Task/P07` so với `main`  
**Phạm vi**: `Task/Task/phase_07_end_chat_journal.md`, toàn bộ `Task/WorkPlan/P07_*`, và diff triển khai.

## Trạng Thái Review

- [x] P07.T1 EndChatService đã review
- [x] P07.T2 End endpoint + Idempotency-Key đã review
- [x] P07.T3 JournalModule đã review
- [x] P07.T4 Client end chat + journal screens đã review
- [x] P07.T5 Story progress display đã review

**Kết luận**: đã review đủ toàn bộ subtask P07, nhưng **chưa nên đánh implementation done**. Branch còn một số lỗi blocking cần sửa trước khi đóng Phase 07.

## Tóm Tắt

Branch đã triển khai đúng phần lớn bề mặt Phase 07: server end-chat orchestration, endpoint idempotency, journal APIs, mobile journal list/detail, end-chat navigation, và hiển thị story progress.

Điểm đúng quan trọng: code đã đi theo quyết định trong WorkPlan P07 rằng Phase 4 đã persist message realtime vào DB, nên EndChat không insert lại message từ JSONL. Tuy nhiên vẫn còn lỗi ở replay journal trên mobile, navigation sau khi end chat, xử lý empty session, và cursor pagination.

## Findings

### High - Journal detail mất `characterId`, khiến message nhân vật render thành narrator

File liên quan:
- `packages/shared-types/src/journal.ts`
- `packages/shared-types/src/chat.ts`
- `apps/mobile/src/features/chat/store/chat.store.ts`
- `apps/mobile/src/features/chat/components/MessageBubble.tsx`
- `apps/mobile/src/features/journal/screens/JournalDetailScreen.tsx`

Server journal detail trả về `id`, `characterId`, `turnOrder` trong `apps/server/src/modules/journal/dto/session-detail.dto.ts`. Nhưng shared type phía client lại dùng lại `MessageDto` cũ từ chat, type này không có `id`, `characterId`, `turnOrder`. Sau đó `mapDtoToChatMessage()` set mọi assistant history message thành `characterId: null`. `MessageBubble` đang coi `characterId == null` là narrator, nên journal replay sẽ render lời thoại nhân vật bằng `NarratorBubble`.

Tác động:
- Journal detail không replay đúng lịch sử chat đã lưu.
- Mất layout/avatar/tên nhân vật đúng.
- Tooltip từ vựng vẫn có thể hoạt động, nhưng hiển thị qua bubble narrator thay vì character bubble.

Hướng dẫn refactor:
- Tạo type riêng cho journal message ở shared-types, ví dụ `JournalMessageDto`.
- `JournalMessageDto` nên có đủ field: `id`, `role`, `characterId`, `characterName`, `text`, `translation`, `emotion`, `intensity`, `words`, `shopEvent`, `turnOrder`, `timestamp`.
- Đổi `SessionDetailDto.messages` trong `packages/shared-types/src/journal.ts` từ `MessageDto[]` sang `JournalMessageDto[]`.
- Cập nhật `mapDtoToChatMessage()` để giữ nguyên `id: dto.id` và `characterId: dto.characterId ?? null`.
- Không nên dùng điều kiện `characterId == null` để tự động xem là narrator, trừ khi backend contract định nghĩa rõ như vậy. Ưu tiên detect narrator bằng tín hiệu rõ hơn như `characterName === 'Narrator'` hoặc `role/subtype` riêng.
- Thêm test mapping journal detail: assistant có `characterId` phải render qua `CharacterBubble`; narrator mới render qua `NarratorBubble`.

### High - End-chat navigation để ChatRoom cũ còn mounted và có thể quay lại

File: `apps/mobile/src/features/chat/screens/ChatRoomScreen.tsx`

Sau khi end thành công, `doEnd()` gọi `navigation.navigate('Main', { screen: 'Journal', ... })`. Vì ChatRoom nằm trong Stories tab stack, thao tác này chỉ chuyển sang Journal tab, không replace/reset route ChatRoom cũ. Người dùng vẫn có thể quay lại Stories tab và thấy phòng chat đã ended với state cũ.

Tác động:
- User có thể quay lại màn hình ChatRoom của session đã kết thúc.
- Input hiện chỉ phụ thuộc `inputLocked`, chưa disable theo `ending`, nên vẫn có cửa tương tác trong lúc end.
- Lệch với WorkPlan P07.T4, nơi flow mong muốn là handoff sang JournalDetail bằng replace/reset.

Hướng dẫn refactor:
- Disable input khi đang end: `disabled={inputLocked || ending}`.
- Thêm loading overlay chặn tương tác trong lúc `ending === true`.
- Sau khi end thành công, gọi reset chat state trước hoặc sau navigation tùy kiến trúc store.
- Dùng `CommonActions.reset()` hoặc navigation action tương đương để reset root/tab state sang JournalDetail, tránh để ChatRoom còn trong back stack.
- Nếu muốn giữ Stories tab state, tối thiểu cần `replace` route ChatRoom hoặc điều hướng về StoryDetail thay vì để ChatRoom active.
- Bỏ `(navigation as any)` bằng typed root navigation helper để tránh sai route params mà TypeScript không bắt được.

### Medium - Empty session detection không khớp hành vi startup thực tế

File liên quan:
- `apps/server/src/modules/chat/services/end-chat.service.ts`
- `apps/server/src/modules/chat/services/chat-session.service.ts`

`EndChatService` chỉ coi session rỗng khi `historyStore.readAll(sid)` trả mảng rỗng. Nhưng `ChatSessionService.findOrStart()` đã ghi một entry `system` vào JSONL khi tạo session. Vì vậy user mở session rồi end ngay thường vẫn có 1 entry `system`, dẫn đến EndChat gọi LLM với nội dung thực tế gần như rỗng.

Tác động:
- Session không có hội thoại vẫn tốn LLM.
- Story progress có thể bị append summary vô nghĩa.
- Acceptance P07.T1 "Empty session -> no LLM call" chưa được đảm bảo.

Hướng dẫn refactor:
- Không detect empty bằng `entries.length === 0`.
- Detect bằng nội dung hội thoại có ý nghĩa:
  ```ts
  const hasConversation = entries.some(
    (e) => e.type === 'user' || e.type === 'assistant_batch',
  );
  ```
- Có thể kiểm tra thêm DB để chắc chắn:
  ```ts
  const messageCount = await prisma.message.count({ where: { sessionId: sid } });
  ```
- Nếu `!hasConversation && messageCount === 0`, end session bằng summary `'(Phiên trống)'`, không gọi LLM, không append story progress.
- Thêm unit test với JSONL chỉ có `system` entry: phải không gọi LLM, phải cleanup history, phải set session ended.

### Medium - Empty-session path thiếu cleanup và event nhất quán

File: `apps/server/src/modules/chat/services/end-chat.service.ts`

Nhánh empty-session hiện update session và cleanup OOC, nhưng không gọi `historyStore.cleanup()` và không emit `SESSION_ENDED` / `MEMORY_TRIGGER`. Với downstream Phase 11/12, `SESSION_ENDED` nên được emit nhất quán cho mọi session end thành công. `MEMORY_TRIGGER` có thể skip nếu empty session, nhưng cần document rõ.

Hướng dẫn refactor:
- Reuse `cleanup(sid)` trong nhánh empty để cleanup cả JSONL và OOC.
- Emit `SESSION_ENDED` cho mọi end thành công.
- Nếu empty session không trigger memory, thêm comment và test khẳng định không emit `MEMORY_TRIGGER`.
- Cache result empty session giống happy path để retry/idempotency trả nhanh.

### Medium - Cursor pagination của Journal chưa ổn định khi trùng `endedAt`

File: `apps/server/src/modules/journal/journal.service.ts`

List journal đang order theo `endedAt DESC` và cursor chỉ chứa `endedAt`. Vì `endedAt` dùng `Date.now()` theo millisecond, nhiều session có thể trùng timestamp. Query page tiếp theo dùng `endedAt < cursor`, nên có thể skip các row có cùng `endedAt` với item cuối của page trước.

Hướng dẫn refactor:
- Dùng composite order:
  ```ts
  orderBy: [{ endedAt: 'desc' }, { id: 'desc' }]
  ```
- Encode cursor gồm cả `endedAt` và `id`, ví dụ JSON base64url:
  ```ts
  { endedAt: "171...", id: "..." }
  ```
- Query page sau bằng điều kiện:
  ```ts
  OR: [
    { endedAt: { lt: cursorEndedAt } },
    { endedAt: cursorEndedAt, id: { lt: cursorId } },
  ]
  ```
- Thêm test có 2-3 sessions cùng `endedAt`, limit nhỏ, đảm bảo page 2 không bị skip hoặc duplicate.

### Low - Type response client `endSession` dùng `msgCount` thay vì `messageCount`

File: `apps/mobile/src/features/chat/services/chat.service.ts`

Server trả `messageCount`, nhưng mobile service type khai báo `msgCount`. UI hiện chỉ dùng `journalSessionId`, nên chưa vỡ flow, nhưng đây là mismatch contract.

Hướng dẫn refactor:
- Đưa `EndChatResult` vào shared-types.
- Mobile service dùng đúng:
  ```ts
  Promise<EndChatResult>
  ```
- Field nên là `messageCount`, `summary`, `journalSessionId`, `alreadyEnded`.

## Hướng Dẫn Refactor Theo Thứ Tự Ưu Tiên

1. Sửa journal DTO contract trước:
   - Tạo `JournalMessageDto`.
   - Preserve `id`, `characterId`, `turnOrder`.
   - Sửa mapping client và test render replay.

2. Sửa navigation end chat:
   - Disable input khi `ending`.
   - Thêm blocking overlay.
   - Reset/replace route để ChatRoom ended không còn trong stack.

3. Sửa empty-session flow server:
   - Detect conversation bằng entry type/message count.
   - Không gọi LLM nếu không có hội thoại.
   - Cleanup JSONL/OOC và emit `SESSION_ENDED` nhất quán.

4. Sửa journal pagination:
   - Composite cursor `endedAt + id`.
   - Test trùng timestamp.

5. Chuẩn hóa shared result type:
   - Shared `EndChatResult`.
   - Mobile dùng `messageCount`, không dùng `msgCount`.

## Coverage Theo Subtask

P07.T1:
- Đã có service, transaction update, append story progress, idempotent reconstruction, cleanup, events.
- Cần sửa empty/no-conversation path và event/cleanup consistency.

P07.T2:
- Endpoint và idempotency interceptor đã có.
- Targeted tests pass.
- Nên cân nhắc đưa endpoint/session/body hash vào idempotency cache key nếu client có khả năng reuse key sai request.

P07.T3:
- Journal list/detail APIs đã có và đã import vào `AppModule`.
- Targeted tests pass.
- Cần sửa cursor pagination để ổn định hơn.

P07.T4:
- Journal screens và end-chat call đã có.
- Cần sửa navigation reset/replace, loading overlay/input lock, và journal message DTO mapping.

P07.T5:
- Story progress section và focus refetch đã có.
- Subtask này cơ bản đạt, phụ thuộc P07.T1 không append progress vô nghĩa cho empty session.

## Kiểm Chứng Đã Chạy

```bash
node Memori/memori-query.mjs "review Phase 07 end chat journal Task/P07 so với main, kiểm tra WorkPlan P07"
git diff --name-status main...Task/P07
pnpm --filter @chatai/server typecheck
pnpm --filter @chatai/mobile typecheck
pnpm --filter @chatai/server run test -- --runInBand src/modules/chat/services/end-chat.service.spec.ts src/modules/journal/journal.service.spec.ts src/shared/idempotency/idempotency.interceptor.spec.ts
pnpm --filter @chatai/mobile run test -- --runInBand src/features/chat/store/__tests__/chat.store.test.ts
```

Kết quả:
- Server typecheck: pass.
- Server targeted tests: pass, 25 tests.
- Mobile targeted chat store tests: pass, 12 tests.
- Mobile typecheck: fail do các lỗi đang tồn tại ngoài diff P07:
  - `src/features/chat/components/OocPanel.tsx(203,21)`
  - `src/features/chat/store/__tests__/chat.store.test.ts(253,51)`
  - `src/features/chat/store/__tests__/chat.store.test.ts(265,51)`

Các lỗi mobile typecheck này vẫn nên được xử lý trước release, nhưng trong review diff hiện tại chúng không phải thay đổi trực tiếp của P07.
