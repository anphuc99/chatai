# Phase 12 — Tutorial Overlay

> **Mục tiêu**: User mới được hướng dẫn qua 7 bước, mỗi bước highlight UI tương ứng.  
> **Phụ thuộc**: Phase 1 (tutorial_step), Phase 2, Phase 4, Phase 10.

---

## P12.T1 — Server: Tutorial Step Tracking

**Status**: `[ ]`  
**Depends on**: P11.T6 (Phase 11 hoàn thành)

**Mô tả chi tiết**:
1. Tutorial flow 7 bước (từ `Document/tutorial.md`):
   | Step | Tên | Điều kiện hoàn thành | UI target |
   |------|-----|---------------------|-----------|
   | 0 | Welcome | Đọc xong → nhấn "Tiếp" | Splash overlay |
   | 1 | Tạo Story | User tạo story đầu tiên | Story screen |
   | 2 | Tạo Character | User tạo character đầu tiên | Character editor |
   | 3 | Bắt đầu Chat | User bắt đầu session đầu tiên | Story detail "Bắt đầu" button |
   | 4 | Gửi tin nhắn | User gửi message đầu tiên | Chat input bar |
   | 5 | Lưu từ vựng | User lưu 1 từ từ tooltip | Word tooltip "Lưu" button |
   | 6 | Kết thúc Chat | User end chat 1 lần | End chat button |
   | 7 | Hoàn thành | Tutorial done, không show nữa | Celebration overlay |

2. Server side đã có `tutorialStep` trong `users_meta` + Firestore.
3. Thêm event listeners để auto-advance:
   ```typescript
   // Trong các module tương ứng, emit events:
   // - StoryService.create → emit TUTORIAL_ADVANCE nếu step === 1
   // - CharacterService.create → emit TUTORIAL_ADVANCE nếu step === 2
   // - ChatController.startSession → emit TUTORIAL_ADVANCE nếu step === 3
   // - ChatController.sendMessage → emit TUTORIAL_ADVANCE nếu step === 4
   // - VocabularyService.collectWord → emit TUTORIAL_ADVANCE nếu step === 5
   // - EndChatService.execute → emit TUTORIAL_ADVANCE nếu step === 6
   ```
4. `TutorialService`:
   ```typescript
   async advanceStep(userId: string, currentStep: number): Promise<void> {
     await this.prisma.usersMeta.update({
       where: { uid: userId },
       data: { tutorialStep: currentStep + 1 }
     });
     await this.usersService.syncToFirestore(userId, { tutorialStep: currentStep + 1 });
   }
   ```
5. API endpoint (optional, vì có thể dùng `PATCH /users/preferences`):
   ```typescript
   @Post('tutorial/skip')
   async skipTutorial(@CurrentUser() user) {
     await this.tutorialService.skipToEnd(user.uid); // set step = 7
   }
   ```

**Output kiểm chứng**:
- Tạo story khi step=1 → step advance to 2.
- Skip → step = 7.
- API confirm advance đúng sequence.

---

## P12.T2 — Client: TutorialStore + Coachmark Component

**Status**: `[ ]`  
**Depends on**: P12.T1

**Mô tả chi tiết**:
1. Tạo `src/features/tutorial/`:
   ```
   tutorial/
   ├── store/
   │   └── tutorial.store.ts
   ├── components/
   │   ├── CoachmarkOverlay.tsx
   │   ├── CoachmarkTooltip.tsx
   │   └── TutorialWelcome.tsx
   └── config/
       └── steps.ts
   ```
2. `tutorial.store.ts`:
   ```typescript
   interface TutorialState {
     currentStep: number;  // from user profile
     isActive: boolean;    // step < 7
     shouldShowCoachmark: (stepName: string) => boolean;
     advance: () => void;
     skip: () => void;
   }
   ```
