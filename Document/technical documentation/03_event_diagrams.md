# 03 — Sơ đồ Event / Sequence

Tổng hợp các luồng quan trọng nhất, đã consolidate & tinh chỉnh từ tài liệu thiết kế nguồn. Mỗi luồng nêu rõ **actor, thành phần tham gia, event phát sinh** để Dev triển khai event-driven chuẩn xác.

---

## 0. Event Bus toàn hệ thống (Domain Events)

```mermaid
flowchart LR
    subgraph Producers
        Chat[Chat Module]
        Vocab[Vocabulary Module]
        Review[Vocab Review Module]
        Shop[Shop Module]
        EndChat[End-Chat Service]
    end

    subgraph Bus["⚡ EventEmitter / NestJS @OnEvent"]
    end

    subgraph Consumers
        Mission[MissionTracker]
        Streak[StreakService]
        Memory[MemoryService Worker]
        Analytics[Analytics Logger]
    end

    Chat -- USER_SENT_MESSAGE --> Bus
    Vocab -- USER_SAVED_WORD --> Bus
    Review -- USER_COMPLETED_REVIEW --> Bus
    Shop -- GEM_SPENT --> Bus
    EndChat -- SESSION_ENDED --> Bus
    EndChat -- MEMORY_TRIGGER --> Bus
    Mission -- MISSION_COMPLETED --> Bus
    Mission -- GEM_EARNED --> Bus

    Bus --> Mission
    Bus --> Streak
    Bus --> Memory
    Bus --> Analytics
```

**Danh sách event chuẩn**:
| Event | Payload | Producer | Consumer |
|-------|---------|----------|----------|
| `USER_SENT_MESSAGE` | `{userId, sessionId}` | Chat | Mission, Streak |
| `USER_SAVED_WORD` | `{userId, wordId}` | Vocabulary | Mission, Streak |
| `USER_COMPLETED_REVIEW` | `{userId, sessionId, wordCount}` | Review | Mission, Streak |
| `SESSION_ENDED` | `{userId, sessionId, storyId}` | EndChat | Memory, Analytics |
| `MEMORY_TRIGGER` | `{sessionId, range, type}` | EndChat / Auto | Memory Worker |
| `MISSION_COMPLETED` | `{userId, missionId, reward}` | Mission | Streak, UI push |
| `GEM_EARNED` / `GEM_SPENT` | `{userId, amount, source}` | Mission/Shop | UI push |
| `STREAK_UPDATED` | `{userId, current, isNewHighest}` | Streak | UI push |
| `TUTORIAL_STEP_DONE` | `{userId, step}` | Client (qua API) | Users repo |

---

## 1. Đăng nhập & Boot ứng dụng

```mermaid
sequenceDiagram
    actor U as User
    participant App as RN App
    participant Google as Google Sign-In
    participant FA as Firebase Auth
    participant API as Server /auth
    participant FS as Firestore
    participant PG as Postgres

    U->>App: Mở app lần đầu
    App->>Google: signIn()
    Google-->>App: idToken Google
    App->>FA: signInWithCredential(idToken)
    FA-->>App: Firebase ID Token (JWT)
    App->>API: POST /auth/google-signin {idToken}
    API->>FA: verifyIdToken()
    FA-->>API: decoded {uid, email}
    API->>PG: SELECT users_meta WHERE uid
    alt User mới
        API->>PG: INSERT users_meta (defaults)
        API->>FS: SET users/{uid} (defaults + tutorial_step=0)
    else User cũ
        API->>PG: UPDATE last_login
    end
    API-->>App: UserDto
    App->>FS: subscribe users/{uid}
    FS-->>App: realtime profile
    App->>App: navigate(Home)
    App->>App: if tutorial_step<7 → show Tutorial overlay
```

---

## 2. Gửi tin nhắn Chat (Full Lifecycle)

