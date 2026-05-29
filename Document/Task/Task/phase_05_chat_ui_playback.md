# Phase 5 — Chat UI Polish + TTS Sequential Playback

> **Mục tiêu**: Messages hiển thị tuần tự với TTS audio, pinyin toggle, translation slide, tap-to-show tooltip.  
> **Phụ thuộc**: Phase 3 (TTS), Phase 4 (Chat MVP).

---

## P5.T1 — Client: PlaybackQueueManager (expo-av)

**Status**: `[ ]`  
**Depends on**: P4.T8

**Mô tả chi tiết**:
1. Tạo `src/features/chat/services/playback-queue.manager.ts`:
   ```typescript
   class PlaybackQueueManager {
     private queue: ChatMessage[] = [];
     private isPlaying: boolean = false;
     private currentSound: Audio.Sound | null = null;
     private onBubbleShow: (msg: ChatMessage) => void;  // callback hiển thị bubble
     private onQueueFinished: () => void;                // callback unlock input

     enqueueBatch(messages: ChatMessage[]): void {
       // Thêm messages vào queue
       // Nếu chưa playing → bắt đầu playNext()
     }

     async playNext(): Promise<void> {
       // 1. Dequeue message đầu tiên
       // 2. Gọi onBubbleShow(msg) → UI render bubble với animation
       // 3. Nếu message có audio (character hoặc narrator zh/en):
       //    a. Fetch audio URL: POST /tts/synthesize { text, voiceName, emotion, intensity, pitch }
       //    b. Load audio: Audio.Sound.createAsync({ uri: audioUrl })
       //    c. Play audio
       //    d. Wait cho audio finish (onPlaybackStatusUpdate)
       // 4. Nếu message là Narrator tiếng Việt (không có audio):
       //    a. Tính reading time: text.length * 80ms (ước lượng)
       //    b. Wait min(readingTime, 5000ms)
       // 5. Sau khi audio/delay xong → playNext() (recursive)
       // 6. Nếu queue rỗng → onQueueFinished()
     }

     stop(): void {
       // Clear queue
       // Stop current audio
       // Unload sound
       this.isPlaying = false;
     }

     private async fetchAudioUrl(msg: ChatMessage): Promise<string | null> {
       // Nếu msg.role === 'assistant' && msg.characterName !== 'Narrator':
       //   → gọi /tts/synthesize
       // Nếu Narrator nhưng text là tiếng Trung/Anh:
       //   → gọi /tts/synthesize với voice mặc định
       // Nếu Narrator tiếng Việt → return null (no audio)
     }
   }
   ```
2. State machine:
   - `Idle` → `Enqueued` (enqueueBatch) → `Fetching` (playNext) → `Playing` (audio loaded) → `WaitDelay` (narrator VN) → back to `Fetching` hoặc `Idle`.
3. Cleanup:
   - Mỗi sound phải `unloadAsync()` sau khi phát xong (tránh memory leak).
   - Khi user rời ChatRoom → `stop()` + unload tất cả.

**Output kiểm chứng**:
- Batch 3 messages → hiển thị tuần tự với audio, không overlap.
- Narrator VN → delay rồi tiếp.
- Stop giữa chừng → dừng ngay.

---

## P5.T2 — Client: MessageBubble Full UI (Emotion + Pinyin + Translation)

**Status**: `[ ]`  
**Depends on**: P5.T1

**Mô tả chi tiết**:
1. Cập nhật `src/features/chat/components/MessageBubble.tsx`:
   ```
   ┌────────────────────────────────────┐
   │ 😊 Linh                            │  ← avatar + name + emotion icon
   │                                    │
   │  我们去喝奶茶吧！                    │  ← text (character = Chinese)
   │  wǒmen qù hē nǎichá ba!           │  ← pinyin row (toggleable)
   │                                    │
   │  ▼ Chúng ta đi uống trà sữa đi!   │  ← translation (tap to slide)
   └────────────────────────────────────┘
   ```
2. Components chi tiết:
   - **Emotion Icon**: Map emotion string → emoji icon (vd: Happy → 😊, Angry → 😠).
   - **Pinyin Row**: Hiển thị/ẩn dựa trên `preferences.showPinyin` (global toggle) + có thể tap header để toggle local.
   - **Translation**: Tap vào text → slide down translation. Hoặc nút nhỏ "Dịch" ở dưới.
   - **Character avatar**: Hiển thị avatar nhỏ bên trái bubble.
3. `NarratorBubble.tsx` (tách riêng style):
   - Background xám nhạt, italic, full-width.
   - Không có avatar.
   - Nếu có translation → cùng logic slide.
4. `UserBubble.tsx`:
   - Align phải, background xanh.
   - Chỉ hiển thị text user gửi.
5. Animation:
   - Bubble xuất hiện: fade-in + slide-up nhẹ (react-native-reanimated `FadeInDown`).
   - Mỗi bubble chỉ animate lần đầu render.

