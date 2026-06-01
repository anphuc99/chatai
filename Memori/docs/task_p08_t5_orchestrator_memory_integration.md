---
date: 2026-05-31
---
# Memori Document â€” P08.T5: Wire Memory vÃ o ChatOrchestrator

TÃ i liá»‡u thiáº¿t káº¿ vÃ  lÆ°u Ã½ ká»¹ thuáº­t khi tÃ­ch há»£p dá»‹ch vá»¥ **MemoryService** vÃ o **ChatOrchestratorService** nháº±m cung cáº¥p bá»‘i cáº£nh trÃ­ nhá»› dÃ i háº¡n (Plot & Character Memory) cho mÃ´ hÃ¬nh ngÃ´n ngá»¯ lá»›n (LLM).

## 1. MÃ´ táº£ tÃ­nh nÄƒng

Äá»ƒ giÃºp nhÃ¢n váº­t AI nhá»› láº¡i cÃ¡c sá»± kiá»‡n Ä‘Ã£ xáº£y ra trong quÃ¡ khá»© sau khi má»™t session káº¿t thÃºc, chÃºng ta káº¿t ná»‘i dá»‹ch vá»¥ RAG dÃ i háº¡n (`MemoryService`) vÃ o luá»“ng Ä‘iá»u phá»‘i há»™i thoáº¡i chÃ­nh (`ChatOrchestratorService`):

- **Parallel Querying**: Truy váº¥n bá»‘i cáº£nh bá»™ nhá»› dÃ i háº¡n song song vá»›i quÃ¡ trÃ¬nh Ä‘á»c lá»‹ch sá»­ há»™i thoáº¡i gáº§n Ä‘Ã¢y tá»« JSONL (`HistoryStore`) Ä‘á»ƒ tá»‘i Æ°u hÃ³a latency.
- **Context Injection**: TrÃ­ nhá»› dÃ i háº¡n sau khi láº¥y ra sáº½ Ä‘Æ°á»£c Ä‘á»‹nh dáº¡ng vÃ  Ä‘Æ°a vÃ o phÆ°Æ¡ng thá»©c `promptBuilder.buildLlmMessages` dÆ°á»›i dáº¡ng block `[TRÃ NHá»š DÃ€I Háº N]`.
- **Graceful degradation**: Náº¿u bá»™ nhá»› dÃ i háº¡n gáº·p lá»—i hoáº·c ChromaDB bá»‹ máº¥t káº¿t ná»‘i, há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng háº¡ cáº¥p xuá»‘ng chuá»—i rá»—ng `""` vÃ  tiáº¿p tá»¥c cuá»™c trÃ² chuyá»‡n bÃ¬nh thÆ°á»ng thay vÃ¬ gÃ¢y crash.
- **Telemetry logging**: Log chi tiáº¿t thá»i gian truy xuáº¥t (`retrievalTimeMs`) vÃ  Ä‘á»™ dÃ i cá»§a bá»‘i cáº£nh (`contextLength`) Ä‘á»ƒ giÃ¡m sÃ¡t hiá»‡u nÄƒng.

## 2. Chi tiáº¿t cÃ¡c hÃ m

### 2.1. `ChatOrchestratorService.handleUserTurn`

- Nháº­n tin nháº¯n má»›i tá»« ngÆ°á»i dÃ¹ng, lÆ°u vÃ o JSONL.
- Gá»i song song hai tÃ¡c vá»¥ qua `Promise.all`:
  1. `historyStore.readSinceLastCheckpoint(ctx.sessionId)` (Äá»c lá»‹ch sá»­ há»™i thoáº¡i).
  2. `safeRetrieveMemory(ctx.userId, ctx.storyId, userMessage, activeCharNames)` (Truy váº¥n bá»™ nhá»› dÃ i háº¡n).
- ÄÆ°a káº¿t quáº£ `memoryContext` vÃ o `promptBuilder.buildLlmMessages(...)` Ä‘á»ƒ dá»±ng prompt gá»­i lÃªn LLM.