```mermaid
sequenceDiagram
    actor U
    participant UI as ChatRoom
    participant Store as ChatStore
    participant API as ChatController
    participant Orch as ChatOrchestrator
    participant OOC as OocService
    participant HS as HistoryStore (.jsonl)
    participant Mem as MemoryService
    participant LLM as Ollama (Large AI)
    participant Q as PlaybackQueue
    participant TTS as TtsService
    participant Bus as EventBus

    U->>UI: Nhập text + (tuỳ chọn) @tạm thời
    UI->>Store: sendMessage(text)
    Store->>Store: optimistic append user bubble + lock input
    Store->>API: POST /chat/message {Idempotency-Key}
    API->>Orch: handleUserTurn(ctx, userMsg)
    Orch->>HS: append({role:user, text, temp_chars, ephemeral_ooc})
    Orch->>OOC: getPersistent + pullEphemeral + activeCharacters
    Orch->>HS: readSince(lastCheckpoint)
    Orch->>Mem: retrieveContext(uid, storyId, query=userMsg, activeChars)
    Mem->>LLM: generateQueries(userMsg, n=3)
    Mem->>Chroma: parallel similarity_search (filter: user_id, story_id, character_name in activeChars)
    Chroma-->>Mem: top-K chunks
    Mem-->>Orch: contextString
    Orch->>Orch: buildSystemPrompt + buildUserPrompt
    Orch->>LLM: chatJson(messages, schema=AssistantBatch)
    LLM-->>Orch: JSON {content:[...]}
    Orch->>HS: append({role:assistant, content:[...]})
    Orch->>Orch: kiểm tra totalTokens > MAX?
    alt vượt ngưỡng
        Orch->>LLM: summarize(history) [Small AI async]
        Orch->>HS: writeCheckpoint(summary)
    end
    Orch-->>API: AssistantBatch
    API-->>Store: response
    Store->>Q: enqueueBatch(messages)
    Store->>UI: render bubbles sequentially (theo nhịp playNext)
    loop mỗi message
        Q->>TTS: requestAudio(text, voice, emotion)
        TTS-->>Q: audioUrl
        Q->>UI: show bubble + play audio
        Q->>Q: chờ kết thúc (+5s nếu Narrator Việt)
    end
    Q->>Store: unlockInput()
    API-)Bus: emit USER_SENT_MESSAGE
    Bus->>Mission: increment send_messages
```

---

## 3. OOC Flows (3 nguồn)

```mermaid
sequenceDiagram
    participant UI
    participant Store as ChatStore
    participant API
    participant OOC as OocService
    participant HS

    rect rgb(230,240,255)
        Note over UI,HS: (a) Persistent OOC từ Sidebar
        UI->>Store: setPersistentOOC(text)
        Store->>API: POST /chat/ooc {type:persistent,text}
        API->>OOC: setPersistent
        API->>HS: append({role:persistent_ooc, text})
        API-->>Store: 200
    end

    rect rgb(255,245,230)
        Note over UI,HS: (b) Ephemeral OOC nhập inline
        UI->>Store: send(text="cả 2 vào quán")
        Store->>API: POST /chat/message {ephemeralOOC: text}
        API->>OOC: pushEphemeral & pullEphemeral 1 lần
        API->>HS: append user entry chứa ephemeral_ooc
    end

    rect rgb(240,255,235)
        Note over UI,HS: (c) Toggle Character → tự sinh ephemeral
        UI->>Store: toggleCharacter(c, on=false)
        Store->>API: POST /chat/character-toggle {id, on:false}
        API->>OOC: removeActive(name)
        API->>OOC: pushEphemeral("{name} đã rời cảnh")
    end
```

---

## 4. Auto Chat

```mermaid
sequenceDiagram
    actor U
    participant UI
    participant Store as ChatStore (autoMode=true)
    participant API
    participant Orch
    participant LLM

    U->>UI: bật Auto
    Store->>API: POST /chat/auto-continue
    loop until user dừng / shop event
        API->>Orch: handleAutoTurn(ctx)
        Orch->>LLM: chatJson(prompt với "tự thay vai user")
        LLM-->>Orch: AssistantBatch
        Orch-->>API: batch
        API-->>Store: batch
        Store->>Store: play sequential
        Store->>API: POST /chat/auto-continue (lặp)
    end
    Note over Store: Nếu batch chứa shop_event → tự exit auto
```

---

## 5. End Chat Orchestration

```mermaid
sequenceDiagram
    actor U
    participant UI
    participant API
    participant EndSvc as EndChatService
    participant HS
    participant LLM
    participant Mem
    participant J as JournalService
    participant S as StoryService
    participant Bus

    U->>UI: nhấn End Chat
    UI->>API: POST /chat/end {sessionId}
    API->>EndSvc: execute
    EndSvc->>HS: readAll(sessionId)
    par 2 luồng song song
        EndSvc->>LLM: summarize(history, mode=plot) [Small AI]
        EndSvc->>LLM: summarize(history, mode=session_overview)
    end
    LLM-->>EndSvc: plotChunk
    LLM-->>EndSvc: sessionSummary
    EndSvc->>S: updateProgress(storyId, append plotChunk)
    EndSvc->>Mem: writeChunk({memory_type:plot, content, range})
    EndSvc->>J: ingest({sessionId, summary, messages from .jsonl})
    J->>PG: BATCH INSERT messages + UPDATE sessions
    EndSvc->>HS: cleanup(sessionId)
    EndSvc-)Bus: emit SESSION_ENDED
    EndSvc-->>API: EndChatResult
    API-->>UI: navigate(Journal/{sessionId})
```

