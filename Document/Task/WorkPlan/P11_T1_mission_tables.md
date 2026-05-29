# P11.T1 — Mission Tables + Seed

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P11.T1 |
| Phase | 11 — Mission, Streak, Shop |
| Depends on | P10 hoàn thành |
| Complexity | Low |
| Risk | Low |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- Prisma `MissionTemplate`, `UserMission` (+ index `userId, forDate`).
- Seed 3 templates.
- Helpers: `startOfDay(date, timezone)` (UTC+7 mặc định).

---

## 3. FILES CẦN TẠO

| # | Path |
|---|------|
| 1 | `apps/server/prisma/schema.prisma` — thêm models |
| 2 | `apps/server/prisma/migrations/.../migration.sql` |
| 3 | `apps/server/prisma/seed.ts` — extend cho missions |
| 4 | `apps/server/src/common/util/date.ts` — `startOfDay`, `isSameDay`, `subDays` (TZ-aware) |

---

## 4. SCHEMA

```prisma
model MissionTemplate {
  id          String @id   // 'send_messages' | 'collect_words' | 'complete_review'
  title       String
  description String @db.Text
  target      Int
  rewardGems  Int    @map("reward_gems")
  active      Boolean @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  
  userMissions UserMission[]
  @@map("mission_templates")
}

model UserMission {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  templateId  String   @map("template_id")
  forDate     DateTime @map("for_date") @db.Date
  progress    Int      @default(0)
  status      String   @default("in_progress")  // 'in_progress' | 'completed' | 'claimed'
  completedAt DateTime? @map("completed_at")
  claimedAt   DateTime? @map("claimed_at")
  createdAt   DateTime @default(now()) @map("created_at")
  
  user     UsersMeta       @relation(fields: [userId], references: [uid], onDelete: Cascade)
  template MissionTemplate @relation(fields: [templateId], references: [id])
  
  @@unique([userId, templateId, forDate], name: "unique_user_template_date")
  @@index([userId, forDate])
  @@index([userId, status])
  @@map("user_missions")
}
```

Add to `UsersMeta`:
- `currentStreak Int @default(0)` (verify P01.T1)
- `highestStreak Int @default(0)`
- `lastStreakDate DateTime?`
- `streakFreezeCount Int @default(0)`

## 5. SEED

```ts
const templates = [
  { id: 'send_messages', title: 'Trò chuyện', description: 'Gửi 10 tin nhắn chat', target: 10, rewardGems: 5 },
  { id: 'collect_words', title: 'Thu thập từ vựng', description: 'Lưu 3 từ mới vào sổ', target: 3, rewardGems: 5 },
  { id: 'complete_review', title: 'Ôn tập từ vựng', description: 'Hoàn thành 1 phiên ôn tập', target: 1, rewardGems: 10 },
]
for t of templates: prisma.missionTemplate.upsert({ where:{id:t.id}, update:t, create:t })
```

## 6. DATE UTILS

```ts
const TZ_OFFSET_HOURS = 7  // ICT
function startOfDay(d = new Date()): Date {
  const local = new Date(d.getTime() + TZ_OFFSET_HOURS * 3600_000)
  local.setUTCHours(0,0,0,0)
  return new Date(local.getTime() - TZ_OFFSET_HOURS * 3600_000)
}
function isSameDay(a, b): boolean { return startOfDay(a).getTime() === startOfDay(b).getTime() }
function subDays(d, n): Date { return new Date(d.getTime() - n*86400_000) }
function dateKey(d): string { return startOfDay(d).toISOString().slice(0,10) }
```

---

## 7. ACCEPTANCE & TEST

- [ ] Migration apply ok.
- [ ] Seed creates 3 templates idempotent.
- [ ] Insert duplicate (userId, templateId, forDate) → conflict.
- [ ] Index hit cho `findMany where userId, forDate=today`.
- [ ] `startOfDay` returns 17:00 UTC previous day cho ICT (verify).
- [ ] `isSameDay` boundary at midnight ICT.
