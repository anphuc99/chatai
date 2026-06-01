# P09 — Review & Refactor: Auto Chat + Shop Contextual

> **Phạm vi review**: `Task/P09` so với `main`
> **Tài liệu nguồn**: [phase_09_auto_shop.md](../Task/phase_09_auto_shop.md) + các subtask `P09_T1..T5` trong [Task/WorkPlan/](.)
> **Tham chiếu Memori**: `task_p09_t1_auto_chat_orchestrator.md`, `task_p09_t2_auto_mode_ui.md`, `task_p09_t3_shop_module.md`, `task_p09_t4_shop_choice_endpoint.md`, `task_p09_t5_shop_choice_card_ui.md`
> **Người review**: Senior review (AI) — ngày 2026-06-01

---

## 1. Tổng quan

Phase 9 thêm 2 nhóm tính năng lớn:

1. **Auto Chat** — endpoint `POST /chat/sessions/:sid/auto-continue`, `handleAutoTurn`, rate-limiter per-session, UI Auto Mode (loop client-side, AutoControlBar, app-state auto exit).
2. **Shop** — `ShopModule` (system shop + contextual event), endpoint `POST /chat/sessions/:sid/shop-choice`, `ShopChoiceCard`, `wallet.store`, Prisma models `ShopItem` / `ShopTransaction` / `Inventory`.

**Điểm tốt:**

- Cấu trúc module sạch, tuân thủ pattern `controller → service → Prisma` của repo.
- `doPurchase` gói toàn bộ trừ gem + transaction + upsert inventory trong một `prisma.$transaction` → atomic đúng.
- Pattern double-check (pre-check + re-check trong lock) cho shop event là tư duy đúng.
- `waitForQueueFinish()` flush resolver ở cả `playNext()` lẫn `stop()` — tránh treo loop, xử lý đúng theo ghi chú Memori.
- Có unit test cho `AutoRateLimiterService` và `ShopService`.
- Shared-types, events, error registry được cập nhật đồng bộ (không hard-code).

Tuy nhiên có **một số lỗi đúng đắn (correctness) nghiêm trọng** liên quan đến đồng bộ hóa (locking), tính nguyên tử của giao dịch mua hàng, và rò rỉ listener. Chi tiết bên dưới, xếp theo mức độ.

---

## 2. Findings (xếp theo mức độ nghiêm trọng)

### 🔴 F1 — Ba khóa (lock) khác nhau phá vỡ tuần tự hóa lượt chat trên cùng session

**File**: [chat.controller.ts](../../apps/server/src/modules/chat/chat.controller.ts) (auto-continue `chat:auto-lock:${sid}`, shop-choice `chat:shop-lock:${sid}`) vs send thường `chat:lock:${sid}`.

Cả 3 endpoint (`sendMessage`, `autoContinue`, `shopChoice`) đều gọi `handleUserTurn`/`handleAutoTurn` → cùng append vào file `.jsonl` và cùng tính `turnOrder` qua `MAX(turnOrder)+1` trong `persistMessages`. Nhưng mỗi endpoint dùng **một khóa Redis riêng**, nên chúng **không loại trừ lẫn nhau**.

Memori `task_p09_t1` ghi rõ chủ đích "dùng key riêng để manual và auto không block lẫn nhau" — đây chính là **giả định sai**: chúng PHẢI chặn nhau vì ghi cùng tài nguyên.

**Kịch bản lỗi**: Request auto-continue còn đang xử lý (đang giữ `chat:auto-lock`), user nhấn Dừng rồi gửi tin nhắn thường (`chat:lock`) — hoặc shop-choice chạy song song. Hai `persistMessages` chạy đồng thời, cùng đọc `MAX(turnOrder)=N`, cùng tạo message ở `turnOrder=N+1`. Vì [schema.prisma](../../apps/server/prisma/schema.prisma) chỉ có `@@index([sessionId, turnOrder])` **chứ không phải `@@unique`**, DB **không báo lỗi** → hai lượt chèn trùng `turnOrder`, lịch sử hội thoại sai thứ tự (corruption âm thầm), và 2 lần gọi LLM tốn phí.

**Hướng refactor**: Dùng **chung một khóa** `chat:lock:${sid}` cho cả ba endpoint (auto + shop + send). Việc serialize toàn bộ lượt ghi của một session là bất biến cốt lõi; auto và manual cần xếp hàng, không chạy song song. Nếu muốn auto không "kẹt" sau manual, hãy để client tự dừng auto trước khi cho gửi tay (đã làm) — nhưng server vẫn phải là nguồn xác thực bằng cùng một lock. (Tùy chọn bổ sung: thêm `@@unique([sessionId, turnOrder])` để biến corruption âm thầm thành lỗi rõ ràng.)

