# Phase 11 — Mission + Streak + System Shop

> **Mục tiêu**: Daily missions tracking, streak logic, system shop, realtime push updates.  
> **Phụ thuộc**: Phase 4 (USER_SENT_MESSAGE), Phase 7 (SESSION_ENDED), Phase 9 (Shop module), Phase 10 (USER_SAVED_WORD, USER_COMPLETED_REVIEW).

---

## P11.T1 — Database: Mission Tables + Seed

**Status**: `[ ]`  
**Depends on**: P10.T6 (Phase 10 hoàn thành)

**Mô tả chi tiết**:
1. Thêm Prisma models:
   ```prisma
   model MissionTemplate {
     id          String @id // "send_messages" | "collect_words" | "complete_review"
     title       String
     description String @db.Text
     target      Int    // Số lượng cần hoàn thành
     rewardGems  Int    @map("reward_gems")
     
     userMissions UserMission[]
     @@map("mission_templates")
   }

   model UserMission {
     id          String   @id @default(uuid())
     userId      String   @map("user_id")
     templateId  String   @map("template_id")
     forDate     DateTime @map("for_date") @db.Date // Ngày reset 00:00
     progress    Int      @default(0)
     status      String   @default("in_progress") // "in_progress" | "completed" | "claimed"
     completedAt DateTime? @map("completed_at")

     user     UsersMeta       @relation(fields: [userId], references: [uid])
     template MissionTemplate @relation(fields: [templateId], references: [id])

     @@unique([userId, templateId, forDate], name: "unique_user_template_date")
     @@index([userId, forDate])
     @@map("user_missions")
   }
   ```
2. Run migration: `npx prisma migrate dev --name add_missions`.
3. Seed mission templates:
   ```typescript
   const templates = [
     { id: 'send_messages', title: 'Trò chuyện', description: 'Gửi 10 tin nhắn chat', target: 10, rewardGems: 5 },
     { id: 'collect_words', title: 'Thu thập từ vựng', description: 'Lưu 3 từ mới vào sổ', target: 3, rewardGems: 5 },
     { id: 'complete_review', title: 'Ôn tập từ vựng', description: 'Hoàn thành 1 phiên ôn tập', target: 1, rewardGems: 10 },
   ];
   ```
4. Run seed: `npx prisma db seed`.

**Output kiểm chứng**:
- 3 templates trong DB.
- Unique constraint hoạt động (cùng user + template + date).

---

## P11.T2 — Server: Event Bus + MissionTracker

**Status**: `[ ]`  
**Depends on**: P11.T1

**Mô tả chi tiết**:
1. Setup NestJS EventEmitter:
   ```bash
   pnpm add @nestjs/event-emitter
   ```
   Trong `app.module.ts`: `EventEmitterModule.forRoot()`.
2. Tạo `src/modules/missions/`:
   ```
   missions/
   ├── missions.module.ts
   ├── missions.controller.ts
   ├── missions.service.ts
   └── mission-tracker.listener.ts
   ```
3. `mission-tracker.listener.ts`:
   ```typescript
   @Injectable()
   export class MissionTrackerListener {
     @OnEvent('USER_SENT_MESSAGE')
     async onMessageSent(payload: { userId: string }) {
       await this.missionsService.incrementProgress(payload.userId, 'send_messages');
     }

     @OnEvent('USER_SAVED_WORD')
     async onWordSaved(payload: { userId: string }) {
       await this.missionsService.incrementProgress(payload.userId, 'collect_words');
     }

     @OnEvent('USER_COMPLETED_REVIEW')
     async onReviewCompleted(payload: { userId: string }) {
       await this.missionsService.incrementProgress(payload.userId, 'complete_review');
     }
   }
   ```
