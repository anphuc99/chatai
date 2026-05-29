# Phase 8 — Long-term Memory (ChromaDB + RAG)

> **Mục tiêu**: Sau End Chat, tóm tắt và lưu vào ChromaDB. Khi chat, retrieve context từ memory để AI nhớ sự kiện cũ.  
> **Phụ thuộc**: Phase 7 (End Chat triggers MEMORY_TRIGGER event).

---

## P8.T1 — ChromaDB Client + Collection Setup

**Status**: `[ ]`  
**Depends on**: P7.T5 (Phase 7 hoàn thành)

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   pnpm add chromadb
   ```
2. Tạo `src/modules/memory/`:
   ```
   memory/
   ├── memory.module.ts
   ├── memory.service.ts
   ├── chroma.client.ts
   ├── embedding.service.ts
   └── memory.worker.ts       # BullMQ worker
   ```
3. `chroma.client.ts`:
   ```typescript
   @Injectable()
   export class ChromaClient implements OnModuleInit {
     private client: ChromaDB.ChromaClient;
     private collection: ChromaDB.Collection;

     async onModuleInit() {
       this.client = new ChromaDB.ChromaClient({ path: this.config.CHROMA_URL });
       this.collection = await this.client.getOrCreateCollection({
         name: 'roleplay_memory',
         metadata: { 'hnsw:space': 'cosine' }
       });
     }

     async addDocuments(docs: MemoryDocument[]): Promise<void> {
       await this.collection.add({
         ids: docs.map(d => d.id),
         embeddings: docs.map(d => d.embedding),
         documents: docs.map(d => d.content),
         metadatas: docs.map(d => d.metadata),
       });
     }

     async query(queryEmbedding: number[], filter: object, k: number): Promise<QueryResult[]> {
       return await this.collection.query({
         queryEmbeddings: [queryEmbedding],
         where: filter,
         nResults: k,
       });
     }

     // Query by chunk_index range (cho sliding window expansion)
     async getByIndexRange(filter: object, startIdx: number, endIdx: number): Promise<QueryResult[]> {
       return await this.collection.get({
         where: {
           ...filter,
           chunk_index: { $gte: startIdx, $lte: endIdx }
         }
       });
     }
   }
   ```
4. `MemoryDocument` metadata schema:
   ```typescript
   interface MemoryMetadata {
     user_id: string;
     story_id: string;
     session_id: string;
     chunk_index: number;        // sequential per story
     memory_type: 'plot' | 'character';
     character_name: string | null;
     timestamp: number;
     turn_start: number;
     turn_end: number;
   }
   ```

**Output kiểm chứng**:
- ChromaDB connection thành công.
- Add 1 document → query trả về đúng document.
- Filter by user_id → chỉ trả docs của user đó.

---

## P8.T2 — Embedding Service (Ollama bge-m3)

**Status**: `[ ]`  
**Depends on**: P8.T1

**Mô tả chi tiết**:
1. `embedding.service.ts`:
   ```typescript
   @Injectable()
   export class EmbeddingService {
     private ollamaUrl: string;
     private model: string = 'bge-m3';  // hoặc 'nomic-embed-text'

     async embed(text: string): Promise<number[]> {
       // POST {OLLAMA_URL}/api/embeddings
       // body: { model: this.model, prompt: text }
       // return response.embedding
       const res = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
         model: this.model,
         prompt: text
       });
       return res.data.embedding;
     }

     async embedBatch(texts: string[]): Promise<number[][]> {
       // Parallel embed (with concurrency limit = 3)
       const results = await pMap(texts, t => this.embed(t), { concurrency: 3 });
       return results;
     }
   }
   ```
2. Pre-requisite: pull embedding model vào Ollama:
   ```bash
   ollama pull bge-m3
   # hoặc
   ollama pull nomic-embed-text
   ```
3. Caching: embedding của cùng text → cache trong Redis (TTL 24h):
   - Key: `embed:${MD5(text)}`.
   - Giảm load lên Ollama khi cùng text embed nhiều lần.

**Output kiểm chứng**:
- `embed("你好世界")` → trả array of floats, length > 0.
- Same text 2 lần → lần 2 từ cache.
- embedBatch 5 texts → 5 embeddings, concurrency hoạt động.

---

## P8.T3 — Memory Writer (BullMQ Worker + Summarize + Store)

**Status**: `[ ]`  
**Depends on**: P8.T1, P8.T2

**Mô tả chi tiết**:
1. Setup BullMQ:
   ```bash
   pnpm add bullmq
   ```
2. Tạo queue + worker:
   ```typescript
   // memory.module.ts
   @Module({
     imports: [BullModule.registerQueue({ name: 'memory-write' })],
     providers: [MemoryService, MemoryWorker, ChromaClient, EmbeddingService],
   })

   // memory.worker.ts
   @Processor('memory-write')
   export class MemoryWorker {
     @Process('write-chunk')
     async handleWriteChunk(job: Job<MemoryWritePayload>) {
       const { sessionId, storyId, userId, type } = job.data;
       
       // 1. Load messages từ DB (session đã ended)
       const messages = await this.prisma.message.findMany({
         where: { sessionId },
         orderBy: { turnOrder: 'asc' }
       });

       // 2. Format messages thành text
       const text = this.formatMessagesForSummary(messages);

       // 3. Summarize dựa trên type
       if (type === 'plot') {
         const summary = await this.llmService.summarize(text, 'plot');
         const embedding = await this.embeddingService.embed(summary);
         
         // 4. Tính chunk_index (sequential per story)
         const lastChunkIdx = await this.getLastChunkIndex(userId, storyId, 'plot');
         
         // 5. Store vào ChromaDB
         await this.chromaClient.addDocuments([{
           id: `${sessionId}_plot`,
           content: summary,
           embedding,
           metadata: {
             user_id: userId,
             story_id: storyId,
             session_id: sessionId,
             chunk_index: lastChunkIdx + 1,
             memory_type: 'plot',
             character_name: null,
             timestamp: Date.now(),
             turn_start: messages[0].turnOrder,
             turn_end: messages[messages.length - 1].turnOrder,
           }
         }]);
       }

       // 6. Character memories (cho mỗi character cố định)
       if (type === 'plot') { // cùng trigger, tạo luôn character memories
         const characters = await this.getActiveCharactersInSession(messages);
         for (const char of characters) {
           const charSummary = await this.llmService.summarize(text, 'character');
           // Prompt chỉ định: tóm tắt từ góc nhìn của {char.name}
           const charEmbedding = await this.embeddingService.embed(charSummary);
           await this.chromaClient.addDocuments([{
             id: `${sessionId}_char_${char.id}`,
             content: charSummary,
             embedding: charEmbedding,
             metadata: {
               user_id: userId,
               story_id: storyId,
               session_id: sessionId,
               chunk_index: lastChunkIdx + 1,
               memory_type: 'character',
               character_name: char.name,
               timestamp: Date.now(),
               turn_start: messages[0].turnOrder,
               turn_end: messages[messages.length - 1].turnOrder,
             }
           }]);
         }
       }
     }
   }
   ```
3. Event listener (trong `memory.service.ts`):
   ```typescript
   @OnEvent('MEMORY_TRIGGER')
   async onMemoryTrigger(payload: { sessionId, type }) {
     await this.memoryQueue.add('write-chunk', payload);
   }
   ```

**Output kiểm chứng**:
- End Chat → event emitted → worker picks up → ChromaDB has new documents.
- Query ChromaDB with user_id filter → documents present.
- Character memories created per character.

---

## P8.T4 — Memory Reader (Multi-Query RAG + Sliding Window)

**Status**: `[ ]`  
**Depends on**: P8.T3

**Mô tả chi tiết**:
1. Tạo `memory.service.ts` — `retrieveContext` method:
   ```typescript
   async retrieveContext(userId: string, storyId: string, userMessage: string, activeCharNames: string[]): Promise<string> {
     // 1. Multi-Query: sinh 3 query variations
     const queries = await this.generateQueryVariations(userMessage);
     // Prompt: "Given user message, generate 3 different search queries to find relevant story context"
     
     // 2. Embed all queries
     const queryEmbeddings = await this.embeddingService.embedBatch(queries);
     
     // 3. Parallel search ChromaDB
     const baseFilter = { user_id: userId, story_id: storyId };
     
     // Search plot memory
     const plotResults = await Promise.all(
       queryEmbeddings.map(emb => this.chromaClient.query(emb, { ...baseFilter, memory_type: 'plot' }, 3))
     );
     
     // Search character memories (chỉ active chars)
     const charResults = await Promise.all(
       activeCharNames.flatMap(charName =>
         queryEmbeddings.map(emb => this.chromaClient.query(emb, { ...baseFilter, memory_type: 'character', character_name: charName }, 2))
       )
     );
     
     // 4. Merge + deduplicate results
     const allChunks = this.mergeAndDedup([...plotResults.flat(), ...charResults.flat()]);
     
     // 5. Sliding Window Expansion: cho mỗi chunk K, lấy thêm K-5 đến K+5
     const expandedChunks = await this.expandSlidingWindow(allChunks, baseFilter);
     
     // 6. Sort by chunk_index ascending
     expandedChunks.sort((a, b) => a.metadata.chunk_index - b.metadata.chunk_index);
     
     // 7. Format thành context string
     const contextText = expandedChunks.map(c => c.content).join('\n\n---\n\n');
     
     // 8. (Optional) Nếu context quá dài → summarize bằng Small AI
     if (contextText.length > 3000) {
       return await this.llmService.summarize(contextText, 'session');
     }
     
     return contextText;
   }
   ```
2. `expandSlidingWindow`:
   ```typescript
   private async expandSlidingWindow(chunks: MemoryChunk[], baseFilter: object): Promise<MemoryChunk[]> {
     const expanded: Map<string, MemoryChunk> = new Map();
     
     for (const chunk of chunks) {
       const startIdx = Math.max(0, chunk.metadata.chunk_index - 5);
       const endIdx = chunk.metadata.chunk_index + 5;
       
       const neighbors = await this.chromaClient.getByIndexRange(
         { ...baseFilter, memory_type: chunk.metadata.memory_type },
         startIdx, endIdx
       );
       
       for (const n of neighbors) {
         expanded.set(n.id, n); // dedup by id
       }
     }
     
     return Array.from(expanded.values());
   }
   ```
3. `generateQueryVariations`:
   ```typescript
   private async generateQueryVariations(userMessage: string): Promise<string[]> {
     const prompt = `Given this user message in a roleplay chat: "${userMessage}"
     Generate 3 different search queries to find relevant past story events.
     Return as JSON array of strings.`;
     
     const result = await this.llmService.chatJson([
       { role: 'user', content: prompt }
     ], z.array(z.string()));
     
     return result.slice(0, 3);
   }
   ```

**Output kiểm chứng**:
- Story có > 3 sessions ended → chat mới, AI nhớ sự kiện từ session 1.
- Filter cô lập: User A query → không thấy data User B.
- Sliding window: chunk liền kề được include.

---

## P8.T5 — Integration: Wire Memory vào ChatOrchestrator

**Status**: `[ ]`  
**Depends on**: P8.T4

**Mô tả chi tiết**:
1. Cập nhật `ChatOrchestratorService.handleUserTurn`:
   ```typescript
   // Sau bước 5 (lấy user preferences)
   // 6. Retrieve long-term memory context
   const activeCharNames = characters.map(c => c.name);
   const memoryContext = await this.memoryService.retrieveContext(
     ctx.userId, ctx.storyId, userMessage, activeCharNames
   );
   
   // 7. Build prompts (bây giờ có memoryContext)
   const llmMessages = this.promptBuilder.buildLlmMessages(
     systemPrompt, history, userMessage, persistentOOC, ephemeralOOCs, memoryContext
   );
   ```
2. Cập nhật `buildLlmMessages` (đã implement ở P6.T3):
   - `memoryContext` đã được handle: inject như system message `[TRÍ NHỚ DÀI HẠN]`.
3. Logging:
   - Log memory retrieval time.
   - Log number of chunks retrieved.
   - Log nếu memory context bị summarize (quá dài).
4. Fallback:
   - Nếu ChromaDB down → skip memory, proceed without context (log warning).
   - Nếu no results → memoryContext = null → skip inject.

**Output kiểm chứng**:
- Integration test: 3 sessions ended → session 4 chat → prompt chứa memory context.
- ChromaDB down → chat vẫn hoạt động (graceful degradation).
- Performance: retrieveContext < 3s (with embedding cache).

---