3. `steps.ts` — config mỗi step:
   ```typescript
   export const TUTORIAL_STEPS = [
     { step: 0, target: null, title: 'Chào mừng!', message: 'Ứng dụng giúp bạn học tiếng Trung qua roleplay chat...' },
     { step: 1, target: 'story-create-button', title: 'Tạo câu chuyện', message: 'Nhấn nút + để tạo câu chuyện đầu tiên.' },
     { step: 2, target: 'character-create-button', title: 'Tạo nhân vật', message: 'Thêm nhân vật cho câu chuyện.' },
     { step: 3, target: 'start-chat-button', title: 'Bắt đầu chat', message: 'Nhấn để bắt đầu phiên roleplay.' },
     { step: 4, target: 'chat-input-bar', title: 'Gửi tin nhắn', message: 'Gõ tiếng Trung hoặc Việt để bắt đầu.' },
     { step: 5, target: 'word-save-button', title: 'Lưu từ vựng', message: 'Tap vào chữ Hán và nhấn Lưu.' },
     { step: 6, target: 'end-chat-button', title: 'Kết thúc', message: 'Nhấn để lưu lại phiên chat.' },
   ];
   ```
4. `CoachmarkOverlay.tsx`:
   - Full-screen semi-transparent overlay.
   - Spotlight (hole) trên target element.
   - Tooltip arrow pointing at target.
   - Message text + nút "Tiếp theo" / "Bỏ qua".
5. Implementation approach:
   - Mỗi target component expose `ref` hoặc `nativeID`.
   - `CoachmarkOverlay` measure target position → render hole.
   - Dùng `react-native-walkthrough-tooltip` hoặc custom implementation.
6. Auto-advance integration:
   - Khi user hoàn thành action (vd: tạo story) → server advance step → Firestore sync → client listener update `tutorialStore.currentStep`.
   - Hoặc: client tự advance sau khi action thành công (optimistic).

**Output kiểm chứng**:
- New user (step=0) → Welcome overlay.
- Nhấn "Tiếp" → coachmark highlight "Tạo Story" button.
- Sau tạo story → coachmark auto-advance sang step 2.
- Skip → tất cả overlay biến mất.

---

## P12.T3 — Client: Wire Coachmarks vào Existing Screens

**Status**: `[ ]`  
**Depends on**: P12.T2

**Mô tả chi tiết**:
1. Cập nhật các screens để support coachmark targeting:
   - `StoryListScreen.tsx`: FAB button có `nativeID="story-create-button"`.
   - `StoryDetailScreen.tsx`: "Bắt đầu Chat" button có `nativeID="start-chat-button"`.
   - `CharacterEditorScreen.tsx` (hoặc CharacterList): create button có `nativeID="character-create-button"`.
   - `ChatRoomScreen.tsx`:
     - InputBar container: `nativeID="chat-input-bar"`.
     - End Chat button: `nativeID="end-chat-button"`.
   - `WordTooltip.tsx`: Lưu button `nativeID="word-save-button"`.
2. Render `CoachmarkOverlay` trong `RootNavigator` (top-level, trên mọi screen):
   ```tsx
   // In RootNavigator.tsx or App.tsx
   <>
     <NavigationContainer>...</NavigationContainer>
     {tutorialStore.isActive && <CoachmarkOverlay />}
   </>
   ```
3. Logic display:
   - `CoachmarkOverlay` check `currentStep` → render spotlight trên target tương ứng.
   - Nếu target screen chưa visible (vd: step 4 nhưng user chưa ở ChatRoom) → không show overlay, chờ user navigate đúng screen.
   - Khi screen matches step target → show overlay.
4. "Bỏ qua tutorial" option:
   - Nút "Bỏ qua" ở mọi coachmark step.
   - Confirm alert → gọi skip → step = 7 → overlay gone.

**Output kiểm chứng**:
- Full tutorial flow: Welcome → tạo story → tạo character → start chat → send message → save word → end chat → celebration.
- Mỗi step highlight đúng element.
- Reopen app (step persist) → resume đúng step.
- Skip giữa chừng → không show lại.

---
