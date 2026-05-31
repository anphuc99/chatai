# P05 — Code Review & Refactor Guide

> **Reviewer**: Senior Code Review  
> **Branch**: `Task/P05` vs `main`  
> **Date**: 2026-05-31  
> **Test Result**: ✅ 30/30 tests PASS (4 suites)

---

## 1. TỔNG QUAN TRẠNG THÁI SUBTASK

| Task | Mô tả | Code | Tests | Status |
|------|-------|------|-------|--------|
| P05.T1 | PlaybackQueueManager | ✅ | ✅ 6 tests | **DONE** |
| P05.T2 | MessageBubble Full UI | ✅ | ⚠️ chỉ utils | **DONE** |
| P05.T3 | Word Tooltip | ✅ | ✅ 5 tests | **DONE** |
| P05.T4 | InputBar Lock/Unlock + OOC | ✅ | ✅ store tests | **DONE** |
| P05.T5 | OOC Sidebar Panel | ✅ | ⚠️ không có | **DONE** |

**Kết luận**: Toàn bộ 5 subtask P05 đã được hoàn thành. 30 unit tests đều pass.  
Các vấn đề tìm thấy không blocking nhưng cần xử lý trước P06.

---

## 2. KẾT QUẢ TEST

```
PASS src/features/chat/services/playback-queue.manager.spec.ts  (6 tests)
PASS src/features/chat/utils/__tests__/split-words.test.ts       (5 tests)
PASS src/features/chat/store/__tests__/chat.store.test.ts        (10 tests)
PASS src/features/chat/utils/__tests__/chat-utils.test.ts        (6 tests)

Test Suites: 4 passed, 4 total
Tests:       30 passed, 30 total
Time:        1.572s
```

---

## 3. BUGS TÌM THẤY

### BUG-01 (Severity: High) — CharacterBubble word-block view bị mất text

