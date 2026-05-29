# Phase 9 — Auto Chat + Shop Contextual

> **Mục tiêu**: User bật Auto mode → AI tự đóng vai cả user tiếp tục chat. Shop events xảy ra trong chat.  
> **Phụ thuộc**: Phase 8 (Memory RAG integrated).

---

## P9.T1 — Server: ChatOrchestrator.handleAutoTurn

**Status**: `[ ]`  
**Depends on**: P8.T5 (Phase 8 hoàn thành)

**Mô tả chi tiết**:
1. Thêm method vào `ChatOrchestratorService`:
   ```typescript
   async handleAutoTurn(ctx: ChatContext): Promise<AssistantBatch> {
     // Tương tự handleUserTurn nhưng:
     // 1. Không có userMessage từ client
     // 2. Thêm ephemeral OOC: "Tiếp tục câu chuyện tự nhiên. 
     //    Bạn có thể đóng vai user nếu cần để thúc đẩy cốt truyện."
     // 3. System prompt thêm chỉ dẫn: "Bạn được phép đóng vai User 
     //    hoặc tiếp tục đối thoại giữa các nhân vật mà không cần input."

     // Auto OOC injection
     const autoOOC = 'Hãy tự tiếp tục câu chuyện. Có thể đóng vai User hoặc để các nhân vật tương tác với nhau.';
     
     // Sử dụng lại pipeline của handleUserTurn
     // Với userMessage = "[AUTO]" hoặc empty
     // ephemeralOOC = autoOOC
     
     const result = await this.handleUserTurn(ctx, '[Chế độ tự động]', autoOOC);
     return result;
   }
   ```
2. Thêm endpoint trong `chat.controller.ts`:
   ```typescript
   @Post('sessions/:id/auto-continue')
   async autoContinue(@Param('id') id: string, @CurrentUser() user) {
     // Validate session active + ownership
     // Rate limit: 1 request/3s per session
     const ctx = { sessionId: id, userId: user.uid, storyId };
     const result = await this.orchestrator.handleAutoTurn(ctx);
     return result;
   }
   ```
3. Rate limiting cho auto: riêng biệt với manual (vì client sẽ gọi liên tục).

**Output kiểm chứng**:
- Gọi `/auto-continue` → nhận AssistantBatch hợp lệ, AI tự tạo dialogue.
- Gọi 10 lần liên tiếp → câu chuyện tiến triển tự nhiên.

---

## P9.T2 — Client: Auto Chat Mode UI + Loop Logic

**Status**: `[ ]`  
**Depends on**: P9.T1

**Mô tả chi tiết**:
1. Cập nhật `chat.store.ts`:
   ```typescript
   interface ChatState {
     // ... existing
     autoMode: boolean;
     autoLoopRef: NodeJS.Timeout | null;
     
     enterAutoMode: () => void;
     exitAutoMode: () => void;
   }
   ```
2. `enterAutoMode`:
   ```typescript
   enterAutoMode: () => {
     set({ autoMode: true, inputLocked: true });
     // Bắt đầu loop
     const loop = async () => {
       while (get().autoMode) {
         try {
           const batch = await chatService.postAutoContinue(get().sessionId);
           // Enqueue batch vào PlaybackQueue
           get().enqueueBatch(batch.messages);
           // Wait cho queue phát xong
           await get().waitForQueueFinish();
           
           // Check shop event
           if (batch.messages.some(m => m.shopEvent)) {
             get().exitAutoMode(); // Dừng auto khi có shop event
             break;
           }
           
           // Delay 2s giữa các lượt
           await new Promise(r => setTimeout(r, 2000));
         } catch (err) {
           get().exitAutoMode();
           break;
         }
       }
     };
     loop();
   }
   ```
3. `exitAutoMode`:
   ```typescript
   exitAutoMode: () => {
     set({ autoMode: false, inputLocked: false });
   }
   ```
4. UI: Auto Control Bar (trong ChatRoom):
   - Khi autoMode = false: Hiện nút "▶ Auto" bên cạnh InputBar.
   - Khi autoMode = true: Thay InputBar bằng:
     ```
     ┌─────────────────────────────────────┐
     │  🔄 Đang tự động...    [⏹ Dừng]    │
     └─────────────────────────────────────┘
     ```
   - Nút "Dừng" → `exitAutoMode()`.
