---
date: 2026-06-01
---
# Task: P09_R Refactor — Auto Chat + Shop Contextual fixes

> Áp dụng các finding F1–F10 trong [P09_R_review_refactor.md](../../Task/WorkPlan/P09_R_review_refactor.md).
> Ngày: 2026-06-01

## Tóm tắt thay đổi

### Server
- **F1 — Unify lock**: `autoContinue` và `shopChoice` giờ dùng chung `chat:lock:${sid}` (trước đây `chat:auto-lock` / `chat:shop-lock`). Toàn bộ lượt ghi của một session được serialize. Thêm `@@unique([sessionId, turnOrder])` trong [schema.prisma](../../apps/server/prisma/schema.prisma) (thay cho `@@index`) để corruption thứ tự trở thành lỗi rõ ràng. Migration: `20260601120000_unique_turn_order_starter_gems`.
- **F2 — Mua hàng nguyên tử**: trong `shopChoice` (buy), thứ tự mới = `applyContextualEvent` → `markConsumed` → **try** `handleUserTurn`. Nếu narration lỗi sau khi đã trừ gem, trả `{ messages: [], triggerMemory: false, narrationFailed: true }` thay vì ném lỗi (không strand thẻ, không double-charge). Decline: narration trước, `markConsumed` sau.
- **F3 — Server guard**: thêm `ShopEventResolverService.hasPendingShopEvent(sid)` (non-throwing). `sendMessage` và `autoContinue` từ chối bằng `ERR.SHOP_EVENT_PENDING` (409, mới thêm vào registry) khi còn shop event chưa giải quyết.
- **F5 — Stable item id**: `applyContextualEvent` tạo id ổn định `contextual:<slug>-<sha1[0:8]>` từ display name (helper `contextualItemId`), lưu display name vào cột `name` thay vì dùng làm PK.
- **F6 — Skip RAG**: `handleUserTurn` nhận `opts.skipMemory`; auto turn (`isAuto`) và shop-choice turn bỏ qua `safeRetrieveMemory` (truyền `''`) để tránh embed chuỗi placeholder/canned.
- **F8 — `toItemDto`**: đổi thành arrow field để không mất `this`.
- **F9 — `replaceAll`**: template shop-choice dùng `replaceAll('{{ITEM}}'|'{{PRICE}}', ...)`.
- **F10 — Starter gems**: `UsersMeta.gems` default `0` → `100`; migration backfill rows `gems = 0` → `100` (Postgres là source-of-truth ví, cho phép nghiệm thu shop end-to-end).

### Mobile
- **F2 (client)**: nhánh lỗi generic trong `confirmShopChoice` reset `isChoiceState`/`pendingShopEvent`/`inputLocked` thay vì để thẻ kẹt.
- **F3 (client)**: nút "▶ Auto" thêm `isChoiceState` vào điều kiện `disabled`/style.
- **F4 — Listener leak**: `_delay` gắn abort listener bằng `{ once: true }` + `removeEventListener`; xóa `_raceAbort`.
- **F7 — Cancelable wait**: `PlaybackQueueManager.waitForQueueFinish(signal?)` tự gỡ resolver khỏi `queueFinishResolvers` khi abort; auto-loop gọi `waitForQueueFinish(signal)` trực tiếp.

## Gotchas / Regression risks
- Migration `unique([sessionId, turnOrder])` sẽ **fail nếu DB hiện có message trùng turnOrder** — cần kiểm tra trước khi apply trên dữ liệu cũ.
- F2 buy: re-entry an toàn nhờ `markConsumed` ngay sau khi purchase commit; narration là best-effort.
- `narrationFailed: true` là field phụ trong response shop-choice; client hiện chỉ cần `messages` rỗng để clear thẻ — không bắt buộc đọc cờ này.
- Test suites memory (`@nestjs/bullmq`, `bullmq`, `p-limit`) fail do thiếu dependency trong môi trường — không liên quan refactor; 209 test chạy được đều pass, mobile typecheck sạch.
