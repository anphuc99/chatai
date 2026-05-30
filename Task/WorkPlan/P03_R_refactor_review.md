# P03.R — Code Review & Refactor Fixes (Post-Review Phase 3)

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P03.R |
| Phase | 3 — Post-Review |
| Branch reviewed | `Task/P03` vs `main` |
| Reviewer | Senior Code Review |
| Date | 2026-05-30 |
| Depends on | P03.T1–T5 hoàn thành |
| Complexity | Low-Medium |
| Risk | High (C1 là bug chặn playback) |

---

## 2. STATUS TỔNG QUAN

| Task | Mô tả | Status |
|------|-------|--------|
| P03.T1 | GPT-SoVITS Python Wrapper | ⬜ REJECTED (by design — dùng `api_v2.py` sẵn có) |
| P03.T2 | Server TtsModule (RefIndex + Cache + FFmpeg) | ✅ DONE |
| P03.T3 | Server TTS Controller + Rate Limiting | ✅ DONE |
| P03.T4 | Client TtsService + CharacterEditor | ✅ DONE |
| P03.T5 | Firebase Storage Rules | ✅ DONE |

**Kết luận**: Phase 3 implement đầy đủ theo spec. Có 1 critical bug chặn playback cần fix trước merge.

---

## 3. ISSUES PHÁT HIỆN

**Ưu tiên**:
1. 🔴 Critical — BLOCKING merge
2. 🟠 High — Nên fix trước merge
3. 🟡 Medium — Fix sau merge
4. 🟢 Low — Nice to have

---

### 🔴 Critical (BLOCKING)

#### C1 — Public URL vs Auth-Required Storage Rules

**File**: [apps/server/src/modules/tts/tts.service.ts](apps/server/src/modules/tts/tts.service.ts) + [storage.rules](storage.rules)

`TtsService.checkCache()` trả `getPublicUrl()` — URL dạng `https://storage.googleapis.com/<bucket>/tts_audio/<hash>.wav`. URL này **không mang Firebase auth token** khi client (expo-av) gọi trực tiếp.

`storage.rules` yêu cầu `allow read: if request.auth != null` — Firebase Storage Rules chỉ áp dụng cho Firebase SDK calls. URL `storage.googleapis.com` bypass Firebase rules và dùng GCS IAM. Nếu bucket không có `allUsers: objectViewer` trong GCS IAM (mặc định không có) → client nhận **403 Forbidden** khi phát audio.

---

### 🟠 High

#### H1 — `uploadTtsAudio` trả `AvatarUrls` type sai

**File**: [apps/server/src/shared/firebase/storage.service.ts](apps/server/src/shared/firebase/storage.service.ts)

Method `uploadTtsAudio` trả `AvatarUrls` — copy-paste từ `uploadAvatar`. Cần return type riêng.

#### H2 — `@CurrentUser() _user` unused trong TtsController

**File**: [apps/server/src/modules/tts/tts.controller.ts](apps/server/src/modules/tts/tts.controller.ts)

Cả 2 endpoint inject `_user: AuthUser` nhưng không dùng. Throttler đã tự extract `uid` từ `req.user`.

#### H3 — Emotion casing inconsistency tại API boundary

**File**: [apps/server/src/modules/tts/tts.constants.ts](apps/server/src/modules/tts/tts.constants.ts) + [apps/server/src/modules/tts/reference-index.manager.ts](apps/server/src/modules/tts/reference-index.manager.ts)

`EMOTIONS` dùng PascalCase (`'Neutral'`, `'Happy'`) nhưng `buildIndex()` và `pickRandom()` convert sang lowercase khi lập chỉ mục. Internally consistent nhưng gây confusion ở API boundary: DTO nhận `"Happy"`, index stores `"happy"`. Cần document normalize behavior hoặc normalize tại DTO layer.

---

### 🟡 Medium

#### M1 — Stray comment trong `tts.module.ts`

**File**: [apps/server/src/modules/tts/tts.module.ts](apps/server/src/modules/tts/tts.module.ts)

Comment rác `// Force IDE re-index` ở dòng cuối file, cần xóa.

#### M2 — `sourceIndex: any[]` chưa có interface type

**File**: [apps/server/src/modules/tts/reference-index.manager.ts](apps/server/src/modules/tts/reference-index.manager.ts)

`private sourceIndex: any[]` cần được type chính xác (xem fix R4 bên dưới).

#### M3 — `initAudioMode()` không được await trong `App.tsx`

**File**: [apps/mobile/App.tsx](apps/mobile/App.tsx)

`initAudioMode()` trả Promise không được xử lý. Function có internal try-catch nên không crash, nhưng nên dùng `.catch()` để lỗi không bị nuốt im lặng.

