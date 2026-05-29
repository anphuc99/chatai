# 04 — API Specification (REST)

> Mọi endpoint đều dùng `Authorization: Bearer <Firebase ID Token>` trừ khi ghi chú `(public)`.  
> Mọi endpoint mutating yêu cầu header `Idempotency-Key: <uuid>`.  
> Content-Type mặc định: `application/json`.  
> Error envelope:  
> ```json
> { "error": { "code": "STRING_CODE", "message": "human readable", "details": {} } }
> ```

---

## 1. Auth

| Method | Path | Mô tả | Body | Response |
|--------|------|-------|------|----------|
| POST | `/auth/google-signin` | Verify Google ID token, upsert user | `{idToken}` | `200 UserDto` |
| POST | `/auth/logout` | Thu hồi refresh token nếu có | — | `204` |

**Errors**: `401 INVALID_TOKEN`, `403 USER_DISABLED`.

---

## 2. Users / Profile

| Method | Path | Mô tả | Body / Query | Response |
|--------|------|-------|--------------|----------|
| GET | `/users/me` | Lấy profile hiện tại | — | `UserDto` |
| PATCH | `/users/preferences` | Cập nhật setting | `{narratorLanguage?, showPinyin?, ttsSpeed?, hskLevel?, tutorialStep?}` | `204` |
| POST | `/users/avatar` (multipart) | Upload avatar | `file` | `{photoURL}` |

**UserDto**:
```jsonc
{
  "uid":"...", "email":"...", "displayName":"...", "photoURL":"...",
  "hskLevel":"HSK3", "preferences":{"narratorLanguage":"vi","showPinyin":true,"ttsSpeed":1.0},
  "gems":120, "currentStreak":5, "highestStreak":12, "streakFreezeCount":1,
  "tutorialStep":7
}
```

---

## 3. Stories

| Method | Path | Mô tả | Body | Response |
|--------|------|-------|------|----------|
| GET | `/stories` | Liệt kê stories của user | — | `Story[]` |
| GET | `/stories/:id` | Chi tiết | — | `Story` |
| POST | `/stories` | Tạo story | `{title, initialSetting}` | `Story` |
| PATCH | `/stories/:id` | Cập nhật title/setting | `{title?, initialSetting?}` | `Story` |
| DELETE | `/stories/:id` | Xoá (cascade characters/sessions) | — | `204` |

`Story`: `{id, title, initialSetting, currentProgress, characterCount, sessionCount, createdAt, updatedAt}`

---