---

### 🔴 F2 — Mua hàng + narration không nguyên tử: mất gem khi orchestrator lỗi

**File**: [chat.controller.ts](../../apps/server/src/modules/chat/chat.controller.ts) — hàm `shopChoice`, thứ tự: `applyContextualEvent('buy')` → `markConsumed()` → `handleUserTurn()`.

Gem được trừ và event được đánh dấu **consumed** *trước khi* gọi orchestrator. Nếu `handleUserTurn` ném lỗi (LLM down, parse fail sau 2 retry, lỗi DB) thì:

- Gem đã bị trừ + inventory đã tăng (transaction shop đã commit).
- `markConsumed` đã set → event không còn pending.
- Client nhận lỗi generic → trong [chat.store.ts](../../apps/mobile/src/features/chat/store/chat.store.ts) `confirmShopChoice`, nhánh `else` **không reset `isChoiceState`** → thẻ ShopChoiceCard kẹt lại; user bấm Mua lại → server trả `SHOP_EVENT_ALREADY_RESOLVED` (409). Kết quả: **user đã trả gem nhưng không có narration và không thể thử lại**.

**Kịch bản lỗi**: User chọn Mua khi LLM tạm lỗi → trừ 15 gem, không có phản hồi truyện, thẻ kẹt, bấm lại báo "đã xử lý".

**Hướng refactor**:
- Gọi `markConsumed` **sau khi** `handleUserTurn` thành công (chấp nhận rủi ro re-entry nhỏ — đã có lock bảo vệ trong cửa sổ này).
- Hoặc tách bước narration ra khỏi đường mua: nếu narration lỗi, vẫn trả về `BuyResultDto` thành công cho client (đã mua xong) kèm cờ `narrationFailed`, để client tự hiển thị fallback thay vì coi như giao dịch thất bại.
- Đồng thời ở client, nhánh `else` của `confirmShopChoice` nên reset `isChoiceState`/`pendingShopEvent` (hoặc cho phép retry narration) thay vì để thẻ kẹt.

---

### 🟠 F3 — Nút "▶ Auto" không bị khóa khi đang chờ shop-choice → mồ côi shop event