#### M4 — Lock retry dùng `setTimeout` raw

**File**: [apps/server/src/modules/tts/tts.service.ts](apps/server/src/modules/tts/tts.service.ts)

`await new Promise((resolve) => setTimeout(resolve, 1000))` nên extract thành helper `sleep(ms)` để rõ intent.

---

### 🟢 Low (Nice to have)

#### L1 — Vietnamese JSDoc comments trong client `tts.service.ts`

**File**: [apps/mobile/src/features/character/services/tts.service.ts](apps/mobile/src/features/character/services/tts.service.ts)

Các block comments `/** Gọi API nghe thử... */` mô tả WHAT, không phải WHY — vi phạm coding conventions.

#### L2 — Defensive null-check thừa trong `pickRandom`

**File**: [apps/server/src/modules/tts/reference-index.manager.ts](apps/server/src/modules/tts/reference-index.manager.ts)

`if (firstKey)` bên trong `if (keys.length > 0)` là redundant — `keys[0]` guaranteed non-null khi length > 0.

#### L3 — `uploadAndCache` nên là private method tách biệt

**File**: [apps/server/src/modules/tts/tts.service.ts](apps/server/src/modules/tts/tts.service.ts)

Spec yêu cầu private method `uploadAndCache(hash, buffer)` nhưng logic inline trong `synthesize()` làm method dài hơn cần thiết.

#### L4 — Throttler fail-open policy chưa được document

**File**: [apps/server/src/shared/throttler/redis-throttler.guard.ts](apps/server/src/shared/throttler/redis-throttler.guard.ts)

Guard tự `return true` khi Redis down (intentional để tránh outage), nhưng behavior này không có comment giải thích.

---

## 4. ĐIỂM MẠNH

- **Redis lock pattern** đúng: double-check sau acquire lock, retry wait loop thay vì throw ngay — xử lý concurrent requests tốt.
- **FfmpegService** spawn pattern đúng: stdin pipe, stdout collect, timeout 10s với SIGKILL, stderr capture cho debug.
- **ReferenceIndexManager** dual source (filesystem → static fallback): linh hoạt cho dev vs prod.
- **Test coverage** đầy đủ: spec files cho tất cả services (`tts.service.spec.ts`, `gptsovits.client.spec.ts`, `reference-index.manager.spec.ts`, `ffmpeg.service.spec.ts`, `tts.controller.spec.ts`).
- **CharacterEditorScreen** cleanup effect `useEffect(() => () => ttsClientService.stop(), [])` đúng — tránh memory leak khi navigate.
- **Audio init** `playsInSilentModeIOS: true` — audio phát được khi device silent mode.

---

## 5. HƯỚNG DẪN REFACTOR

### R1: Fix Critical — Public URL → Signed URL 🔴 BLOCKING

**File**: [apps/server/src/modules/tts/tts.service.ts](apps/server/src/modules/tts/tts.service.ts)

```typescript
// Thêm constant vào class:
private readonly TTS_SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Sửa checkCache():
private async checkCache(hash: string): Promise<string | null> {
  const path = `tts_audio/${hash}.wav`;
  const exists = await this.storage.exists(path);
  if (!exists) return null;
  return this.storage.getSignedUrl(path, this.TTS_SIGNED_URL_TTL_MS); // ← thay getPublicUrl
}

// Sửa phần upload trong synthesize() — thay inline bằng method:
private async uploadAndCache(hash: string, buffer: Buffer): Promise<string> {
  await this.storage.uploadTtsAudio(hash, buffer);
  return this.storage.getSignedUrl(`tts_audio/${hash}.wav`, this.TTS_SIGNED_URL_TTL_MS);
}
```

Trong `synthesize()`, thay:
```typescript
const { publicUrl } = await this.storage.uploadTtsAudio(hash, audioBuf);
return { url: publicUrl, fromCache: false, cacheHash: hash };
```
Bằng:
```typescript
const url = await this.uploadAndCache(hash, audioBuf);
return { url, fromCache: false, cacheHash: hash };
```

> **Lưu ý TTL**: Signed URL expire sau 24h. Client không nên cache URL qua session. Nếu cần URL lâu dài hơn, tăng TTL hoặc đổi storage rules sang `allow read: if true` cho `tts_audio` (dùng hash làm obscurity).

---

### R2: Fix `uploadTtsAudio` Return Type 🟠 High

**File**: [apps/server/src/shared/firebase/storage.service.ts](apps/server/src/shared/firebase/storage.service.ts)