4. `missions.service.ts`:
   ```typescript
   @Injectable()
   export class MissionsService {
     // Lazy ensure: tạo missions cho hôm nay nếu chưa có
     async ensureToday(userId: string): Promise<UserMission[]> {
       const today = startOfDay(new Date());
       const existing = await this.prisma.userMission.findMany({
         where: { userId, forDate: today }
       });
       if (existing.length > 0) return existing;
       
       // Tạo mới cho tất cả templates
       const templates = await this.prisma.missionTemplate.findMany();
       const missions = await Promise.all(
         templates.map(t => this.prisma.userMission.create({
           data: { userId, templateId: t.id, forDate: today }
         }))
       );
       return missions;
     }

     // Increment progress (với Redis lock tránh race condition)
     async incrementProgress(userId: string, templateId: string): Promise<void> {
       const lockKey = `mission:lock:${userId}:${templateId}:${today()}`;
       const acquired = await this.redis.acquireLock(lockKey, 5000);
       if (!acquired) return; // skip nếu đang process
       
       try {
         const today = startOfDay(new Date());
         let mission = await this.prisma.userMission.findUnique({
           where: { unique_user_template_date: { userId, templateId, forDate: today } }
         });
         
         if (!mission) {
           await this.ensureToday(userId);
           mission = await this.prisma.userMission.findUnique({
             where: { unique_user_template_date: { userId, templateId, forDate: today } }
           });
         }
         
         if (mission.status !== 'in_progress') return;
         
         const template = await this.prisma.missionTemplate.findUnique({ where: { id: templateId } });
         const newProgress = mission.progress + 1;
         const completed = newProgress >= template.target;
         
         await this.prisma.userMission.update({
           where: { id: mission.id },
           data: {
             progress: newProgress,
             status: completed ? 'completed' : 'in_progress',
             completedAt: completed ? new Date() : null
           }
         });
         
         if (completed) {
           this.eventEmitter.emit('MISSION_COMPLETED', { userId, missionId: mission.id, reward: template.rewardGems });
         }
       } finally {
         await this.redis.releaseLock(lockKey);
       }
     }

     // Claim reward
     async claim(userId: string, missionId: string): Promise<{ gemsEarned: number, newBalance: number }> {
       const mission = await this.prisma.userMission.findFirst({
         where: { id: missionId, userId, status: 'completed' },
         include: { template: true }
       });
       if (!mission) throw new BadRequestException('Mission not claimable');
       
       // Transaction: update mission status + add gems
       const result = await this.prisma.$transaction(async (tx) => {
         await tx.userMission.update({ where: { id: missionId }, data: { status: 'claimed' } });
         const user = await tx.usersMeta.update({
           where: { uid: userId },
           data: { gems: { increment: mission.template.rewardGems } }
         });
         return user;
       });
       
       // Sync gems to Firestore
       await this.usersService.syncToFirestore(userId, { gems: result.gems });
       
       // Emit
       this.eventEmitter.emit('GEM_EARNED', { userId, amount: mission.template.rewardGems, source: 'mission' });
       
       return { gemsEarned: mission.template.rewardGems, newBalance: result.gems };
     }
   }
   ```

**Output kiểm chứng**:
- Send message → mission progress +1.
- Progress reaches target → status = 'completed'.
- Claim → gems increase, status = 'claimed'.
- Race condition: 2 rapid messages → progress = 2 (not 1 or 3).

---

## P11.T3 — Server: StreakService + Daily Cron

**Status**: `[ ]`  
**Depends on**: P11.T2

**Mô tả chi tiết**:
1. Tạo `src/modules/missions/streak.service.ts`:
   ```typescript
   @Injectable()
   export class StreakService {
     // Gọi khi user thực hiện action đầu tiên trong ngày
     @OnEvent('USER_SENT_MESSAGE')
     @OnEvent('USER_COMPLETED_REVIEW')
     async tick(payload: { userId: string }): Promise<void> {
       const user = await this.prisma.usersMeta.findUnique({ where: { uid: payload.userId } });
       const today = startOfDay(new Date());
       const lastDate = user.lastStreakDate ? startOfDay(user.lastStreakDate) : null;
       
       if (lastDate && isSameDay(lastDate, today)) return; // Đã tick hôm nay rồi
       
       const yesterday = subDays(today, 1);
       let newStreak = user.currentStreak;
       
       if (lastDate && isSameDay(lastDate, yesterday)) {
         // Liên tiếp → tăng streak
         newStreak += 1;
       } else if (lastDate && !isSameDay(lastDate, yesterday)) {
         // Bỏ lỡ → check streak freeze
         if (user.streakFreezeCount > 0) {
           // Tiêu thụ freeze
           await this.prisma.usersMeta.update({
             where: { uid: payload.userId },
             data: { streakFreezeCount: { decrement: 1 } }
           });
         } else {
           // Reset streak
           newStreak = 1;
         }
       } else {
         // Lần đầu tiên
         newStreak = 1;
       }
       
       const newHighest = Math.max(newStreak, user.highestStreak);
       
       await this.prisma.usersMeta.update({
         where: { uid: payload.userId },
         data: { currentStreak: newStreak, highestStreak: newHighest, lastStreakDate: today }
       });
       
       // Sync to Firestore
       await this.usersService.syncToFirestore(payload.userId, { currentStreak: newStreak, highestStreak: newHighest });
       
       // Emit
       this.eventEmitter.emit('STREAK_UPDATED', { userId: payload.userId, current: newStreak, isNewHighest: newStreak > user.highestStreak });
     }
   }
   ```
