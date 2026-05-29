# Phase 13 — Premium Polish + Advanced Features

> **Mục tiêu**: Các tính năng nâng cao, polish UX, performance optimization.  
> **Phụ thuộc**: Tất cả phase trước.

---

## P13.T1 — Speech-to-Text (STT) Input

**Status**: `[ ]`  
**Depends on**: P12.T3 (Phase 12 hoàn thành)

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   npx expo install expo-speech-recognition
   # hoặc dùng Whisper API (server-side)
   ```
2. Option A — On-device (Expo Speech Recognition):
   - Tạo `src/features/chat/components/VoiceInputButton.tsx`:
     - Nút microphone bên cạnh Send button.
     - Press and hold → start recording.
     - Release → stop recording → transcribe → fill TextInput.
   - Permissions: request microphone permission.
   - Language: set recognition language = `zh-CN`.
3. Option B — Server-side (Whisper API):
   - Record audio client-side.
   - Upload to server endpoint `POST /stt/transcribe` (multipart audio file).
   - Server gọi Whisper model (local hoặc API) → trả text.
   - Fill TextInput.
4. UI:
   ```
   ┌─────────────────────────────────┐
   │ [TextInput...........] [🎤] [➤] │
   └─────────────────────────────────┘
   ```
   Khi recording:
   ```
   ┌─────────────────────────────────┐
   │  🔴 Đang ghi âm...    [⏹ Huỷ]  │
   └─────────────────────────────────┘
   ```
5. Feature flag: `ENABLE_STT=true` trong config, disable nếu device không support.

**Output kiểm chứng**:
- Nhấn giữ mic → nói tiếng Trung → release → text xuất hiện.
- Gửi text → chat tiếp tục bình thường.
- Permission denied → graceful message.

---

## P13.T2 — LLM Streaming Response (SSE Token-by-Token)

**Status**: `[ ]`  
**Depends on**: P13.T1

**Mô tả chi tiết**:
1. Cập nhật `LlmService`:
   - Thêm option `stream: true` khi gọi Ollama.
   - Return `ReadableStream` thay vì full response.
   - Parse streamed JSON tokens.
2. Cập nhật `ChatController.sendMessage`:
   - Option: Accept header `text/event-stream` → stream response.
   - Mỗi token chunk → SSE event.
   - Client accumulate tokens → parse JSON khi complete.
3. Client integration:
   - `ChatService.postMessageStreaming`: fetch with streaming reader.
   - Accumulate response → khi JSON complete → parse → enqueue bubbles.
   - UI: hiển thị typing indicator "..." while streaming.
4. Challenges:
   - JSON mode + streaming: cần buffer toàn bộ rồi parse (JSON phải complete).
   - Alternative: stream plain text first, validate JSON after complete.
5. Feature flag: `ENABLE_STREAMING=true`.

**Output kiểm chứng**:
- Response appears faster (first token visible quicker).
- Final result identical to non-streaming.
- Fallback to non-streaming nếu error.

---

## P13.T3 — Performance Optimization + Load Testing

**Status**: `[ ]`  
**Depends on**: P13.T2

**Mô tả chi tiết**:
1. Server optimizations:
   - **Connection pooling**: Prisma pool size = 10.
   - **Redis pipeline**: Batch multiple Redis ops.
   - **Query optimization**: Add missing indexes, use `SELECT` specific fields.
   - **Memory**: Monitor Node.js heap, tune GC.
   - **TTS cache hit rate**: Monitor + log.
2. Client optimizations:
   - **FlatList optimization**: `getItemLayout`, `removeClippedSubviews`.
   - **Image caching**: `expo-image` hoặc `FastImage`.
   - **Bundle size**: Analyze with `expo-doctor`, tree-shake unused imports.
   - **Audio memory**: Strict cleanup (unload sounds after use).
3. Load testing:
   - Cài `k6` hoặc `artillery`.
   - Scenarios:
     - 10 concurrent users chatting.
     - 50 TTS requests/minute.
     - 100 vocabulary saves/minute.
   - Identify bottlenecks → fix.
4. Monitoring setup:
   - Sentry for crash reporting (mobile + server).
   - Custom metrics: response times, cache hit rates, LLM latency.

**Output kiểm chứng**:
- Load test pass: p95 < 2s for chat, p95 < 5s for TTS.
- No memory leaks after 1h continuous use.
- Sentry capturing errors correctly.

---

## P13.T4 — Final QA + Build + Deploy Prep

**Status**: `[ ]`  
**Depends on**: P13.T3

**Mô tả chi tiết**:
1. Full regression test:
   - Run toàn bộ unit tests + integration tests.
   - Manual test checklist cho mỗi feature.
   - Cross-device test: Android + iOS (nếu applicable).
2. Security audit:
   - `npm audit` → fix vulnerabilities.
   - Review Firestore rules + Storage rules.
   - Verify all endpoints authenticated.
   - Check no PII in logs.
   - Verify data isolation (user A ≠ user B).
3. EAS Build setup:
   - `eas.json` configuration (development, preview, production).
   - `eas build --profile production`.
   - Test production build on real device.
4. Server deployment prep:
   - Dockerfile for production (multi-stage build).
   - Environment variables documentation.
   - Database migration strategy for production.
   - Backup strategy for Postgres.
5. Documentation update:
   - API documentation final review.
   - README with setup instructions.
   - Deployment runbook.

**Output kiểm chứng**:
- All tests pass.
- Production build runs correctly.
- Security audit clean.
- Documentation complete.

---