5. Auto-exit conditions:
   - User nhấn Dừng.
   - Shop event xuất hiện.
   - Error (LLM down, rate limit).

**Output kiểm chứng**:
- Bật Auto → messages tự động xuất hiện, audio phát tuần tự.
- Nhấn Dừng → dừng ngay (sau lượt hiện tại kết thúc).
- Shop event → auto tắt, ShopChoiceCard hiện.

---

## P9.T3 — Server: ShopModule (Contextual Event + System Shop)

**Status**: `[ ]`  
**Depends on**: P9.T1

**Mô tả chi tiết**:
1. Thêm Prisma models (nếu chưa):
   ```prisma
   model ShopItem {
     id          String   @id
     name        String
     description String   @db.Text
     priceGems   Int      @map("price_gems")
     category    String   // "system" | "cosmetic"
     active      Boolean  @default(true)
     
     transactions ShopTransaction[]
     inventory    Inventory[]
     @@map("shop_items")
   }

   model ShopTransaction {
     id         String   @id @default(uuid())
     userId     String   @map("user_id")
     itemId     String   @map("item_id")
     pricePaid  Int      @map("price_paid")
     source     String   // "system_shop" | "contextual_event"
     sessionId  String?  @map("session_id")
     createdAt  DateTime @default(now()) @map("created_at")

     user UsersMeta @relation(fields: [userId], references: [uid])
     item ShopItem  @relation(fields: [itemId], references: [id])
     @@map("shop_transactions")
   }

   model Inventory {
     id         String   @id @default(uuid())
     userId     String   @map("user_id")
     itemId     String   @map("item_id")
     quantity   Int      @default(1)
     acquiredAt DateTime @default(now()) @map("acquired_at")

     user UsersMeta @relation(fields: [userId], references: [uid])
     item ShopItem  @relation(fields: [itemId], references: [id])
     @@unique([userId, itemId])
     @@map("inventory")
   }
   ```
2. Run migration: `npx prisma migrate dev --name add_shop_tables`.
3. Seed shop items:
   ```typescript
   // prisma/seed.ts
   const items = [
     { id: 'streak_freeze', name: 'Streak Freeze', description: 'Bảo vệ streak khi nghỉ 1 ngày', priceGems: 50, category: 'system', active: true },
     // Thêm items contextual: random events trong chat
   ];
   ```
4. Tạo `src/modules/shop/`:
   ```
   shop/
   ├── shop.module.ts
   ├── shop.controller.ts
   └── shop.service.ts
   ```
5. `shop.service.ts`:
   ```typescript
   @Injectable()
   export class ShopService {
     // Xử lý mua từ contextual event trong chat
     async applyContextualEvent(userId: string, itemName: string, price: number, choice: 'buy' | 'decline', sessionId: string): Promise<{ success: boolean, newBalance?: number }> {
       if (choice === 'decline') return { success: true };
       
       // Check gem balance
       const user = await this.prisma.usersMeta.findUnique({ where: { uid: userId } });
       if (user.gems < price) throw new PaymentRequiredException('NOT_ENOUGH_GEMS');
       
       // Transaction: deduct gems + create transaction + upsert inventory
       await this.prisma.$transaction([
         this.prisma.usersMeta.update({ where: { uid: userId }, data: { gems: { decrement: price } } }),
         this.prisma.shopTransaction.create({ data: { userId, itemId: itemName, pricePaid: price, source: 'contextual_event', sessionId } }),
         // Inventory upsert...
       ]);
       
       // Emit event
       this.eventEmitter.emit('GEM_SPENT', { userId, amount: price, source: 'contextual_event' });
       
       return { success: true, newBalance: user.gems - price };
     }

     // Mua từ System Shop
     async buy(userId: string, itemId: string): Promise<{ newBalance: number }> { ... }
   }
   ```

**Output kiểm chứng**:
- Contextual buy: gems giảm, inventory tăng, transaction logged.
- Not enough gems → 402 error.
- Decline → no change, narration continues.