### 2.2. `ChatOrchestratorService.safeRetrieveMemory`

- **Signature**: `private async safeRetrieveMemory(userId: string, storyId: string, userMessage: string, activeCharNames: string[]): Promise<string>`
- Thá»±c thi gá»i `memoryService.retrieveContext(...)`.
- Bá»c toÃ n bá»™ trong khá»‘i `try-catch`:
  - **Success**: Ghi nháº­n log debug telemetry dáº¡ng `{ msg: 'Memory context retrieved successfully', retrievalTimeMs, contextLength }` vÃ  tráº£ vá» context.
  - **Failure**: Báº¯t má»i lá»—i xáº£y ra, ghi nháº­n log warning kÃ¨m thÃ´ng tin lá»—i vÃ  duration, sau Ä‘Ã³ tráº£ vá» chuá»—i rá»—ng `""`.

## 3. Data Flow Diagram

```mermaid
sequenceDiagram
    participant Orch as ChatOrchestratorService
    participant HS as HistoryStoreService
    participant Mem as MemoryService
    participant PB as PromptBuilderService
    participant LLM as LlmService

    Orch->>HS: append(userMessage)
    Note over Orch, Mem: Cháº¡y song song (Parallel) Ä‘á»ƒ giáº£m latency
    par Read History
        Orch->>HS: readSinceLastCheckpoint(sessionId)
        HS-->>Orch: history
    and Retrieve Long-term Memory
        Orch->>Orch: safeRetrieveMemory(uid, sid, msg, charNames)
        Orch->>Mem: retrieveContext(uid, sid, msg, charNames)
        alt RAG thÃ nh cÃ´ng
            Mem-->>Orch: memoryContext
            Orch->>Orch: Log debug telemetry
        else RAG gáº·p lá»—i
            Mem--XOrch: Error
            Orch->>Orch: Log warning & tráº£ vá» ""
        end
    end
    Orch->>PB: buildSystemPrompt(...)
    Orch->>PB: buildLlmMessages(sysPrompt, history, msg, persOOC, ephOOC, memoryContext)
    PB-->>Orch: llmMessages (chá»©a block [TRÃ NHá»š DÃ€I Háº N])
    Orch->>LLM: chatJson(llmMessages)
    LLM-->>Orch: assistantBatch
    Orch->>HS: append(assistantBatch)
    Orch-->>Orch: persist & emit events
```

## 4. LÆ°u Ã½ quan trá»ng & Gotchas

- **Circular Dependency (Phá»¥ thuá»™c vÃ²ng)**:
  `MemoryModule` cáº§n `ChatModule` (Ä‘á»ƒ dÃ¹ng `LlmService`), trong khi `ChatModule` láº¡i cáº§n `MemoryModule` (Ä‘á»ƒ dÃ¹ng `MemoryService`).
  - _Giáº£i phÃ¡p_: Sá»­ dá»¥ng `forwardRef(() => MemoryModule)` trong `chat.module.ts` vÃ  `forwardRef(() => ChatModule)` trong `memory.module.ts` cá»§a NestJS.
  - Táº¡i constructor cá»§a `ChatOrchestratorService`, ta báº¯t buá»™c pháº£i inject báº±ng `@Inject(forwardRef(() => MemoryService))`.
- **Latency Control**:
  RAG Ä‘Ã²i há»i viá»‡c sinh query báº±ng LLM, táº¡o embedding vÃ  tÃ¬m kiáº¿m vector trÃªn ChromaDB. Báº±ng cÃ¡ch cháº¡y song song viá»‡c gá»i RAG vÃ  Ä‘á»c file JSONL (I/O), chÃºng ta tiáº¿t kiá»‡m Ä‘Æ°á»£c Ä‘Ã¡ng ká»ƒ tá»•ng thá»i gian xá»­ lÃ½ má»™t lÆ°á»£t chat cá»§a ngÆ°á»i dÃ¹ng.