## 4. Characters

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/stories/:storyId/characters` | — | `Character[]` |
| POST | `/stories/:storyId/characters` | `{name, age, personality, avatarUrl?, voiceName, pitch}` | `Character` |
| PATCH | `/characters/:id` | partial fields | `Character` |
| DELETE | `/characters/:id` | — | `204` *(messages.character_id → NULL)* |
| POST | `/characters/:id/avatar` (multipart) | `file` | `{avatarUrl}` |

---

## 5. Chat

| Method | Path | Mô tả | Body | Response |
|--------|------|-------|------|----------|
| POST | `/chat/sessions` | Bắt đầu / resume session | `{storyId}` | `{sessionId, isResumed, initialActiveCharacters}` |
| GET | `/chat/sessions/:id/history` | Đọc cache `.jsonl` để hydrate UI | — | `{messages:ChatMessage[], persistentOOC, activeCharacters}` |
| POST | `/chat/sessions/:id/message` | Gửi 1 lượt user | `SendMessagePayload` | `AssistantBatch` |
| POST | `/chat/sessions/:id/auto-continue` | Auto chat 1 vòng | — | `AssistantBatch` |
| POST | `/chat/sessions/:id/ooc` | Set Persistent / push Ephemeral | `{type:"persistent"\|"ephemeral", text}` | `204` |
| POST | `/chat/sessions/:id/character-toggle` | Bật/tắt nhân vật trong cảnh | `{characterId, on}` | `204` |
| POST | `/chat/sessions/:id/temp-character` | Thêm nhân vật tạm thời | `{name, description}` | `{tempId}` |
| POST | `/chat/sessions/:id/shop-choice` | Phản hồi Shop Contextual | `{choice:"buy"\|"decline"}` | `AssistantBatch` |
| POST | `/chat/sessions/:id/end` | Kết thúc & tạo Journal | — | `{journalSessionId, summary, gemsEarned}` |

**SendMessagePayload**:
```jsonc
{
  "userMessage":"我们去喝奶茶吧",
  "ephemeralOOC":"hai bạn đang đi trên phố",
  "temporaryCharacters":[{"tempId":"...","name":"...","description":"..."}]
}
```

**AssistantBatch**:
```jsonc
{
  "messages":[
    {
      "id":"...", "role":"assistant", "characterName":"Linh",
      "text":"好啊！", "translation":"Được thôi!",
      "emotion":"vui","intensity":"thường",
      "words":[{"hz":"奶茶","py":"nǎichá","vn":"trà sữa"}],
      "shopEvent": null,
      "timestamp": 1730000000
    }
  ],
  "triggerMemory": false
}
```

**Errors chính**: `400 INVALID_PAYLOAD`, `404 SESSION_NOT_FOUND`, `409 SESSION_LOCKED`, `429 RATE_LIMIT`, `503 LLM_UNAVAILABLE`.

---

## 6. TTS

| Method | Path | Mô tả | Body | Response |
|--------|------|-------|------|----------|
| POST | `/tts/synthesize` | Sinh / lấy cache audio | `{text, voiceName, emotion?, intensity?, pitch?}` | `{audioUrl, cached:bool}` |
| POST | `/tts/test-voice` | Nghe thử khi tạo character | `{voiceName, pitch, sampleText?}` | `{audioUrl}` |

**Errors**: `404 REFERENCE_NOT_FOUND`, `503 TTS_ENGINE_DOWN`.

---

## 7. Journal

| Method | Path | Mô tả | Response |
|--------|------|-------|----------|
| GET | `/journal/sessions?storyId=&page=` | Danh sách phiên đã end | `{items:SessionSummary[], nextCursor}` |
| GET | `/journal/sessions/:id` | Chi tiết phiên (đầy đủ messages) | `SessionDetail` |
| GET | `/journal/sessions/:id/export?format=pdf` *(Premium)* | Export PDF | binary |

`SessionSummary`: `{id, storyTitle, summary, startedAt, endedAt, messageCount, wordCount}`  
`SessionDetail` thêm `messages: ChatMessage[]` sorted theo `turn_order`.

---

## 8. Vocabulary

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/vocabulary/save` | `{hz, py, vn, sourceSentence?, sourceSessionId?}` | `{wordId, isNew}` |
| GET | `/vocabulary` | — | `VocabWord[]` |
| GET | `/vocabulary/due` | — | `VocabWord[]` (next_review_date ≤ now) |
| DELETE | `/vocabulary/:id` | — | `204` |
| POST | `/vocabulary/review-session/start` | — | `{sessionId, queue:VocabWord[], systemPrompt}` |
| POST | `/vocabulary/review-session/:id/turn` | `{userText}` | `{assistantText, success, missed:hz[]}` |
| POST | `/vocabulary/review-session/:id/finish` | — | `{wordsMastered, wordsAdvanced, gemsEarned}` |

---

## 9. Missions / Streak

| Method | Path | Mô tả | Response |
|--------|------|-------|----------|
| GET | `/missions/today` | Lazy ensure + trả danh sách | `UserMission[]` |
| POST | `/missions/:id/claim` | Nhận thưởng (nếu `completed`) | `{gemsEarned, newBalance}` |
| GET | `/streak` | Trạng thái streak | `{current, highest, freezes, lastDate}` |

---

## 10. Shop

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/shop/items` | — | `ShopItem[]` |
| POST | `/shop/buy` | `{itemId}` | `{newBalance, inventoryDelta}` |
| GET | `/shop/inventory` | — | `InventoryItem[]` |

**Errors**: `402 NOT_ENOUGH_GEMS`, `404 ITEM_NOT_FOUND`, `410 ITEM_INACTIVE`.

---

## 11. Memory (Manual / Premium)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/memory/pin` | `{sessionId, range:[start,end], note?}` | `{memoryId}` |
| GET | `/memory?storyId=` | Liệt kê (Premium) | `MemoryEntry[]` |

---

## 12. Realtime (Tuỳ chọn — SSE / WebSocket)

| Kênh | Mô tả | Payload |
|------|-------|---------|
| `GET /realtime/stream` (SSE) | Push update gems/mission/streak/system notif | `{type, payload}` |

Event types: `MISSION_COMPLETED`, `GEM_UPDATED`, `STREAK_UPDATED`, `SYSTEM_NOTICE`.

---

