# P02.R — Refactor & Review Fixes (Post-Review Phase 2) ✅ DONE

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P02.R |
| Phase | 2 — Post-Review |
| Depends on | P02.T1–T6 hoàn thành |
| Complexity | Medium |
| Risk | High (security fixes) |
| Created | 2026-05-30 |

---

## 2. MỤC TIÊU

Fix các issues phát hiện từ Senior Code Review Phase 2, trước khi merge `Task/P02` → `main`.

**Ưu tiên**:
1. 🔴 Critical — BLOCKING merge
2. 🟠 High — Nên fix trước merge
3. 🟡 Medium — Fix sau merge, trước P03
4. 🟢 Low — Nice to have

---

## 3. TASK GROUPS

### R1: Fix Critical Security Issues 🔴 BLOCKING

**Files cần sửa**:
| # | File | Thay đổi |
|---|------|----------|
| 1 | `packages/shared-types/src/story.ts` | Bỏ `userId` khỏi `StoryDto` |
| 2 | `apps/server/src/modules/stories/stories.service.ts` | Refactor `getById()` ownership check + `toDto()` |
| 3 | `apps/server/src/modules/characters/dto/create-character.dto.ts` | Thêm `@MaxLength` |
| 4 | `apps/server/src/modules/characters/characters.service.ts` | Bỏ `as any` cast |
| 5 | `apps/server/src/shared/ownership/ownership.service.ts` | Bỏ `as any` cast |

#### R1.1 — Bỏ `userId` khỏi `StoryDto`
- [ ] Xoá field `userId` trong `packages/shared-types/src/story.ts`
- [ ] Xoá `userId: row.userId` trong `StoriesService.toDto()`
- [ ] Verify mobile code không dùng `story.userId` ở đâu
- [ ] Chạy TypeScript check: `npx tsc --noEmit` ở cả server + mobile

#### R1.2 — Refactor `getById()` ownership check
- [ ] Move `assertOwnership()` vào **trước** `cacheWrap()` hoặc include `uid` trong cache key
- [ ] Pattern recommended:
  ```typescript
  async getById(uid: string, id: string): Promise<StoryDto> {
    await this.assertOwnership(uid, id);
    const cacheKey = `${REDIS_PREFIX.STORY_CACHE}${id}`;
    return this.redis.cacheWrap(cacheKey, REDIS_TTL, async () => {
      const row = await this.prisma.story.findUnique({ ... });
      return this.toDto(row);
    });
  }
  ```

#### R1.3 — Thêm `@MaxLength` validation
- [ ] `CreateCharacterDto`: `@MaxLength(50)` cho `name`, `@MaxLength(3000)` cho `personality`
- [ ] `UpdateCharacterDto`: Tương tự (mỗi field có `@IsOptional()` + `@MaxLength`)

#### R1.4 — Loại bỏ `as any` cast
- [ ] Verify `PrismaService extends PrismaClient` hoạt động
- [ ] Replace `(this.prisma as any).character.*` → `this.prisma.character.*`
- [ ] Replace `(this.prisma as any).story.*` → `this.prisma.story.*` (nếu có)
- [ ] Chạy `npx tsc --noEmit` verify không lỗi

---

### R2: Fix High Priority Issues 🟠

#### R2.1 — `sharp` import tĩnh
- [ ] Thêm `sharp` vào `package.json` devDependencies (hoặc dependencies)
- [ ] Import tĩnh: `import sharp from 'sharp'`
- [ ] Giữ try/catch cho trường hợp sharp build fails trên platform cụ thể

#### R2.2 — Response DTO classes
- [ ] Tạo `apps/server/src/modules/stories/dto/story-response.dto.ts`
  - Class `StoryResponseDto` implements `StoryDto` với `@Expose()` decorators
- [ ] Tạo `apps/server/src/modules/characters/dto/character-response.dto.ts`
  - Class `CharacterResponseDto` implements `CharacterDto`
- [ ] Thêm `ClassSerializerInterceptor` vào controllers hoặc global

#### R2.3 — Fix Zustand hooks
- [ ] `useStories.ts`: Destructure actions riêng biệt
  ```typescript
  const setLoading = useStoryStore(s => s.setLoading);
  const setPage = useStoryStore(s => s.setPage);
  const upsert = useStoryStore(s => s.upsert);
  const remove = useStoryStore(s => s.remove);
  ```
- [ ] `useCharacters.ts`: Tương tự

