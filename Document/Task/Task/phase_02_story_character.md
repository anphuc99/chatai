# Phase 2 — Story + Character CRUD

> **Mục tiêu**: User tạo/sửa/xoá Story và Character, upload avatar, chọn voice cho nhân vật.  
> **Phụ thuộc**: Phase 1 hoàn thành.

---

## P2.T1 — Database: Stories + Characters Tables

**Status**: `[ ]`  
**Depends on**: P1.T7 (Phase 1 hoàn thành)

**Mô tả chi tiết**:
1. Thêm models vào `prisma/schema.prisma`:
   ```prisma
   model Story {
     id              String   @id @default(uuid())
     userId          String   @map("user_id")
     title           String
     initialSetting  String   @map("initial_setting") @db.Text
     currentProgress String   @default("") @map("current_progress") @db.Text
     createdAt       DateTime @default(now()) @map("created_at")
     updatedAt       DateTime @updatedAt @map("updated_at")

     user       UsersMeta   @relation(fields: [userId], references: [uid])
     characters Character[]
     sessions   Session[]

     @@map("stories")
   }

   model Character {
     id         String   @id @default(uuid())
     storyId    String   @map("story_id")
     name       String
     age        Int?
     personality String  @db.Text
     avatarUrl  String?  @map("avatar_url")
     voiceName  String   @map("voice_name")  // Enum: Achernar|Aoede|Charon|Fenrir|Kore|Leda|Zephyr
     pitch      Float    @default(1.0)        // 0.8 - 1.5
     createdAt  DateTime @default(now()) @map("created_at")

     story    Story     @relation(fields: [storyId], references: [id], onDelete: Cascade)
     messages Message[]

     @@map("characters")
   }
   ```
2. Thêm relation vào `UsersMeta`:
   ```prisma
   model UsersMeta {
     // ... existing fields
     stories Story[]
   }
   ```
3. Run migration: `npx prisma migrate dev --name add_stories_characters`.
4. Validate: `npx prisma studio` hiển thị 2 bảng mới với relations đúng.

**Output kiểm chứng**:
- Migration file tạo thành công.
- Prisma Studio: tạo 1 story → tạo 1 character thuộc story đó → cascade delete story → character bị xoá theo.

---

## P2.T2 — Server: StoriesModule (CRUD + Validation)

**Status**: `[ ]`  
**Depends on**: P2.T1

**Mô tả chi tiết**:
1. Tạo `src/modules/stories/`:
   ```
   stories/
   ├── stories.module.ts
   ├── stories.controller.ts
   ├── stories.service.ts
   └── dto/
       ├── create-story.dto.ts    # { title: string, initialSetting: string }
       ├── update-story.dto.ts    # { title?: string, initialSetting?: string }
       └── story-response.dto.ts
   ```
2. `stories.controller.ts` — endpoints:
   - `GET /stories`: Lấy tất cả stories của user hiện tại (pagination cursor-based). Include `_count.characters`, `_count.sessions`.
   - `GET /stories/:id`: Chi tiết 1 story (kiểm tra ownership).
   - `POST /stories`: Tạo mới. Validate `title` ≤ 100 chars, `initialSetting` ≤ 5000 chars.
   - `PATCH /stories/:id`: Update (kiểm tra ownership).
   - `DELETE /stories/:id`: Xoá. **Chặn nếu có active session** (session.status = 'active'). Nếu không → cascade delete characters + sessions.
3. `stories.service.ts`:
   - Mọi query filter theo `userId = currentUser.uid` (tuyệt đối không leak data cross-user).
   - `delete()`: Check `sessions.some(s => s.status === 'active')` → throw `ConflictException('Story has active chat session')`.
4. Thêm vào `shared-types/src/story.ts`:
   ```typescript
   export interface StoryDto {
     id: string;
     title: string;
     initialSetting: string;
     currentProgress: string;
     characterCount: number;
     sessionCount: number;
     createdAt: string;
     updatedAt: string;
   }
   ```