## 13. Conventions chung

- **Pagination**: cursor-based (`?cursor=xxx&limit=20`), không offset.
- **Sort**: mặc định `updatedAt DESC` cho list.
- **Versioning**: prefix `/api/v1/...`.
- **Rate limit**: trả header `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Trace**: header `X-Request-Id` (server tạo nếu client không gửi).
- **Localization**: `Accept-Language: vi-VN` mặc định, dùng cho thông báo error.

---

## 14. Bảng Idempotency-Key matrix

| Endpoint | Cần Idem-Key? | TTL cache |
|----------|---------------|-----------|
| POST /chat/sessions/:id/message | ✅ | 24h |
| POST /chat/sessions/:id/end | ✅ | 24h |
| POST /shop/buy | ✅ | 24h |
| POST /vocabulary/save | ✅ | 24h |
| POST /missions/:id/claim | ✅ | 24h |
| POST /tts/synthesize | ❌ (đã idempotent qua hash) | — |
| GET * | ❌ | — |

---

## 15. Resource Quotas & Limits

| Resource | Limit | Error Code |
|----------|-------|-----------|
| Stories per user | 20 | `QUOTA_EXCEEDED` |
| Characters per story | 10 | `QUOTA_EXCEEDED` |
| Active sessions (concurrent) | 1 per user | `SESSION_ALREADY_ACTIVE` |
| Temporary characters per message | 3 | `400 INVALID_PAYLOAD` |
| Message text length | 2000 chars | `400 INVALID_PAYLOAD` |
| OOC text length | 500 chars | `400 INVALID_PAYLOAD` |
| Vocabulary items per user | 5000 | `QUOTA_EXCEEDED` |
| Avatar file size | 5MB | `413 FILE_TOO_LARGE` |
| `.jsonl` file max size | 10MB (~500 messages) | Auto-trigger force end-chat |
| User display name | 50 chars | `400 INVALID_PAYLOAD` |
| Story title | 100 chars | `400 INVALID_PAYLOAD` |
| Character personality | 500 chars | `400 INVALID_PAYLOAD` |

---

## 16. Error Handling & Retry Patterns

### 16.1. LLM Failure

| Scenario | Retry | Fallback |
|----------|-------|----------|
| JSON parse fail | 2 retries with stronger instruction | Generic narrator response |
| Timeout (>30s) | 1 retry | `503 LLM_UNAVAILABLE` |
| Model not loaded | 0 retry | `503 LLM_UNAVAILABLE` |
| Invalid schema (Zod fail) | 1 retry | Generic narrator response |

### 16.2. TTS Failure

| Scenario | Retry | Fallback |
|----------|-------|----------|
| GPT-SoVITS down | 0 retry | `503 TTS_ENGINE_DOWN` (client shows text-only) |
| Reference not found | 0 retry | Fallback to `neutral` emotion |
| FFmpeg fail | 1 retry | Return un-pitched audio |
| Firebase upload fail | 2 retry | Serve from local buffer |

### 16.3. End Chat Failure (Compensation Pattern)

```
1. Postgres transaction: INSERT messages + UPDATE sessions + UPDATE stories
   → If FAIL: rollback, return 500, .jsonl preserved (retry safe)
   
2. Success → Enqueue memory write (BullMQ)
   → If FAIL: log warning, memory not written (non-critical)
   
3. Success → Cleanup .jsonl
   → If FAIL: log warning, cron will cleanup later (7 days)
   
4. Sync gems/streak to Firestore
   → If FAIL: log warning, will sync on next request
```

### 16.4. Client Retry Strategy

| Error Code | Client Action |
|-----------|---------------|
| 401 | Refresh Firebase token, retry 1x |
| 409 (SESSION_LOCKED) | Show "Đang xử lý...", retry after 3s (max 2x) |
| 429 | Show rate limit message, disable input for X-RateLimit-Reset seconds |
| 503 (LLM/TTS down) | Show degraded mode message, allow text-only chat |
| 5xx (other) | Show generic error, retry 1x after 2s |

---

## 17. Offline & Reconnection

| Scenario | Client Behavior |
|----------|----------------|
| Network lost during chat | Queue message locally, show "Đang gửi..." |
| Network restored | Auto-retry queued message (1x) |
| Network lost before response | Show timeout after 30s, unlock input |
| App killed during playback | On reopen: GET /history to restore state |
| App killed during End Chat | On reopen: check session status, retry end if still active |
