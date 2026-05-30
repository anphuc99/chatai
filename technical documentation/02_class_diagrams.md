# 02 — Sơ đồ Class (UML)

Sơ đồ class chia 2 phía: **Client (React Native / MVVM)** và **Server (NestJS / Layered)**. Mỗi class kèm trách nhiệm rõ ràng để khi triển khai code, Dev tạo file đúng cấu trúc.

---

## 1. CLIENT — React Native (Zustand + Service)

### 1.1. Auth & Profile

```mermaid
classDiagram
    class AuthService {
        +signInWithGoogle() Promise~UserSession~
        +signOut() Promise~void~
        +getIdToken(forceRefresh: bool) Promise~string~
        +onAuthStateChanged(cb) Unsubscribe
    }

    class AuthStore {
        -currentUser: UserProfile
        -isAuthenticated: bool
        -isHydrating: bool
        +login() void
        +logout() void
        +hydrateFromCache() void
    }

    class ProfileService {
        +getMe() Promise~UserProfile~
        +updatePreferences(p: Preferences) Promise~void~
        +uploadAvatar(uri: string) Promise~string~
    }

    class UserProfile {
        +string uid
        +string email
        +string displayName
        +string photoURL
        +string hskLevel
        +Preferences preferences
        +int gems
        +int currentStreak
        +int tutorialStep
    }

    class Preferences {
        +string narratorLanguage
        +bool showPinyin
        +float ttsSpeed
    }

    AuthStore --> UserProfile
    AuthStore --> AuthService
    UserProfile --> Preferences
```

### 1.2. Chat (module trọng tâm)

```mermaid
classDiagram
    class ChatStore {
        -sessionId: string
        -messages: List~ChatMessage~
        -inputLocked: bool
        -autoMode: bool
        -isChoiceState: bool
        -activeCharacters: List~CharacterRef~
        -temporaryCharacters: List~TempCharacter~
        -persistentOOC: string
        -ephemeralOOC: string
        +sendMessage(text: string) Promise~void~
        +toggleCharacter(c: CharacterRef) void
        +addTemporaryCharacter(t: TempCharacter) void
        +setPersistentOOC(text: string) Promise~void~
        +stashEphemeralOOC(text: string) void
        +enterAutoMode() void
        +exitAutoMode() void
        +endChat() Promise~void~
    }

    class ChatService {
        +loadHistory(sessionId) Promise~List~ChatMessage~~
        +postMessage(payload: SendMessagePayload) Promise~AssistantBatch~
        +postAutoContinue(sessionId) Promise~AssistantBatch~
        +postOocEvent(sessionId, text) Promise~void~
        +endSession(sessionId) Promise~EndChatResult~
        +confirmShopChoice(sessionId, choice: 'buy'|'decline') Promise~AssistantBatch~
    }

    class PlaybackQueueManager {
        -queue: List~ChatMessage~
        -isPlaying: bool
        +enqueueBatch(messages: List~ChatMessage~) void
        +playNext() Promise~void~
        +stop() void
        -fetchAudio(msg) Promise~string~
        -waitNarratorRead() Promise~void~
    }

    class TtsService {
        +requestAudio(text, voiceName, emotion, intensity) Promise~string~
        +playUrl(url) Promise~void~
    }

    class OocComposer {
        +buildPersistent(text) string
        +buildOnCharacterToggle(char, on: bool) string
        +buildAutoContinue() string
    }

    class TutorialStore {
        -step: int
        +advance() void
        +shouldShow(stepName) bool
    }

    ChatStore --> ChatService
    ChatStore --> PlaybackQueueManager
    ChatStore --> OocComposer
    PlaybackQueueManager --> TtsService
    ChatStore ..> TutorialStore : "phát sự kiện học bài"
```

### 1.3. Story / Character / Journal / Vocabulary