---

## 6. Long-term Memory Write (theo `MEMORY_TRIGGER`)

```mermaid
sequenceDiagram
    participant Bus
    participant Worker as SummarizeWorker
    participant HS
    participant LLM as Small AI
    participant Chroma

    Bus->>Worker: MEMORY_TRIGGER {sessionId, range, type}
    Worker->>HS: readRange(sessionId, range)
    Worker->>LLM: summarize(text, focus=type)  "plot|character"
    LLM-->>Worker: summary
    Worker->>Worker: embed(summary, model=bge-m3)
    Worker->>Chroma: add({id,embedding,document,metadata})
```

Trigger source:
- End-Chat (mặc định) → `type=plot`
- Cuối phiên có character mới được thêm → `type=character`
- User pin "lưu kí ức" thủ công (Premium) → `priority=high`

---

## 7. TTS Sequential Playback (Client)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Enqueued: enqueueBatch(messages)
    Enqueued --> Fetching: playNext()
    Fetching --> Playing: audioUrl resolved
    Playing --> WaitDelay: onEnd (Narrator Việt)
    Playing --> Fetching: onEnd (còn message)
    WaitDelay --> Fetching: sau 5s
    Fetching --> Idle: queue rỗng
    Playing --> Idle: stop()
```

---

## 8. TTS Server (Cache Hash + GPT-SoVITS)

```mermaid
sequenceDiagram
    participant API as TtsController
    participant Svc as TtsService
    participant Lock as Redis Lock
    participant FB as Firebase Storage
    participant Ref as ReferenceIndexManager
    participant Eng as GPT-SoVITS
    participant FF as FFmpeg

    API->>Svc: process({text,voice,emotion,intensity,pitch})
    Svc->>Ref: pickRandom(voice,emotion,intensity)
    Ref-->>Svc: refAudio + refText
    Svc->>Svc: hash = MD5(voice + ref + text)
    Svc->>FB: HEAD tts_audio/{hash}.wav
    alt Cached
        FB-->>Svc: exists
        Svc-->>API: signedUrl
    else Miss
        Svc->>Lock: SETNX tts:lock:{hash}
        Svc->>Eng: infer(text, ref, refText)
        Eng-->>Svc: raw audio
        opt pitch ≠ 1.0
            Svc->>FF: adjustPitch(buf, pitch)
            FF-->>Svc: pitched
        end
        Svc->>FB: upload tts_audio/{hash}.wav
        Svc->>Lock: DEL
        Svc-->>API: signedUrl
    end
```

---

## 9. Shop Contextual Event (mua trong Chat)

```mermaid
sequenceDiagram
    actor U
    participant UI
    participant Store
    participant API
    participant Shop as ShopService
    participant Orch

    Note over Orch: AssistantBatch chứa message có shop_event {itemName, price}
    UI->>UI: render ShopChoiceCard, lock input
    U->>UI: chọn Mua
    UI->>API: POST /chat/shop-choice {sessionId, choice:'buy'}
    API->>Shop: applyContextualEvent(uid, item, price, 'buy')
    alt đủ gem
        Shop->>PG: trừ gem, INSERT inventory + transaction
        Shop-->>API: ok
        API->>Orch: handleShopChoice(ctx,'buy')
        Orch->>LLM: chatJson(narration tiếp tục, embed thành công)
        Orch-->>API: AssistantBatch
        API-->>Store: batch
    else thiếu gem
        Shop-->>API: 402 NOT_ENOUGH_GEMS
        API-->>UI: hiển thị "Bạn cần thêm X gem"
    end
    Note over UI: chọn Không → branch tương tự nhưng narration AI khác
```

---

## 10. Vocabulary — Save từ Chat + SRS Review

### 10.1. Lưu từ vào sổ tay
```mermaid
sequenceDiagram
    actor U
    participant UI as Tooltip
    participant Store as VocabStore
    participant API
    participant Svc as VocabularyService
    participant Bus

    U->>UI: tap chữ Hán
    UI->>UI: show {hz, py, vn, source_sentence}
    U->>UI: nhấn "Lưu"
    UI->>Store: collect(word)
    Store->>API: POST /vocabulary/save
    API->>Svc: collectWord(uid,word) UPSERT
    Svc-->>API: ok
    API-)Bus: emit USER_SAVED_WORD