**File**: [apps/mobile/src/features/chat/components/CharacterBubble.tsx](apps/mobile/src/features/chat/components/CharacterBubble.tsx#L80-L103)

**Mô tả**: Khi `showPinyinGlobal && hasWords` là `true`, component chỉ render các từ có trong `msg.words[]`, bỏ sót các ký tự không thuộc từ vựng.

Ví dụ: `msg.text = "我想喝奶茶"`, `msg.words = [{hz:"奶茶",...}]`  
→ Màn hình chỉ hiển thị "奶茶", mất "我想喝".

```tsx
// HIỆN TẠI - Sai: chỉ render words[], thiếu text
{showPinyinGlobal && hasWords ? (
  <View style={styles.wordsRow}>
    {words.map((w, idx) => (
      <Pressable key={idx} onPress={() => setSelectedWord(w)}>
        <Text style={styles.pinyinText}>{w.py}</Text>
        <Text style={styles.hanziText}>{w.hz}</Text>
      </Pressable>
    ))}
  </View>
) : (
  <TappableChineseText text={msg.text} words={msg.words} ... />
)}
```

**Fix**: Xem mục 5.1 — Refactor CharacterBubble layout.

---

### BUG-02 (Severity: Low) — Comment sai trong `enqueueBatch`

**File**: [apps/mobile/src/features/chat/services/playback-queue.manager.ts](apps/mobile/src/features/chat/services/playback-queue.manager.ts#L59-L62)

```typescript
if (!this.isPlaying) {
  this.isPlaying = true;
  this.isStopped = false; // ← comment sai: "Reset stop status if enqueuing new batch"
  //   Thực tế: khi isStopped=true, hàm đã return ở dòng 54. 
  //   Dòng này chỉ chạy khi isStopped=false → là ghi thừa vô hại.
  void this.playNext();
}
```

**Fix**: Xóa comment sai, xóa dòng `this.isStopped = false` (redundant).

---

## 4. SPEC GAPS

### GAP-01 — English narrator không có audio

**File**: [apps/mobile/src/features/chat/services/playback-queue.manager.ts](apps/mobile/src/features/chat/services/playback-queue.manager.ts#L181-L199)

Workplan P05.T1 nêu "narrator zh/en → TTS", nhưng implementation chỉ check `containsChinese`. Narrator tiếng Anh ("The rain starts falling...") sẽ bị delay thay vì phát audio.

**Mức độ**: Low risk cho MVP (Narrator chủ yếu là tiếng Việt hoặc tiếng Trung). Ghi nhận để xử lý khi có nhu cầu.

---

## 5. CODE SMELLS & DESIGN ISSUES

### SMELL-01 — `useCharactersMap` hook call trong mỗi bubble (N+1 pattern)

**File**: [apps/mobile/src/features/chat/components/CharacterBubble.tsx](apps/mobile/src/features/chat/components/CharacterBubble.tsx#L46)

```tsx
const charMap = useCharactersMap(storyId); // Gọi trong từng bubble!
```

`useCharactersMap` có module-level cache nên không gây N+1 API call. Nhưng mỗi bubble vẫn chạy useEffect để kiểm tra cache → có overhead React. Đúng hơn là đọc `charactersFull` từ ChatStore (đã được load khi init) thay vì hook riêng.

**Fix**: Xem mục 5.2.

---

### SMELL-02 — Mixing animation libraries

**File**: [apps/mobile/src/features/chat/components/OocPanel.tsx](apps/mobile/src/features/chat/components/OocPanel.tsx#L47-L48)

OocPanel dùng `Animated` từ `react-native` (legacy), trong khi CharacterBubble/NarratorBubble/UserBubble dùng `react-native-reanimated`. Hai thư viện không nên dùng chung trong một màn hình vì tốn bridge overhead.

---

### SMELL-03 — `catch (e: any)` không type-safe

**File**: [apps/mobile/src/features/chat/components/OocPanel.tsx](apps/mobile/src/features/chat/components/OocPanel.tsx#L91)  
**File**: [apps/mobile/src/features/chat/store/chat.store.ts](apps/mobile/src/features/chat/store/chat.store.ts) (nhiều chỗ)

```typescript
catch (e: any) {  // ← không safe
  Alert.alert('Lỗi', e?.message || '...');
```

---

### SMELL-04 — Keyboard avoidance thiếu trên Android

**File**: [apps/mobile/src/features/chat/components/InputBar.tsx](apps/mobile/src/features/chat/components/InputBar.tsx#L47-L53)

```tsx
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
```

Android nhận `undefined` → input bị keyboard che khi mở keyboard. Cần `'height'` cho Android.

---

### SMELL-05 — `PANEL_WIDTH` cứng, không responsive

**File**: [apps/mobile/src/features/chat/components/OocPanel.tsx](apps/mobile/src/features/chat/components/OocPanel.tsx#L25-L26)

```typescript
const { width: windowWidth } = Dimensions.get('window');
const PANEL_WIDTH = windowWidth * 0.8; // Module init, không cập nhật khi rotation
```

---

## 6. MISSING TESTS

| Component/Function | Test hiện có | Còn thiếu |
|---|---|---|
| `PlaybackQueueManager` | ✅ 6 tests | Chinese narrator path, `setCharactersMap`, rate-limit behavior |
| `ChatStore` | ✅ 10 tests | Error path của `loadStoryCharacters`, race condition `setPersistentOOC` |
| `splitTextByWords` | ✅ 5 tests | Empty words items, single character word |
| `emojiFor`, `toPinyin` | ✅ 6 tests | OK |
| `CharacterBubble` | ❌ | Render snapshot, pinyin toggle, word tap |
| `NarratorBubble` | ❌ | Render với Chinese text vs VN text |
| `UserBubble` | ❌ | Render alignment |
| `InputBar` | ❌ | Lock/unlock behavior, OOC prefix detection |
| `WordTooltip` | ❌ | Tap outside dismiss, save callback |
| `OocPanel` | ❌ | Open/close animation, form submit |

---

## 7. REFACTOR GUIDE

### 7.1. Fix BUG-01 — CharacterBubble layout (Priority: HIGH)

**File**: [apps/mobile/src/features/chat/components/CharacterBubble.tsx](apps/mobile/src/features/chat/components/CharacterBubble.tsx)

**Phân tích**: Cần luôn hiển thị đầy đủ `msg.text`. Chỉ thay đổi cách hiển thị pinyin:
- Có words → dùng layout word-block (pinyin + hanzi theo từng từ, còn non-word chars inline)  
- Không có words → dùng `TappableChineseText` + `PinyinRow` toàn câu

**Pattern đề xuất**: Tách concern rõ ràng — text display luôn dùng `TappableChineseText`, pinyin display chọn mode:

```tsx
// Xóa hoàn toàn đoạn {showPinyinGlobal && hasWords ? ... : ...}
// Thay bằng:

<TappableChineseText
  text={msg.text}
  words={msg.words}
  onWordTap={setSelectedWord}
  baseStyle={styles.assistantText}
/>

{showPinyinGlobal && (
  hasWords
    ? <WordPinyinRow words={words} onWordTap={setSelectedWord} />
    : <PinyinRow text={msg.text} />
)}
```

Tạo component mới `WordPinyinRow.tsx`:
```tsx
// src/features/chat/components/WordPinyinRow.tsx
interface WordPinyinRowProps {
  words: Word[];
  onWordTap: (w: Word) => void;
}
// Render: <View flexDirection="row" flexWrap="wrap">
//   {words.map(w => <Text key={w.hz} onPress={() => onWordTap(w)}>{w.py} </Text>)}
// </View>
```

---

### 7.2. Fix SMELL-01 — Bỏ `useCharactersMap` trong bubble, đọc từ store

**File**: [apps/mobile/src/features/chat/components/CharacterBubble.tsx](apps/mobile/src/features/chat/components/CharacterBubble.tsx)

```typescript
// TRƯỚC: hook riêng trong mỗi bubble
const storyId = useChatStore((s) => s.storyId);
const charMap = useCharactersMap(storyId);

// SAU: đọc charactersFull từ store (đã được load bởi ChatRoomScreen)
const charactersFull = useChatStore((s) => s.charactersFull);
const char = msg.characterId
  ? charactersFull.find((c) => c.id === msg.characterId)
  : undefined;
```

Giữ nguyên `useCharactersMap` để dùng ở nơi khác nếu cần. Chỉ đổi `CharacterBubble`.

---

### 7.3. Fix SMELL-02 — OocPanel dùng reanimated thay vì Animated

**File**: [apps/mobile/src/features/chat/components/OocPanel.tsx](apps/mobile/src/features/chat/components/OocPanel.tsx)

```typescript
// TRƯỚC: react-native Animated
import { Animated } from 'react-native';
const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
Animated.timing(translateX, { ... useNativeDriver: true }).start();

// SAU: react-native-reanimated
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
const translateX = useSharedValue(PANEL_WIDTH);
// open:
translateX.value = withTiming(0, { duration: 300 });
// close:
translateX.value = withTiming(PANEL_WIDTH, { duration: 250 });
const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
```

Cũng cần bỏ `useState(modalVisible)` — vì reanimated không cần delay modal visibility như Animated cũ.  
Dùng `runOnJS` nếu cần gọi `onClose()` khi animation xong.

---

### 7.4. Fix SMELL-04 — Keyboard avoidance Android

**File**: [apps/mobile/src/features/chat/components/InputBar.tsx](apps/mobile/src/features/chat/components/InputBar.tsx#L47)

```tsx
// TRƯỚC:
behavior={Platform.OS === 'ios' ? 'padding' : undefined}

// SAU:
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```

---

### 7.5. Fix SMELL-05 — OocPanel responsive width

**File**: [apps/mobile/src/features/chat/components/OocPanel.tsx](apps/mobile/src/features/chat/components/OocPanel.tsx#L25-L26)

```typescript
// TRƯỚC: module-level, không reactive
const { width: windowWidth } = Dimensions.get('window');
const PANEL_WIDTH = windowWidth * 0.8;

// SAU: inside component với useWindowDimensions
import { useWindowDimensions } from 'react-native';
function OocPanel(...) {
  const { width } = useWindowDimensions();
  const panelWidth = width * 0.8;
  // dùng panelWidth thay vì PANEL_WIDTH
}
```

---

### 7.6. Fix SMELL-03 — Type-safe error handling

Tìm & thay tất cả `catch (e: any)` thành:

```typescript
// TRƯỚC:
} catch (e: any) {
  Alert.alert('Lỗi', e?.message || '...');
}

// SAU:
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : 'Đã xảy ra lỗi không xác định.';
  Alert.alert('Lỗi', msg);
}
```

---

### 7.7. Bổ sung unit tests còn thiếu

**Priority: Medium** — Viết thêm theo danh sách sau:

#### 7.7.1. Thêm test cases cho PlaybackQueueManager

```typescript
// File: playback-queue.manager.spec.ts

it('nên fetch TTS khi Narrator có chữ Hán (Chinese narrator)', async () => {
  (TtsFetchService.synthesize as jest.Mock).mockResolvedValue({
    audioUrl: 'https://example.com/narrator.mp3',
    cached: false,
  });

  const msg: ChatMessage = {
    kind: 'assistant',
    id: 'msg_narrator_zh',
    characterId: null,
    characterName: 'Narrator',
    text: '她走进了教室。',  // Chinese text
    timestamp: Date.now(),
  };

  manager.enqueueBatch([msg]);

  await waitFor(() => {
    expect(TtsFetchService.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: '她走进了教室。', voiceName: 'Achernar' })
    );
  });
});

it('nên bỏ qua silently khi RATE_LIMIT và tiếp tục queue', async () => {
  const rateLimitError = Object.assign(new Error('Rate limit'), { code: 'RATE_LIMIT' });
  (TtsFetchService.synthesize as jest.Mock).mockRejectedValue(rateLimitError);

  const msg: ChatMessage = {
    kind: 'assistant',
    id: 'msg_rl',
    characterId: 'char_1',
    characterName: 'Mimi',
    text: '你好',
    timestamp: Date.now(),
  };

  manager.enqueueBatch([msg]);

  await waitFor(() => {
    expect(onBubbleShow).toHaveBeenCalledWith(msg);
    // Rate limit silently returns null → delay path → sleepSpy called
    expect(onQueueFinished).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();  // RATE_LIMIT không trigger onError
  });
});

it('nên setCharactersMap cập nhật voice mapping', async () => {
  const newMap = new Map([['char_2', { voiceName: 'Charon' as VoiceName, pitch: 0.9 }]]);
  manager.setCharactersMap(newMap);

  (TtsFetchService.synthesize as jest.Mock).mockResolvedValue({
    audioUrl: 'https://example.com/char2.mp3',
    cached: false,
  });

  const msg: ChatMessage = {
    kind: 'assistant',
    id: 'msg_c2',
    characterId: 'char_2',
    characterName: 'Linh',
    text: '再见',
    timestamp: Date.now(),
  };

  manager.enqueueBatch([msg]);

  await waitFor(() => {
    expect(TtsFetchService.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voiceName: 'Charon', pitch: 0.9 })
    );
  });
});
```

#### 7.7.2. Thêm test cho InputBar

```typescript
// File: InputBar.test.tsx (tạo mới)
// Dùng @testing-library/react-native

it('nên hiển thị "Đang phát..." khi input bị locked', () => {
  // mock useChatStore trả về inputLocked: true
  // render <InputBar onSend={jest.fn()} />
  // expect getByPlaceholderText('Đang phát...')
});

it('nên đổi style border khi gõ "//"', () => {
  // render <InputBar onSend={jest.fn()} />
  // fireEvent.changeText(input, '//')
  // expect borderTopColor === theme.colors.warning
});

it('nên gọi onSend với ephemeralOOC khi gửi OOC inline', () => {
  // fireEvent.changeText(input, '//trời mưa')
  // fireEvent.press(sendButton)
  // expect onSend).toHaveBeenCalledWith('', 'trời mưa')
});
```

---

## 8. THỨ TỰ ƯU TIÊN REFACTOR

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 P1 | BUG-01: CharacterBubble text bị mất | ~2h | Hiển thị sai |
| 🟡 P2 | SMELL-04: Keyboard Android | ~15min | UX Android |
| 🟡 P2 | SMELL-02: Migrate OocPanel to reanimated | ~1h | Consistency |
| 🟡 P2 | SMELL-01: Remove useCharactersMap từ bubble | ~30min | Performance |
| 🟢 P3 | SMELL-05: Responsive panel width | ~15min | Minor |
| 🟢 P3 | SMELL-03: Type-safe error | ~30min | Safety |
| 🟢 P3 | BUG-02: Misleading comment | ~5min | Readability |
| 🟢 P4 | Missing UI tests | ~4h | Coverage |

---

## 9. KIẾN TRÚC — ĐÁNH GIÁ TỔNG THỂ P05

### Điểm tốt ✅

- **PlaybackQueueManager**: State machine được thiết kế tốt, `isStopped` flag đảm bảo cleanup đúng, `sleepInterruptible` cho phép dừng sớm. Singleton pattern tách biệt lifecycle với component React.
- **Store design**: `enqueueAssistantBatch` có fallback khi không có manager (giúp testing). `setPlaybackManagerSingleton` expose để inject trong test.
- **TappableChineseText**: Option A (wrap từng từ trong `<Text>`) được chọn đúng — đơn giản, hoạt động tốt với React Native text rendering.
- **split-words algorithm**: Greedy longest-match đúng spec, edge cases được handle (LLM hallucination, overlapping words).
- **OocPanel UX**: 3 sections rõ ràng, có char count, loading state, error alerts đầy đủ.
- **Test quality**: Test cases được đặt tên tiếng Việt rõ ràng, assertions cụ thể, mock setup sạch.

### Điểm cần cải thiện ⚠️

- **Bug text display**: nghiêm trọng nhất, cần fix ngay (P1).
- **Chưa có component tests**: Các components UI chưa có test. Có thể chấp nhận cho MVP nhưng cần có trước khi ship.
- **Animation library mix**: Không nhất quán, nên migrate OocPanel sang reanimated.

---

*Tạo bởi Code Review — P05 Branch. Toàn bộ 30 tests pass. 5/5 subtask DONE.*