```mermaid
classDiagram
    class StoryStore {
        -stories: List~Story~
        -currentStory: Story
        +fetchAll() Promise~void~
        +create(input) Promise~Story~
        +update(id, patch) Promise~void~
        +delete(id) Promise~void~
        +startChat(storyId) Promise~Session~
    }

    class CharacterStore {
        -characters: List~Character~
        +fetchByStory(storyId) Promise~void~
        +create(input) Promise~Character~
        +update(id, patch) Promise~void~
        +delete(id) Promise~void~
        +testVoice(voiceName, pitch, sampleText) Promise~void~
    }

    class JournalStore {
        -sessions: List~SessionSummary~
        -currentDetail: SessionDetail
        +fetchList() Promise~void~
        +fetchDetail(sessionId) Promise~void~
        +exportPDF(sessionId) Promise~Blob~
    }

    class VocabularyStore {
        -notebook: List~VocabWord~
        -reviewQueue: List~VocabWord~
        +collect(word: VocabWord) Promise~void~
        +loadDueToday() Promise~void~
        +startReviewSession() Promise~void~
        +submitAnswer(input: string) Promise~ReviewResult~
        +finishSession() Promise~void~
    }

    class VocabReviewEngine {
        -queue: List~VocabWord~
        -session: VocabSession
        -checkpoints: List~string~
        +nextBatch() List~VocabWord~
        +verifyUsage(used: List~string~) VerifyResult
        +shouldCheckpoint(tokens) bool
    }

    VocabularyStore --> VocabReviewEngine
```

### 1.4. Mission / Shop / Streak

```mermaid
classDiagram
    class MissionStore {
        -today: List~UserMission~
        +refresh() Promise~void~
        +onProgressEvent(evt) void
        +claim(missionId) Promise~void~
    }
    class StreakStore {
        -streak: int
        -lastDate: string
        +animateFire() void
    }
    class ShopStore {
        -items: List~ShopItem~
        -inventory: List~InventoryItem~
        +buy(itemId) Promise~void~
    }
```

---

## 2. SERVER — NestJS (Module → Controller → Service → Repository)

### 2.1. Auth & Users

```mermaid
classDiagram
    class AuthController {
        +verifyToken(body) AuthResponse
    }
    class AuthGuard {
        +canActivate(ctx) bool
    }
    class AuthService {
        +verifyIdToken(token) DecodedToken
        +ensureUserExists(decoded) UserEntity
    }
    class UsersController {
        +getMe(@User u) UserDto
        +patchPreferences(dto) void
        +uploadAvatar(file) AvatarResponse
    }
    class UsersService {
        +getProfile(uid) UserDto
        +updatePreferences(uid, dto) void
        +incrementGems(uid, delta) int
        +updateStreak(uid) StreakResult
    }
    class UsersRepository {
        +findById(uid) UserEntity
        +update(uid, patch) void
    }
    AuthController --> AuthService
    UsersController --> UsersService
    UsersService --> UsersRepository
```

### 2.2. Chat Module (cốt lõi)

