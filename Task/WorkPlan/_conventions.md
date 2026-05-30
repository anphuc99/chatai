# Conventions — Naming, Style, Error Codes

Apply across all workplans.

---

## 1. Naming Conventions

### Server (NestJS / TypeScript)
- **Files**: kebab-case. Suffix theo loại:
  - `*.controller.ts`
  - `*.service.ts`
  - `*.module.ts`
  - `*.dto.ts`
  - `*.entity.ts` (Prisma type wrappers nếu cần)
  - `*.guard.ts`, `*.interceptor.ts`, `*.filter.ts`, `*.decorator.ts`
- **Classes**: PascalCase + đúng suffix (`AuthService`, `ChatController`, `SendMessageDto`).
- **Methods**: camelCase, verb-first (`createStory`, `handleUserTurn`, `verifyOwnership`).
- **Constants**: UPPER_SNAKE_CASE (`MAX_HISTORY_TOKENS`).
- **Interfaces**: PascalCase, KHÔNG prefix `I` (`UserContext`, `ChatMessage`).
- **Enums**: PascalCase, values UPPER_SNAKE (`enum Role { USER, ASSISTANT, PERSISTENT_OOC }`).

### Client (React Native / TypeScript)
- **Files**: PascalCase cho components/screens (`ChatRoomScreen.tsx`, `MessageBubble.tsx`), camelCase cho hooks/services/utils (`useChat.ts`, `chat.service.ts`).
- **Stores (Zustand)**: file kebab-case, hook camelCase (`auth.store.ts` → `useAuthStore`).
- **Folders**: kebab-case feature slices.

### Database (Postgres / Prisma)
- **Tables**: snake_case plural (`users_meta`, `stories`, `user_missions`).
- **Columns**: snake_case (`user_id`, `created_at`, `tutorial_step`).
- **Prisma models**: PascalCase singular with `@@map` to snake_case plural.
- **Indexes**: tên auto theo Prisma, custom với `@@index([cols])`.

### API
- **Endpoints**: `/api/v1/{resource}/{id?}/{sub-resource?}` — kebab-case.
- **Query params**: camelCase (`?storyId=xxx&cursor=yyy`).
- **JSON body**: camelCase keys.
- **Response wrapping**: error envelope `{ error: { code, message, details } }`, success raw.

---

## 2. Error Code Registry

| Code | HTTP | Mô tả |
|------|------|-------|
| `INVALID_TOKEN` | 401 | Firebase ID token sai / hết hạn |
| `USER_DISABLED` | 403 | Account bị disable |
| `NOT_FOUND` | 404 | Generic not found |
| `FORBIDDEN` | 403 | Không có quyền với resource |
| `INVALID_PAYLOAD` | 400 | Validation fail |
| `SESSION_NOT_FOUND` | 404 | Chat session không tồn tại |
| `SESSION_LOCKED` | 409 | Có request khác đang xử lý session |
| `SESSION_ALREADY_ENDED` | 409 | Session đã end, không thao tác được |
| `STORY_HAS_ACTIVE_SESSION` | 409 | Không xoá story đang có session active |
| `RATE_LIMIT` | 429 | Vượt rate limit |
| `LLM_UNAVAILABLE` | 503 | Ollama down hoặc timeout |
| `TTS_ENGINE_DOWN` | 503 | GPT-SoVITS down |
| `REFERENCE_NOT_FOUND` | 404 | Voice reference audio không có |
| `NOT_ENOUGH_GEMS` | 402 | Số dư gem không đủ |
| `ITEM_NOT_FOUND` | 404 | Shop item không có |
| `ITEM_INACTIVE` | 410 | Shop item đã inactive |
| `MISSION_NOT_CLAIMABLE` | 409 | Mission chưa completed hoặc đã claim |
| `NO_WORDS_DUE` | 400 | Không có từ nào đến hạn review |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency-Key reuse với body khác |
| `LLM_PARSE_FAIL` | 502 | LLM trả JSON không parse được sau retry |

---

## 3. Method I/O Style Spec (dùng trong workplan)

Mỗi method spec ghi theo format:

```
methodName(param1: Type, param2: Type): ReturnType

Input:
  - param1 (Type, required, validation): mô tả
  - param2 (Type, optional, default=X): mô tả

Output:
  - ReturnType: mô tả shape

Logic:
  1. Step 1
  2. Step 2
  3. Step 3

Side Effects:
  - DB: INSERT/UPDATE/DELETE bảng nào
  - Redis: keys nào
  - Event emit: tên event + payload

Throws:
  - ErrorCode (HTTP): condition
```

---

## 4. Common Type Aliases (tham chiếu)

```
UserId       = string (Firebase UID, 28 chars)
SessionId    = string (UUID v4)
StoryId      = string (UUID v4)
CharacterId  = string (UUID v4)
MessageId    = string (UUID v4)
Timestamp    = number (Unix epoch ms)
GemAmount    = number (integer ≥ 0)
HskLevel     = 'HSK1' | 'HSK2' | 'HSK3' | 'HSK4' | 'HSK5' | 'HSK6'
VoiceName    = 'Achernar' | 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Leda' | 'Zephyr'
Emotion      = 'Angry'|'Shouting'|'Disgusted'|'Sad'|'Scared'|'Surprised'|'Shy'|'Affectionate'|'Happy'|'Excited'|'Serious'|'Neutral'
Intensity    = 'low' | 'medium' | 'high'
Role         = 'user' | 'assistant' | 'persistent_ooc' | 'ephemeral_ooc'
MemoryType   = 'plot' | 'character'
```

---

## 5. Dependency Injection (NestJS)

- Mọi service inject qua constructor.
- Module nào export service nào → ghi rõ trong workplan.
- Global modules: `PrismaModule`, `RedisModule`, `LoggerModule`, `EventEmitterModule`, `ConfigModule`.

---

## 6. Testing Convention

- File test cùng folder: `*.spec.ts` (unit), `*.e2e-spec.ts` (e2e).
- Mỗi public method có tối thiểu 1 test happy + 1 test error case.
- Mock dependencies bằng `jest.mock()` hoặc `Test.createTestingModule().overrideProvider()`.
- Coverage tối thiểu: services 80%, controllers 60%.