```

### 10.2. Phiên Review (Story Review)
```mermaid
sequenceDiagram
    actor U
    participant UI as ReviewScreen
    participant Store as VocabStore
    participant API
    participant Svc as VocabReviewService
    participant SRS as SRSScheduler
    participant LLM

    UI->>API: POST /vocabulary/review-session/start
    API->>Svc: load due words, init queue + vocab_session.jsonl
    Svc-->>API: {sessionId, batchHint}
    loop mỗi lượt
        UI->>API: POST /vocabulary/review-session/turn {sessionId, userText}
        API->>Svc: verify(usedHz[])
        Svc->>LLM: chatJson(prompt yêu cầu tiếp tục cảnh, dùng các từ X,Y,Z)
        LLM-->>Svc: assistant text + missing list
        alt Strict fail
            Svc-->>API: {success:false, missed:[hz...]}
            UI->>UI: hiển thị gợi ý Puzzle (đảo thứ tự pinyin)
        else success
            Svc-->>API: {success:true, usedWordIds}
            Svc->>SRS: computeNext(stepIndex)
            Svc->>Svc: cập nhật step_index, next_review_date
        end
    end
    UI->>API: POST /vocabulary/review-session/finish
    API-)Bus: emit USER_COMPLETED_REVIEW
```

---

## 11. Mission Completion (Event-Driven)

```mermaid
sequenceDiagram
    participant Bus
    participant Mission as MissionTracker
    participant PG
    participant Streak
    participant Push as RealtimeChannel

    Bus->>Mission: USER_SENT_MESSAGE {uid}
    Mission->>PG: ensureDailyMissions(uid, today)
    Mission->>PG: UPDATE progress += 1
    alt progress >= target
        Mission->>PG: status=completed, +reward gems
        Mission-)Bus: MISSION_COMPLETED
        Mission-)Bus: GEM_EARNED
        Mission->>Streak: tick(uid)
        Streak-)Bus: STREAK_UPDATED (nếu đổi)
        Push-->>Client: WS/SSE update missions+gems+streak
    end
```

---

## 12. Streak Daily Reset (Cron)

```mermaid
sequenceDiagram
    participant Cron as StreakResetCron (00:00)
    participant PG

    Cron->>PG: SELECT users WHERE last_streak_date < yesterday
    loop each user
        alt streak_freeze_count > 0
            Cron->>PG: streak_freeze_count -= 1, KEEP streak
        else
            Cron->>PG: current_streak = 0
        end
    end
```

---

## 13. Tutorial State Machine

```mermaid
stateDiagram-v2
    [*] --> Step0_Welcome
    Step0_Welcome --> Step1_CreateStory: tap Start
    Step1_CreateStory --> Step2_CreateCharacter: story saved
    Step2_CreateCharacter --> Step3_TestVoice: char saved
    Step3_TestVoice --> Step4_FirstChat: voice OK
    Step4_FirstChat --> Step5_CollectWord: AI replied
    Step5_CollectWord --> Step6_EndChat: word saved
    Step6_EndChat --> Step7_ReviewVocab: journal open
    Step7_ReviewVocab --> [*]: tutorial_step=7
    note right of Step0_Welcome
      Mỗi bước:
      - Client PATCH /users/preferences {tutorial_step:n+1}
      - emit TUTORIAL_STEP_DONE
    end note
```

---

## 14. Add Character (giữa cuộc chat)

```mermaid
flowchart TD
    A["Tap '+ Character'"] --> B{"Loại?"}
    B -- "Từ Roster (đã tạo)" --> C["Toggle on → push ephemeral OOC '{name} bước vào'"]
    B -- "Tạo mới (lưu vĩnh viễn)" --> D["Modal CRUD → POST /characters → thêm activeChar"]
    B -- "Tạm thời (1 phiên)" --> E["Modal nhập name+desc → đẩy vào ChatStore.temporaryCharacters"]
    C --> F["Append next user turn"]
    D --> F
    E --> F
    F --> G["LLM nhận snapshot character context"]
```

---

## 15. Profile/Preferences Update (Optimistic)

```mermaid
sequenceDiagram
    actor U
    participant UI
    participant Store as ProfileStore
    participant API
    participant FS

    U->>UI: toggle showPinyin
    UI->>Store: optimistic update local
    Store->>API: PATCH /users/preferences
    API->>PG: UPDATE
    API->>FS: SET users/{uid}.show_pinyin
    API-->>Store: 200
    Note over UI: Nếu fail → revert + toast
```