```mermaid
classDiagram
    class ChatController {
        +startSession(dto) SessionResponse
        +sendMessage(dto, idemKey) AssistantBatchDto
        +getHistory(sessionId) HistoryDto
        +postEvent(sessionId, dto) void
        +endChat(sessionId) EndChatDto
        +autoContinue(sessionId) AssistantBatchDto
        +confirmShopChoice(sessionId, dto) AssistantBatchDto
    }

    class ChatOrchestrator {
        -historyStore: HistoryStoreService
        -oocService: OocService
        -memoryService: MemoryService
        -llmService: LlmService
        +handleUserTurn(ctx, userMsg) AssistantBatch
        +handleAutoTurn(ctx) AssistantBatch
        +handleShopChoice(ctx, choice) AssistantBatch
    }

    class HistoryStoreService {
        -fs: JsonlFileAdapter
        +append(sessionId, entry) void
        +readSince(sessionId, fromCheckpoint: bool) List~Entry~
        +readAll(sessionId) List~Entry~
        +writeCheckpoint(sessionId, summary) void
        +totalTokens(sessionId) int
        +cleanup(sessionId) void
    }

    class OocService {
        -redis: RedisClient
        +getPersistent(sessionId) string
        +setPersistent(sessionId, text) void
        +pullEphemeral(sessionId) string
        +pushEphemeral(sessionId, text) void
        +getActiveCharacters(sessionId) List~string~
        +toggleCharacter(sessionId, name, on) void
    }

    class LlmService {
        +chatJson(messages, schema) JsonResponse
        +summarize(text, mode) string
        +generateQueries(text, n) List~string~
    }

    class MemoryService {
        -chroma: ChromaClient
        -llm: LlmService
        -smallLlm: LlmService
        +retrieveContext(userId, storyId, query, activeChars) string
        +writeChunk(sessionId, range) Promise~void~
        +writeMilestone(sessionId, content) Promise~void~
        -expandSlidingWindow(chunks, ±5) List~Chunk~
    }

    class EndChatService {
        -historyStore: HistoryStoreService
        -llmService: LlmService
        -memoryService: MemoryService
        -journalService: JournalService
        -storyService: StoryService
        +execute(sessionId, storyId, userId) EndChatResult
    }

    class PromptBuilder {
        +buildSystemPrompt(story, characters) string
        +renderUserPrompt(entry) string
    }

    ChatController --> ChatOrchestrator
    ChatOrchestrator --> HistoryStoreService
    ChatOrchestrator --> OocService
    ChatOrchestrator --> MemoryService
    ChatOrchestrator --> LlmService
    ChatOrchestrator --> PromptBuilder
    ChatController --> EndChatService
    EndChatService --> HistoryStoreService
    EndChatService --> LlmService
    EndChatService --> MemoryService
```

### 2.3. TTS Module

```mermaid
classDiagram
    class TtsController {
        +synthesize(dto) TtsResponse
        +testVoice(dto) TtsResponse
    }
    class TtsService {
        -refManager: ReferenceIndexManager
        -engine: GptSovitsClient
        -cache: FirebaseStorageAdapter
        -ffmpeg: FfmpegService
        -lockMgr: RedisLockManager
        +process(req: TtsRequest) string
        -computeHash(voice, ref, text) string
    }
    class ReferenceIndexManager {
        -index: List~ReferenceAudio~
        +loadIndex() void
        +pickRandom(voice, emotion, intensity) ReferenceAudio
        +fallback(voice) ReferenceAudio
    }
    class GptSovitsClient {
        +infer(text, refAudio, refText, model) Buffer
    }
    class FfmpegService {
        +adjustPitch(buf, pitch) Buffer
    }
    class TtsRequest {
        +string text
        +string voiceName
        +string emotion
        +string intensity
        +float pitch
    }
    TtsController --> TtsService
    TtsService --> ReferenceIndexManager
    TtsService --> GptSovitsClient
    TtsService --> FfmpegService
```

### 2.4. Story / Character / Journal

```mermaid
classDiagram
    class StoryService {
        +create(userId, dto) Story
        +list(userId) List~Story~
        +get(userId, id) Story
        +updateProgress(storyId, progress) void
        +delete(userId, id) void
    }
    class CharacterService {
        +create(storyId, dto) Character
        +list(storyId) List~Character~
        +update(id, patch) void
        +delete(id) void
    }
    class JournalService {
        +ingest(payload: EndChatPayload) void
        +listSessions(userId) List~SessionListDto~
        +getSessionDetail(sessionId) SessionDetailDto
    }
```

### 2.5. Vocabulary (SRS)

```mermaid
classDiagram
    class VocabularyController {
        +collect(dto) void
        +listDueToday() List~VocabWord~
        +startReview() ReviewSessionDto
        +submitTurn(sessionId, dto) ReviewTurnResult
        +finishReview(sessionId) void
    }
    class VocabularyService {
        +collectWord(uid, word) void
        +getDue(uid) List~VocabWord~
        +updateAfterReview(uid, wordIds) void
    }
    class SRSScheduler {
        +SRS_SCHEDULE: List~int~
        +computeNext(stepIndex) SrsResult
    }
    class VocabReviewService {
        -llm: LlmService
        -historyStore: JsonlAdapter
        +next(sessionId, queue) ReviewTurn
        +verify(sessionId, used) VerifyResult
    }
    VocabularyController --> VocabularyService
    VocabularyService --> SRSScheduler
    VocabularyController --> VocabReviewService
```