#### R2.4 — OwnershipService tests
- [ ] Tạo `apps/server/src/shared/ownership/ownership.service.spec.ts`
- [ ] Tests:
  - `assertStoryOwner` — returns story when valid owner
  - `assertStoryOwner` — throws NOT_FOUND when story missing
  - `assertStoryOwner` — throws FORBIDDEN when different user
  - `assertCharacterOwner` — returns character when valid owner
  - `assertCharacterOwner` — throws NOT_FOUND when character missing
  - `assertCharacterOwner` — throws FORBIDDEN via story.userId mismatch

---

### R3: Refactor Medium Issues 🟡

#### R3.1 — StoriesService reuse OwnershipService
- [ ] Inject `OwnershipService` vào `StoriesService`
- [ ] Replace `this.assertOwnership()` → `this.ownership.assertStoryOwner()`
- [ ] Remove private `assertOwnership()` method
- [ ] Update `stories.module.ts` imports

#### R3.2 — Error handling improvement
- [ ] Tạo helper `handlePrismaError(error, context)` trong `shared/errors/`
- [ ] Phân loại: `Prisma.PrismaClientKnownRequestError` (P2002 unique, P2025 not found)
- [ ] Apply cho cả Stories + Characters service

#### R3.3 — Chuẩn bị sessions count
- [ ] Thêm comment TODO ở `toDto()` cho `sessionCount`
- [ ] Khi Session model có ở P04, include `_count: { sessions: true }`

#### R3.4 — Move VoiceMeta vào shared-types
- [ ] Thêm `VoiceMeta` type + `VOICE_METADATA` array vào `shared-types/src/character.ts`
- [ ] Mobile `constants/voices.ts` import từ shared thay vì define local

#### R3.5 — Default avatar local
- [ ] Tạo hoặc thêm placeholder avatar asset vào `apps/mobile/assets/`
- [ ] `CharacterCard` dùng `require('../assets/default-avatar.png')` thay vì gravatar URL

---

### R4: Bổ sung Tests 🟡

- [ ] **R4.1**: `ownership.service.spec.ts` (6 tests) — xem R2.4
- [ ] **R4.2**: `voice.constants.spec.ts`
  - `isValidVoice` returns true cho tất cả 7 voices
  - `isValidVoice` returns false cho 'Random', '', null
- [ ] **R4.3**: `stories.service.spec.ts` — thêm:
  - `assertOwnership throws FORBIDDEN when userId mismatch`
  - `list handles DB error gracefully`
- [ ] **R4.4**: `characters.service.spec.ts` — thêm:
  - `update rejects invalid voiceName`
  - `uploadAvatar throws when file is null`
  - `delete handles detachMessages failure gracefully`

---

### R5: Polish & Low Priority 🟢

- [ ] **R5.1**: `StoryCard` swipe — migrate sang `react-native-gesture-handler/Swipeable`
- [ ] **R5.2**: Extract avatar utility thành `shared/services/image.service.ts`
- [ ] **R5.3**: `PitchSlider` — thêm `accessibilityLabel`, `accessibilityRole`
- [ ] **R5.4**: `StoriesModule` + `CharactersModule` — thêm `exports: [StoriesService]`
- [ ] **R5.5**: Mobile zod schemas type-check against shared-types DTOs

---

## 4. ACCEPTANCE CRITERIA

### Blocking (R1)
- [ ] `StoryDto` không chứa `userId`
- [ ] `getById` ownership check không phụ thuộc cached DTO field
- [ ] `CreateCharacterDto` có `@MaxLength` cho name (50) và personality (3000)
- [ ] Không còn `as any` cast cho Prisma client calls
- [ ] `npx tsc --noEmit` pass cho cả server + shared-types

### High (R2)
- [ ] `sharp` imported tĩnh
- [ ] Response DTO classes tồn tại
- [ ] Zustand hooks không dùng full store object
- [ ] `ownership.service.spec.ts` có ≥ 4 tests, all pass

### Tests (R4)
- [ ] Total tests ≥ 30 (hiện tại 19)
- [ ] All pass

---

## 5. ESTIMATED EFFORT

| Group | Effort | Priority |
|-------|--------|----------|
| R1 | 2-3 giờ | 🔴 BLOCKING |
| R2 | 2-3 giờ | 🟠 HIGH |
| R3 | 2 giờ | 🟡 MEDIUM |
| R4 | 1-2 giờ | 🟡 MEDIUM |
| R5 | 2-3 giờ | 🟢 LOW |
| **Tổng** | **~10-14 giờ** | |