2. Cron job check (optional — BullMQ scheduled):
   - Mỗi 00:05 UTC: check users có `lastStreakDate < yesterday AND streakFreezeCount > 0` → auto consume freeze.
   - Users có `lastStreakDate < yesterday AND streakFreezeCount = 0` → reset streak = 0.
   - (Hoặc lazy check: chỉ check khi user mở app — đơn giản hơn cho solo dev).

**Output kiểm chứng**:
- User action ngày mới → streak +1.
- Skip 1 ngày + có freeze → streak giữ, freeze -1.
- Skip 1 ngày + không freeze → streak reset.

---

## P11.T4 — Server: Mission + Streak + Shop Endpoints

**Status**: `[ ]`  
**Depends on**: P11.T2, P11.T3

**Mô tả chi tiết**:
1. `missions.controller.ts`:
   ```typescript
   @Controller('missions')
   export class MissionsController {
     @Get('today')
     async getToday(@CurrentUser() user) {
       const missions = await this.missionsService.ensureToday(user.uid);
       return missions; // Include template info
     }

     @Post(':id/claim')
     async claim(@Param('id') id, @CurrentUser() user) {
       return this.missionsService.claim(user.uid, id);
     }
   }
   ```
2. Streak endpoint (có thể ở users hoặc riêng):
   ```typescript
   @Get('streak')
   async getStreak(@CurrentUser() user) {
     const meta = await this.prisma.usersMeta.findUnique({ where: { uid: user.uid } });
     return { current: meta.currentStreak, highest: meta.highestStreak, freezes: meta.streakFreezeCount, lastDate: meta.lastStreakDate };
   }
   ```
3. Shop endpoints (`shop.controller.ts`):
   ```typescript
   @Controller('shop')
   export class ShopController {
     @Get('items')
     async listItems() {
       return this.shopService.listActive();
     }

     @Post('buy')
     async buy(@Body() dto: BuyDto, @CurrentUser() user) {
       return this.shopService.buy(user.uid, dto.itemId);
     }

     @Get('inventory')
     async getInventory(@CurrentUser() user) {
       return this.shopService.getInventory(user.uid);
     }
   }
   ```
4. `shopService.buy`:
   - Check balance ≥ price.
   - Deduct gems, create transaction, upsert inventory.
   - Special: `streak_freeze` → increment `streakFreezeCount` trực tiếp.

**Output kiểm chứng**:
- `GET /missions/today` → 3 missions.
- `POST /missions/:id/claim` → gems increase.
- `POST /shop/buy { itemId: 'streak_freeze' }` → streakFreezeCount +1, gems decrease.

---

## P11.T5 — Server: SSE Realtime Push

**Status**: `[ ]`  
**Depends on**: P11.T2

**Mô tả chi tiết**:
1. Tạo `src/modules/realtime/`:
   ```
   realtime/
   ├── realtime.module.ts
   ├── realtime.controller.ts
   └── realtime.gateway.ts    # hoặc SSE approach
   ```
2. SSE endpoint:
   ```typescript
   @Controller('realtime')
   export class RealtimeController {
     @Sse('stream')
     stream(@CurrentUser() user): Observable<MessageEvent> {
       // Tạo Subject per user
       // Subscribe to domain events → filter by userId → push
       return this.realtimeService.getUserStream(user.uid);
     }
   }
   ```