### 2.6. Mission & Shop (Event-Driven)

```mermaid
classDiagram
    class MissionEventBus {
        +emit(evt: DomainEvent) void
        +subscribe(type, handler) void
    }

    class MissionTracker {
        -repo: UserMissionsRepository
        -bus: MissionEventBus
        +onUserSentMessage(uid) void
        +onUserSavedWord(uid) void
        +onUserCompletedReview(uid) void
        +ensureDailyMissions(uid) void  "lazy reset 00:00"
        +completeAndReward(uid, missionId) RewardResult
    }

    class ShopService {
        +listItems() List~ShopItem~
        +buy(uid, itemId) PurchaseResult
        +applyContextualEvent(uid, itemName, price, choice) ContextualResult
    }

    class StreakService {
        +tick(uid) StreakResult
    }

    ChatService ..> MissionEventBus : "emit USER_SENT_MESSAGE"
    VocabularyService ..> MissionEventBus : "emit USER_SAVED_WORD"
    VocabReviewService ..> MissionEventBus : "emit REVIEW_COMPLETED"
    MissionEventBus --> MissionTracker
```

### 2.7. Worker (BullMQ)

```mermaid
classDiagram
    class SummarizeWorker {
        +process(job: SummarizeJob) void
    }
    class TtsPrewarmWorker {
        +process(job: PrewarmJob) void
    }
    class StreakResetCron {
        +run() void
    }
    class DailyMissionResetCron {
        +run() void
    }
```

---

## 3. Shared Types (TS interfaces dùng chung)

```mermaid
classDiagram
    class ChatMessage {
        +string id
        +string role
        +string characterName
        +string text
        +string translation
        +string emotion
        +string intensity
        +List~Word~ words
        +ShopEvent shopEvent
        +long timestamp
    }
    class Word {
        +string hz
        +string py
        +string vn
    }
    class ShopEvent {
        +string itemName
        +int price
    }
    class AssistantBatch {
        +List~ChatMessage~ messages
        +bool triggerMemory
    }
    class SendMessagePayload {
        +string sessionId
        +string userMessage
        +List~TempCharacter~ temporaryCharacters
        +string ephemeralOOC
    }
    ChatMessage --> Word
    ChatMessage --> ShopEvent
    AssistantBatch --> ChatMessage
```

---

## 4. Quy ước tổ chức code (cho mỗi feature module Server)

Ví dụ `modules/chat/`:
```
chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.orchestrator.ts        # use-case chính
├── services/
│   ├── history-store.service.ts
│   ├── ooc.service.ts
│   ├── prompt-builder.service.ts
│   └── end-chat.service.ts
├── dto/
│   ├── send-message.dto.ts
│   ├── end-chat.dto.ts
│   └── ...
├── adapters/
│   └── jsonl-file.adapter.ts
└── tests/
    ├── orchestrator.spec.ts
    └── history-store.spec.ts
```

Ví dụ `features/chat/` (Client):
```
chat/
├── screens/
│   ├── ChatRoomScreen.tsx
│   └── HistoryDetailScreen.tsx
├── components/
│   ├── MessageBubble.tsx
│   ├── NarratorBubble.tsx
│   ├── InputBar.tsx
│   ├── AutoControlBar.tsx
│   ├── ShopChoiceCard.tsx
│   ├── PinyinTooltip.tsx
│   └── AddCharacterModal.tsx
├── hooks/
│   ├── useChatRoom.ts
│   ├── useSequentialPlayback.ts
│   └── useTapToTranslate.ts
├── store/
│   ├── chat.store.ts
│   └── tts-queue.store.ts
├── services/
│   └── chat.api.ts
└── models/
    └── chat.types.ts
```