---

## P9.T4 — Server: Chat Shop-Choice Endpoint + Narration Branch

**Status**: `[ ]`  
**Depends on**: P9.T3

**Mô tả chi tiết**:
1. Thêm endpoint vào `chat.controller.ts`:
   ```typescript
   @Post('sessions/:id/shop-choice')
   async shopChoice(@Param('id') id, @Body() dto: ShopChoiceDto, @CurrentUser() user) {
     // dto: { choice: 'buy' | 'decline' }
     
     // 1. Lấy shop_event từ last assistant message (trong .jsonl)
     const lastBatch = await this.historyStore.getLastAssistantBatch(id);
     const shopMsg = lastBatch.messages.find(m => m.shopEvent);
     if (!shopMsg) throw new BadRequestException('No pending shop event');
     
     // 2. Process purchase
     let purchaseResult = null;
     if (dto.choice === 'buy') {
       purchaseResult = await this.shopService.applyContextualEvent(
         user.uid, shopMsg.shopEvent.itemName, shopMsg.shopEvent.price, 'buy', id
       );
     }
     
     // 3. Generate narration response based on choice
     const narrativeOOC = dto.choice === 'buy'
       ? `[User đã mua ${shopMsg.shopEvent.itemName}. Narrator mô tả user nhận được vật phẩm.]`
       : `[User từ chối mua. Narrator mô tả user bỏ qua và tiếp tục.]`;
     
     // 4. Gọi orchestrator với ephemeral OOC
     const result = await this.orchestrator.handleUserTurn(
       { sessionId: id, userId: user.uid, storyId: session.storyId },
       dto.choice === 'buy' ? '好，我买了' : '不用了，谢谢',
       narrativeOOC
     );
     
     return result;
   }
   ```
2. `ShopChoiceDto`:
   ```typescript
   export class ShopChoiceDto {
     @IsEnum(['buy', 'decline']) choice: 'buy' | 'decline';
   }
   ```

**Output kiểm chứng**:
- Shop event xuất hiện → user chọn buy → gems giảm, narration tiếp tục mô tả mua hàng.
- User decline → narration tiếp tục hướng khác.
- Không đủ gems + chọn buy → 402.

---

## P9.T5 — Client: ShopChoiceCard UI + Chat Integration

**Status**: `[ ]`  
**Depends on**: P9.T4, P9.T2

**Mô tả chi tiết**:
1. Tạo `src/features/chat/components/ShopChoiceCard.tsx`:
   ```
   ┌─────────────────────────────────────┐
   │  🛍️ Cửa hàng trong game            │
   │                                     │
   │  Vật phẩm: Vòng bảo hộ             │
   │  Giá: 15 💎                         │
   │                                     │
   │  [💎 Mua]     [❌ Không, cảm ơn]   │
   │                                     │
   │  Số dư hiện tại: 120 💎             │
   └─────────────────────────────────────┘
   ```
2. Logic hiển thị:
   - Khi message có `shopEvent != null` → hiện ShopChoiceCard thay vì bubble thường.
   - Lock input (không cho gõ text khi đang chờ choice).
3. Khi user chọn:
   - Loading state trên card.
   - Gọi `POST /chat/sessions/:id/shop-choice { choice }`.
   - Nhận AssistantBatch → enqueue vào PlaybackQueue.
   - Xoá ShopChoiceCard, unlock input.
4. Insufficient gems:
   - Nếu API trả 402 → hiện Toast "Bạn cần thêm X gems".
   - Disable nút "Mua", chỉ còn "Không, cảm ơn".
5. Cập nhật `chat.store.ts`:
   ```typescript
   interface ChatState {
     // ... existing
     isChoiceState: boolean;
     pendingShopEvent: ShopEvent | null;
     
     confirmShopChoice: (choice: 'buy' | 'decline') => Promise<void>;
   }
   ```

**Output kiểm chứng**:
- Shop event → card hiện, input locked.
- Buy thành công → narration tiếp, gems giảm trong UI.
- Decline → narration khác nhánh.
- Auto mode running + shop event → auto dừng, card hiện.

---