**File**: [ChatRoomScreen.tsx:341](../../apps/mobile/src/features/chat/screens/ChatRoomScreen.tsx#L341) — `disabled={inputLocked || ending}` (thiếu `isChoiceState`).

Khi shop event đang pending: `exitAutoMode()` đặt `inputLocked=false` nhưng `isChoiceState=true`. InputBar (text) được khóa đúng nhờ `inputLocked || isChoiceState || ending` ([dòng 337](../../apps/mobile/src/features/chat/screens/ChatRoomScreen.tsx#L337)), **nhưng nút Auto chỉ kiểm tra `inputLocked || ending`** → vẫn bấm được.

**Kịch bản lỗi**: Shop card đang hiện, user bấm "▶ Auto" → `auto-continue` chạy, sinh assistant_batch mới → batch mới trở thành "last assistant batch". `findPendingShopEvent` giờ đọc batch mới (không có shopEvent) → khi user bấm Mua, server trả `NO_PENDING_SHOP_EVENT` (400). Shop event cũ bị mồ côi, luồng mua hỏng.

**Hướng refactor**:
- Client: thêm `isChoiceState` vào điều kiện disable của nút Auto: `disabled={inputLocked || isChoiceState || ending}`.
- Server (phòng thủ chiều sâu): `autoContinue` và `sendMessage` nên kiểm tra có shop event đang pending chưa giải quyết hay không (qua `shopEventResolver.findPendingShopEvent` không-ném hoặc một cờ trong session) và từ chối với lỗi rõ ràng thay vì âm thầm ghi đè.

---

### 🟠 F4 — Rò rỉ listener `abort` trong vòng lặp auto (MaxListeners + leak timer)

**File**: [chat.store.ts](../../apps/mobile/src/features/chat/store/chat.store.ts) — `_delay` và `_raceAbort`.

Cả hai helper gọi `signal.addEventListener('abort', ...)` nhưng **không bao giờ gỡ** (`removeEventListener`) và không dùng `{ once: true }`. Mỗi vòng lặp auto gọi `_raceAbort` (1 lần) + `_delay` (1 lần) → 2 listener mới được gắn vào **cùng một `signal`** (một `AbortController` cho cả phiên auto).

**Kịch bản lỗi**: Sau ~5 lượt auto (>10 listener), React Native log `MaxListenersExceededWarning`; các listener đã resolve vẫn giữ tham chiếu tới closure/`setTimeout` đã xong → leak bộ nhớ tích lũy suốt phiên auto dài.

**Hướng refactor**:
```ts
function _delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); };
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
```
Áp dụng tương tự cho `_raceAbort` (gỡ listener khi `p` settle). Cân nhắc gom logic abort vào một util dùng chung.

---

### 🟠 F5 — Dùng tên hiển thị do LLM sinh làm Primary Key của `ShopItem`

**File**: [shop.service.ts](../../apps/server/src/modules/shop/shop.service.ts) — `applyContextualEvent`, nhánh auto-create `ShopItem` với `id: itemKey` (itemKey = `shopEvent.itemName`, tiếng Việt do LLM sinh, ví dụ "Chiếc váy hồng").

`itemName` cũng được dùng làm `msgId`/idempotency key trong [shop-event-resolver.service.ts](../../apps/server/src/modules/chat/services/shop-event-resolver.service.ts).

**Kịch bản lỗi (chi phí bảo trì/đúng đắn)**:
- LLM sinh cùng "vật phẩm" với tên hơi khác nhau → tạo nhiều dòng `shop_items` rác; cùng tên nhưng ý nghĩa khác → đụng PK, dùng giá cũ.
- `priceGems` lưu lần đầu nhưng giao dịch dùng `price` mới từ LLM → giá item trong bảng và giá thực trả lệch nhau (Memori đã ghi nhận nợ này).
- Idempotency key trùng `itemName` → nếu cùng tên xuất hiện 2 lần trong 1 session, key consumed đụng nhau.

**Hướng refactor**: Server nên gán một `id` ổn định (slug hóa + hash, hoặc `contextual:{uuid}`) và lưu `itemName` vào cột `name`/`metadata`; `shopEvent` trong batch nên mang một `id` riêng (sinh phía server khi persist) để client/idempotency dùng làm key thay vì tên hiển thị. Đây là vấn đề **altitude** — nên giải quyết ở tầng "shop event có định danh ổn định" thay vì vá bằng tên hiển thị.

---

### 🟡 F6 — Truy hồi memory (RAG) dùng chuỗi placeholder làm câu truy vấn

**File**: [chat-orchestrator.service.ts](../../apps/server/src/modules/chat/services/chat-orchestrator.service.ts) — `handleUserTurn` gọi `safeRetrieveMemory(ctx.userId, ctx.storyId, userMessage, ...)` với `userMessage = '[AUTO]'` (auto) hoặc `'好，我买了' / '不用了，谢谢'` (shop-choice).

**Kịch bản lỗi (chất lượng)**: Embedding của "[AUTO]" hay câu canned tiếng Trung không phản ánh ngữ cảnh truyện → memory context lấy về nhiễu/không liên quan, vừa tốn một lần embed + query Chroma vừa làm giảm chất lượng prompt cho đúng các lượt cần "đẩy cốt truyện".

**Hướng refactor**: Với auto turn và shop-choice, truyền câu truy vấn memory có ý nghĩa hơn — ví dụ text của assistant_batch gần nhất, hoặc bỏ qua truy hồi memory (truyền `''` để `safeRetrieveMemory` trả rỗng) khi không có input người dùng thực.

---

### 🟡 F7 — `_raceAbort` để lại resolver mồ côi trong `queueFinishResolvers`

**File**: [playback-queue.manager.ts](../../apps/mobile/src/features/chat/services/playback-queue.manager.ts) + `_raceAbort` trong [chat.store.ts](../../apps/mobile/src/features/chat/store/chat.store.ts).

Khi signal abort, `_raceAbort` reject nhưng resolver đã `push` vào `queueFinishResolvers` của manager **không được gỡ**, chỉ được flush ở lần `playNext()` (queue rỗng) hoặc `stop()` kế tiếp.

**Kịch bản lỗi**: Leak nhỏ; resolver giữ closure đến lần flush sau. Không gây sai logic nhưng tích lũy nếu abort nhiều lần.

**Hướng refactor**: `waitForQueueFinish` trả thêm hàm hủy đăng ký, hoặc `_raceAbort` gỡ resolver khi abort. Mức ưu tiên thấp.

---

### 🟡 F8 — `items.map(this.toItemDto)` dễ vỡ do mất `this`

**File**: [shop.service.ts](../../apps/server/src/modules/shop/shop.service.ts) — `listSystemItems` dùng `items.map(this.toItemDto)`.

Hiện chạy đúng **chỉ vì** `toItemDto` không tham chiếu `this`. Nếu sau này thêm `this.logger`/`this.config` vào trong nó → `undefined` runtime crash.

**Hướng refactor**: Chuyển `toItemDto` thành arrow field (`private toItemDto = (item) => ...`) hoặc `items.map((i) => this.toItemDto(i))`.

---

### 🟡 F9 — `String.replace('{{ITEM}}', ...)` chỉ thay lần đầu và diễn giải `$`

**File**: [chat.controller.ts](../../apps/server/src/modules/chat/chat.controller.ts) — `shopChoice`: `template.replace('{{ITEM}}', ...).replace('{{PRICE}}', ...)`.

`String.prototype.replace` với pattern chuỗi chỉ thay **lần xuất hiện đầu tiên**, và chuỗi thay thế diễn giải các ký tự `$&`, `$1`... Nếu template về sau dùng `{{ITEM}}` nhiều lần, hoặc `itemName` chứa `$`, kết quả sai.

**Hướng refactor**: Dùng `replaceAll('{{ITEM}}', itemName)` (hoặc replacer dạng hàm) để an toàn và rõ ý.

---

### 🟡 F10 — Gem hai nguồn (Firestore vs Postgres) chưa đồng bộ → mọi giao dịch contextual fail

**File**: [shop.service.ts](../../apps/server/src/modules/shop/shop.service.ts) (`UsersMeta.gems` Postgres, mặc định 0) — Memori `task_p09_t3` ghi nhận gem cũng tồn tại ở Firestore `UserDoc.gems`.

**Kịch bản lỗi**: `UsersMeta.gems` khởi tạo = 0 và chưa có cơ chế top-up/mission cộng vào Postgres → **mọi** lần "buy" (system lẫn contextual) đều ném `NOT_ENOUGH_GEMS` (402) cho tới khi P10/P11 đồng bộ. Điều này khiến tính năng shop **không kiểm chứng được end-to-end** ở Phase 9 (output kiểm chứng "gems giảm, inventory tăng" không chạy được trừ khi seed gem thủ công).

**Hướng refactor**: Trước khi đánh dấu Phase 9 hoàn tất, cần: (a) seed/migration nạp gem khởi điểm cho user test, hoặc (b) thống nhất một nguồn gem duy nhất (khuyến nghị Postgres là source-of-truth cho ví, Firestore chỉ mirror đọc). Ghi rõ đây là **blocker kiểm thử**, không chỉ là nợ kỹ thuật.

---

## 3. Checklist refactor (ưu tiên giảm dần)

- [ ] **F1**: Dùng chung `chat:lock:${sid}` cho `autoContinue` + `shopChoice` + `sendMessage`; cân nhắc `@@unique([sessionId, turnOrder])`.
- [ ] **F2**: Chuyển `markConsumed` ra sau `handleUserTurn` thành công (hoặc tách narration khỏi kết quả mua); client reset `isChoiceState` ở nhánh lỗi generic.
- [ ] **F3**: Thêm `isChoiceState` vào `disabled` của nút Auto; server từ chối auto/send khi còn shop event pending.
- [ ] **F4**: Gỡ listener `abort` (`{ once: true }` + `removeEventListener`) trong `_delay`/`_raceAbort`.
- [ ] **F5**: Sinh `id` ổn định cho `ShopItem` contextual + `id` cho `shopEvent`; tách tên hiển thị khỏi khóa.
- [ ] **F6**: Bỏ/đổi câu truy vấn memory cho auto & shop-choice turn.
- [ ] **F7**: Cho phép hủy đăng ký resolver trong `waitForQueueFinish`/`_raceAbort`.
- [ ] **F8**: Sửa `items.map(this.toItemDto)` để khỏi mất `this`.
- [ ] **F9**: Dùng `replaceAll` cho template shop-choice.
- [ ] **F10**: Seed/đồng bộ gem trước khi nghiệm thu shop end-to-end.

---

## 4. Kết luận

Kiến trúc và phân tách module của Phase 9 tốt, bám sát convention repo và có test. Tuy nhiên **F1 (lock tách rời)** và **F2 (mua hàng không nguyên tử)** là hai lỗi đúng đắn cần sửa **trước khi merge** vì gây hỏng dữ liệu hội thoại âm thầm và mất gem của user; **F3** gây hỏng luồng shop ngay trong thao tác bình thường của người dùng; **F10** chặn việc nghiệm thu thực tế. Các finding còn lại (F4–F9) nên xử lý trong cùng đợt refactor để tránh leak và nợ kỹ thuật tích lũy.