**Output kiểm chứng**:
- CRUD full lifecycle qua Postman/Thunder Client.
- Xoá story có active session → 409 Conflict.
- User A không thấy story của User B.

---

## P2.T3 — Server: CharactersModule (CRUD + Avatar Upload + Voice Validation)

**Status**: `[ ]`  
**Depends on**: P2.T2

**Mô tả chi tiết**:
1. Tạo `src/modules/characters/`:
   ```
   characters/
   ├── characters.module.ts
   ├── characters.controller.ts
   ├── characters.service.ts
   └── dto/
       ├── create-character.dto.ts
       ├── update-character.dto.ts
       └── character-response.dto.ts
   ```
2. `create-character.dto.ts`:
   ```typescript
   export class CreateCharacterDto {
     @IsString() @MaxLength(50) name: string;
     @IsOptional() @IsInt() @Min(1) @Max(999) age?: number;
     @IsString() @MaxLength(3000) personality: string;
     @IsEnum(['Achernar','Aoede','Charon','Fenrir','Kore','Leda','Zephyr']) voiceName: string;
     @IsNumber() @Min(0.8) @Max(1.5) pitch: number;
   }
   ```
3. Controller endpoints:
   - `GET /stories/:storyId/characters`: List characters (verify story ownership).
   - `POST /stories/:storyId/characters`: Create character. Validate voiceName against known enum.
   - `PATCH /characters/:id`: Update partial. Verify ownership via story→user chain.
   - `DELETE /characters/:id`: Soft approach — set `messages.character_id = NULL` for related messages, then hard delete character.
   - `POST /characters/:id/avatar` (multipart): Upload ảnh, resize 256x256, upload Firebase Storage `characters/{charId}/{timestamp}.jpg`, update `avatarUrl`.
4. `characters.service.ts`:
   - `validateOwnership(characterId, userId)`: Join character→story→user, verify uid match.
   - `delete(id)`: Transaction: update messages SET character_id = NULL WHERE character_id = id, THEN delete character.
5. Copy file `Document/dataset_chinese/reference_index.json` → `packages/prompts/reference_index.json` (sẽ dùng ở TTS Phase 3).

**Output kiểm chứng**:
- Tạo character với voiceName không hợp lệ → 400.
- Xoá character → messages vẫn còn (character_id = NULL, character_name giữ nguyên).
- Upload avatar → URL hiển thị ảnh đúng.

---

## P2.T4 — Client: StoryListScreen + StoryDetailScreen

**Status**: `[ ]`  
**Depends on**: P2.T2

**Mô tả chi tiết**:
1. Tạo `src/features/story/`:
   ```
   story/
   ├── screens/
   │   ├── StoryListScreen.tsx
   │   ├── StoryCreateScreen.tsx
   │   └── StoryDetailScreen.tsx
   ├── hooks/
   │   └── useStories.ts
   ├── store/
   │   └── story.store.ts
   └── components/
       ├── StoryCard.tsx
       └── StoryForm.tsx
   ```
2. `story.store.ts` (Zustand):
   ```typescript
   interface StoryState {
     stories: StoryDto[];
     isLoading: boolean;
     fetchAll: () => Promise<void>;
     create: (input: CreateStoryInput) => Promise<StoryDto>;
     update: (id: string, patch: Partial<CreateStoryInput>) => Promise<void>;
     delete: (id: string) => Promise<void>;
   }
   ```
3. `StoryListScreen.tsx`:
   - FlatList hiển thị StoryCards.
   - Pull-to-refresh.
   - FAB button "Tạo Story mới" → navigate CreateScreen.
   - Swipe-to-delete (confirm alert).
   - Empty state: "Chưa có câu chuyện nào. Tạo ngay!"
4. `StoryCreateScreen.tsx`:
   - Form (react-hook-form + zod):
     - `title`: TextInput, required, max 100.
     - `initialSetting`: TextArea multiline, required, placeholder "Mô tả bối cảnh ban đầu bằng tiếng Việt...".
   - Submit → gọi store.create() → navigate back.