```typescript
// Thêm interface (export để tts.service.ts dùng nếu cần):
export interface StorageUploadResult {
  storagePath: string;
}

// Sửa uploadTtsAudio:
async uploadTtsAudio(cacheHash: string, buffer: Buffer): Promise<StorageUploadResult> {
  const storagePath = `tts_audio/${cacheHash}.wav`;
  const file = this.bucket.file(storagePath);
  await file.save(buffer, {
    contentType: 'audio/wav',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=2592000' },
  });
  return { storagePath };
}
```

---

### R3: Remove Unused `_user` Parameter 🟠 High

**File**: [apps/server/src/modules/tts/tts.controller.ts](apps/server/src/modules/tts/tts.controller.ts)

```typescript
// Trước:
async synthesize(@CurrentUser() _user: AuthUser, @Body() dto: SynthesizeDto)
async testVoice(@CurrentUser() _user: AuthUser, @Body() dto: TestVoiceDto)

// Sau:
async synthesize(@Body() dto: SynthesizeDto)
async testVoice(@Body() dto: TestVoiceDto)
```

Xóa cả import `CurrentUser` và `AuthUser` nếu không còn dùng nữa.

---

### R4: Add `ReferenceIndexEntry` Interface 🟡 Medium

**File**: [apps/server/src/modules/tts/reference-index.manager.ts](apps/server/src/modules/tts/reference-index.manager.ts)

```typescript
// Thêm trước class declaration:
interface ReferenceIndexEntry {
  voice: string;
  emotion: string;
  intensity: string;
  file: string;
  text?: string;
}

// Sửa field declaration:
private sourceIndex: ReferenceIndexEntry[] = [];

// Sửa buildIndex signature:
private buildIndex(sourceIndex: ReferenceIndexEntry[]): void {
```

---

### R5: Cleanup Code Quality 🟡 Medium

**[apps/server/src/modules/tts/tts.module.ts](apps/server/src/modules/tts/tts.module.ts)**
- Xóa dòng `// Force IDE re-index` ở cuối file.

**[apps/mobile/App.tsx](apps/mobile/App.tsx)**
```typescript
// Thay:
initAudioMode();
// Bằng:
initAudioMode().catch((e) => console.error('[App] Audio init failed', e));
```

**[apps/server/src/modules/tts/reference-index.manager.ts](apps/server/src/modules/tts/reference-index.manager.ts)**
```typescript
// Thay (redundant double null-check):
if (keys.length > 0) {
  const firstKey = keys[0];
  if (firstKey) {
    emoBlock = voiceBlock[firstKey];
  }
}
// Bằng:
if (keys.length > 0) {
  emoBlock = voiceBlock[keys[0]!];
}
```

---

### R6: Remove Vietnamese JSDoc Comments 🟢 Low

**File**: [apps/mobile/src/features/character/services/tts.service.ts](apps/mobile/src/features/character/services/tts.service.ts)

Xóa toàn bộ 3 JSDoc blocks:
```typescript
/** Gọi API nghe thử giọng nói từ Server */
/** Tải và phát âm thanh từ URL */
/** Dừng và giải phóng tài nguyên âm thanh hiện tại */
```

---

### R7: Add Throttler Fail-Open Comment 🟢 Low

**File**: [apps/server/src/shared/throttler/redis-throttler.guard.ts](apps/server/src/shared/throttler/redis-throttler.guard.ts)

```typescript
} catch (error) {
  if (error instanceof AppException) throw error;
  // Fail-open: nếu Redis down, bỏ qua rate limit để tránh service outage hoàn toàn
  this.logger.error(`Rate limit guard failed: ${error instanceof Error ? error.message : String(error)}`);
  return true;
}
```

---

## 6. CHECKLIST

- [ ] R1: Fix Public URL → Signed URL (BLOCKING — fix trước khi merge)
- [ ] R2: Fix `uploadTtsAudio` return type
- [ ] R3: Remove unused `_user` params trong TtsController
- [ ] R4: Add `ReferenceIndexEntry` interface
- [ ] R5: Cleanup stray comment + initAudioMode await + redundant null-check
- [ ] R6: Remove Vietnamese JSDoc comments
- [ ] R7: Add throttler fail-open comment

---

## 7. TEST PLAN SAU REFACTOR

1. `POST /tts/test-voice { voiceName: "Achernar", pitch: 1.0 }` → `audioUrl` là signed URL dạng `https://storage.googleapis.com/...?X-Goog-Signature=...`.
2. Client fetch signed URL trực tiếp (không có auth header) → 200 `audio/wav`.
3. Gọi 31 lần trong 60s → lần 31 trả 429 `RATE_LIMIT`.
4. `tsc --noEmit` → 0 TypeScript errors.
5. Signed URL sau 24h → 403 (expected expiry).