3. `realtime.service.ts`:
   ```typescript
   @Injectable()
   export class RealtimeService {
     private userStreams: Map<string, Subject<MessageEvent>> = new Map();

     getUserStream(userId: string): Observable<MessageEvent> {
       if (!this.userStreams.has(userId)) {
         this.userStreams.set(userId, new Subject());
       }
       return this.userStreams.get(userId).asObservable();
     }

     @OnEvent('MISSION_COMPLETED')
     onMissionCompleted(payload) {
       this.push(payload.userId, { type: 'MISSION_COMPLETED', data: payload });
     }

     @OnEvent('GEM_EARNED')
     onGemEarned(payload) {
       this.push(payload.userId, { type: 'GEM_UPDATED', data: payload });
     }

     @OnEvent('STREAK_UPDATED')
     onStreakUpdated(payload) {
       this.push(payload.userId, { type: 'STREAK_UPDATED', data: payload });
     }

     private push(userId: string, event: any) {
       const stream = this.userStreams.get(userId);
       if (stream) stream.next({ data: JSON.stringify(event) } as MessageEvent);
     }
   }
   ```
4. Client subscriber:
   - `EventSource` hoặc `fetch` with streaming.
   - Reconnect on disconnect.
   - Parse events → dispatch to relevant stores.

**Output kiểm chứng**:
- Client connected to SSE → send message → receive MISSION progress update in realtime.
- Claim mission → receive GEM_UPDATED event.
- Streak tick → receive STREAK_UPDATED.

---

## P11.T6 — Client: Mission Widget + Streak + Shop Screen

**Status**: `[ ]`  
**Depends on**: P11.T4, P11.T5

**Mô tả chi tiết**:
1. **HomeScreen** widget:
   ```
   ┌──────────────────────────────────────┐
   │  🔥 Streak: 7 ngày      💎 120 gems │
   │                                      │
   │  📋 Nhiệm vụ hôm nay:               │
   │  ✅ Trò chuyện (10/10)  [Nhận 5💎]  │
   │  🔄 Thu thập từ (2/3)               │
   │  ⬜ Ôn tập (0/1)                    │
   └──────────────────────────────────────┘
   ```
2. `src/features/mission/store/mission.store.ts`:
   ```typescript
   interface MissionState {
     missions: UserMission[];
     fetchToday: () => Promise<void>;
     claim: (missionId: string) => Promise<void>;
     onProgressEvent: (event: SSEEvent) => void;
   }
   ```
3. `src/features/home/screens/HomeScreen.tsx`:
   - Streak fire animation (react-native-reanimated): pulse effect khi streak > 0.
   - Missions list với progress bars.
   - Nút "Nhận" khi mission completed → claim → confetti animation.
   - Gems counter animated khi giá trị thay đổi.
4. **ShopScreen** (`src/features/shop/screens/ShopScreen.tsx`):
   - List shop items (từ API).
   - Mỗi item: name, description, price, nút "Mua".
   - Current balance hiển thị trên header.
   - Mua → confirm alert → API call → update balance.
   - Inventory section: "Vật phẩm đã mua" (streak freezes count, etc).
5. **SSE Client integration**:
   ```typescript
   // src/services/realtime.service.ts
   class RealtimeClient {
     private eventSource: EventSource;
     
     connect(token: string) {
       this.eventSource = new EventSource(`${BASE_URL}/realtime/stream`, {
         headers: { Authorization: `Bearer ${token}` }
       });
       this.eventSource.onmessage = (event) => {
         const data = JSON.parse(event.data);
         switch (data.type) {
           case 'MISSION_COMPLETED': missionStore.onProgressEvent(data); break;
           case 'GEM_UPDATED': authStore.updateGems(data.data.newBalance); break;
           case 'STREAK_UPDATED': streakStore.update(data.data); break;
         }
       };
     }
   }
   ```
6. Confetti animation (on claim): `react-native-reanimated` hoặc `lottie-react-native`.

**Output kiểm chứng**:
- Home hiện missions với progress realtime.
- Claim → gems animate tăng + confetti.
- Streak hiện đúng + fire animation.
- Shop: mua streak freeze → inventory update, gems giảm.

---