5. `StoryDetailScreen.tsx`:
   - Hiển thị title, setting, currentProgress.
   - Section "Nhân vật" với danh sách character cards.
   - Nút "Bắt đầu Chat" (disabled nếu 0 characters). → Sẽ wire ở Phase 4.
   - Nút "Chỉnh sửa" story.

**Output kiểm chứng**:
- Tạo story → hiện trong list.
- Swipe delete → confirm → story biến mất.
- Navigate vào detail → thấy info + character list (trống).

---

## P2.T5 — Client: CharacterEditorScreen + Voice Selection

**Status**: `[ ]`  
**Depends on**: P2.T3, P2.T4

**Mô tả chi tiết**:
1. Tạo `src/features/character/`:
   ```
   character/
   ├── screens/
   │   └── CharacterEditorScreen.tsx
   ├── hooks/
   │   └── useCharacters.ts
   ├── store/
   │   └── character.store.ts
   └── components/
       ├── CharacterCard.tsx
       ├── VoiceSelector.tsx
       └── PitchSlider.tsx
   ```
2. `CharacterEditorScreen.tsx` (dùng chung cho Create & Edit):
   - Form fields:
     - Avatar: Touchable Image (tap → image picker).
     - Name: TextInput, required.
     - Age: NumberInput, optional.
     - Personality: TextArea multiline, required. Placeholder "Mô tả tính cách, cách nói chuyện..."
     - Voice: `VoiceSelector` component.
     - Pitch: `PitchSlider` (0.8 - 1.5, step 0.05).
   - Nút "Nghe thử giọng" → gọi `POST /tts/test-voice` (sẽ wire Phase 3, tạm disable).
   - Submit → create hoặc update.
3. `VoiceSelector.tsx`:
   - Horizontal scroll 7 voice cards: Achernar, Aoede, Charon, Fenrir, Kore, Leda, Zephyr.
   - Mỗi card hiển thị tên + icon giới tính (dựa trên dataset).
   - Selected state highlight.
4. `PitchSlider.tsx`:
   - Slider với labels: "Thấp (0.8)" — "Bình thường (1.0)" — "Cao (1.5)".
   - Real-time hiển thị giá trị.
5. `character.store.ts`:
   ```typescript
   interface CharacterState {
     characters: CharacterDto[];
     fetchByStory: (storyId: string) => Promise<void>;
     create: (storyId: string, input: CreateCharacterInput) => Promise<void>;
     update: (id: string, patch: Partial<CreateCharacterInput>) => Promise<void>;
     delete: (id: string) => Promise<void>;
   }
   ```

**Output kiểm chứng**:
- Tạo character với đầy đủ info → hiện trong StoryDetail.
- Edit character → thay đổi persist.
- VoiceSelector chọn đúng voice, PitchSlider hiện giá trị.

---

## P2.T6 — Shared Types Update: Story + Character DTOs

**Status**: `[ ]`  
**Depends on**: P2.T3

**Mô tả chi tiết**:
1. Cập nhật `packages/shared-types/src/story.ts`:
   ```typescript
   export interface CreateStoryDto {
     title: string;
     initialSetting: string;
   }
   export interface UpdateStoryDto {
     title?: string;
     initialSetting?: string;
   }
   ```
2. Tạo `packages/shared-types/src/character.ts`:
   ```typescript
   export type VoiceName = 'Achernar' | 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Leda' | 'Zephyr';
   
   export interface CharacterDto {
     id: string;
     storyId: string;
     name: string;
     age: number | null;
     personality: string;
     avatarUrl: string | null;
     voiceName: VoiceName;
     pitch: number;
     createdAt: string;
   }
   export interface CreateCharacterDto {
     name: string;
     age?: number;
     personality: string;
     voiceName: VoiceName;
     pitch: number;
   }
   ```
3. Export từ `index.ts`.

**Output kiểm chứng**:
- Cả server và mobile import types không lỗi TypeScript.

---