**Output kiểm chứng**:
- Character bubble: hiển thị tên + emoji + text + pinyin (nếu on) + translation (tap).
- Narrator bubble: style riêng biệt.
- Toggle pinyin global → tất cả bubbles update.

---

## P5.T3 — Client: Tap-to-Show Word Tooltip

**Status**: `[ ]`  
**Depends on**: P5.T2

**Mô tả chi tiết**:
1. Tạo `src/features/chat/components/WordTooltip.tsx`:
   - Khi user tap vào 1 chữ Hán trong text:
     - Tìm word tương ứng trong `message.words[]` (match `hz`).
     - Hiển thị tooltip/popover:
       ```
       ┌──────────────┐
       │  奶茶         │  ← chữ Hán (lớn)
       │  nǎichá      │  ← pinyin
       │  trà sữa     │  ← nghĩa VN
       │  [💾 Lưu]    │  ← nút Lưu vào sổ từ
       └──────────────┘
       ```
   - Nút "Lưu": placeholder callback (sẽ wire API ở Phase 10).
2. Cách implement tap detection:
   - Option A: Wrap mỗi từ trong `<Text>` riêng (onPress). Parse text thành segments dựa trên `words` array.
   - Option B: Dùng `onTextLayout` + touch position matching.
   - **Khuyến nghị Option A** cho đơn giản:
     ```tsx
     // Split text theo words boundaries
     const segments = splitTextByWords(message.text, message.words);
     // Render: segments.map(seg => seg.isWord 
     //   ? <Text onPress={() => showTooltip(seg.word)} style={styles.tappable}>{seg.text}</Text>
     //   : <Text>{seg.text}</Text>
     // )
     ```
3. Tooltip component:
   - Position absolute/relative near tapped word.
   - Dismiss khi tap outside.
   - Dùng `react-native-popover-view` hoặc custom `Modal`.
4. Lưu state tooltip: `{ visible, word, position }`.

**Output kiểm chứng**:
- Tap chữ "奶茶" → tooltip hiện hz/py/vn.
- Tap outside → tooltip biến mất.
- Nút "Lưu" nhấn được (chưa gọi API, chỉ Toast "Đã lưu" tạm).

---

## P5.T4 — Client: InputBar Lock/Unlock + OOC Inline

**Status**: `[ ]`  
**Depends on**: P5.T1

**Mô tả chi tiết**:
1. Cập nhật `InputBar.tsx`:
   - State: `locked` (boolean từ ChatStore khi queue đang play).
   - Khi locked:
     - TextInput disabled + opacity giảm.
     - Send button disabled.
     - Hiện text nhỏ "Đang phát..." hoặc indicator.
   - Khi unlocked:
     - TextInput editable.
     - Send button active.
2. OOC inline input:
   - Prefix detection: nếu user gõ `//` ở đầu → hiểu là ephemeral OOC.
   - UI: khi detect `//` → InputBar border đổi màu cam + label "[OOC]".
   - Khi send: tách OOC text (bỏ `//`) → gọi `sendMessage(mainText, ephemeralOOC)`.
   - Alternative: nút nhỏ bên cạnh để toggle OOC mode.
3. Integration với PlaybackQueue:
   - `chatStore.inputLocked = true` khi `enqueueBatch`.
   - `chatStore.inputLocked = false` khi `onQueueFinished` callback.

**Output kiểm chứng**:
- Gửi message → input lock → queue phát xong → input unlock.
- Gõ `//bối cảnh mưa` → send → message gửi đi với ephemeralOOC.

---

## P5.T5 — Client: OOC Sidebar Panel (Persistent OOC)

**Status**: `[ ]`  
**Depends on**: P5.T4

**Mô tả chi tiết**:
1. Tạo `src/features/chat/components/OocPanel.tsx`:
   - Slide-in panel từ bên phải (hoặc bottom sheet).
   - Sections:
     - **Bối cảnh cố định**: TextArea hiển thị persistent OOC hiện tại. Editable.
       - Khi thay đổi + nhấn "Lưu" → gọi `chatStore.setPersistentOOC(text)`.
     - **Nhân vật đang active**: List checkboxes.
       - Toggle → gọi `chatStore.toggleCharacter(id, on)`.
     - **Nhân vật tạm thời**: Nút "Thêm" → mini form (name + description).
       - Submit → gọi `chatStore.addTemporaryCharacter(name, desc)`.
   - Nút "Đóng" panel.
2. Trigger mở panel:
   - Icon ⚙️ ở header ChatRoom.
3. State sync:
   - Khi mở panel → load current persistent OOC + active chars từ store.
   - Sau save → store update → panel reflect.

**Output kiểm chứng**:
- Mở panel → thấy persistent OOC hiện tại.
- Sửa OOC → Save → gửi message tiếp → AI phản ánh OOC mới.
- Uncheck character → message tiếp AI không đóng vai char đó.
- Thêm temp character → AI sử dụng char đó.

---
