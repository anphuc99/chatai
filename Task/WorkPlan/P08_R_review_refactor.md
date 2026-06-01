# P08 - Code Review & Refactor Guide

> **Reviewer**: Senior Code Review  
> **Branch**: `Task/P08` so với `main`  
> **Date**: 2026-05-31  
> **Review status**: DONE  
> **Merge recommendation**: NEEDS REFACTOR BEFORE MERGE

---

## 1. Tổng Quan Subtask

| Task | Scope | Code | Tests | Review |
|------|-------|------|-------|--------|
| P08.T1 | ChromaDB client + collection setup | DONE | PARTIAL | DONE |
| P08.T2 | EmbeddingService Ollama + Redis cache | DONE | PARTIAL | DONE |
| P08.T3 | Memory writer BullMQ + summarize + store | DONE | PARTIAL | DONE |
| P08.T4 | Memory reader multi-query RAG + sliding window | DONE | PARTIAL | DONE |
| P08.T5 | ChatOrchestrator memory integration | DONE | PARTIAL | DONE |

**Kết luận**: Tất cả subtask P08 đã được review đầy đủ. Branch đã triển khai đủ các mảnh chính của Phase 8, nhưng **chưa nên merge vào `main`** vì còn các lỗi blocking về graceful degradation, idempotency của memory writer và cách tính `chunk_index`.

---

## 2. Kết Quả Kiểm Tra

### Commands đã chạy

```powershell
node Memori/memori-query.mjs "review phase 08 memory rag branch Task/P08 so với main"
git diff --stat main...Task/P08
git diff --name-status main...Task/P08
pnpm --filter @chatai/server typecheck
pnpm --filter @chatai/server test -- memory
pnpm --filter @chatai/server test
git diff --check main...Task/P08
```

### Kết quả

| Check | Result | Ghi chú |
|-------|--------|---------|
| Server typecheck | PASS | `tsc --noEmit` không lỗi |
| Targeted memory tests | PASS | 4 suites, 35 tests |
| Full server Jest | FAIL | 2 suites fail ở Journal/EndChat, không nằm trong diff P08 |
| Diff whitespace | FAIL | Có trailing whitespace trong docs/spec/service |

### Cảnh báo

- Môi trường đang chạy Node `v24.14.0`, trong khi repo yêu cầu `>=20.0.0 <21`.
- Full server Jest fail ở `journal.service.spec.ts` và `end-chat.service.spec.ts`; các file này không nằm trong diff `main...Task/P08`, nhưng CI hiện tại vẫn sẽ fail nếu chạy full suite.
- `git diff --check` báo trailing whitespace ở:
  - `Memori/docs/task_p08_t5_orchestrator_memory_integration.md`
  - `apps/server/src/modules/chat/services/chat-orchestrator.service.spec.ts`
  - `apps/server/src/modules/memory/chroma.client.spec.ts`
  - `apps/server/src/modules/memory/chroma.client.ts`
  - `apps/server/src/modules/memory/memory.service.spec.ts`

---

## 3. Findings

### P1 - App không graceful degrade nếu ChromaDB down lúc boot

**Files**:
- `apps/server/src/modules/memory/chroma.client.ts:23`
- `apps/server/src/modules/memory/chroma.client.ts:35`
- `apps/server/src/app.module.ts:47`

`ChromaClient.onModuleInit()` gọi `getOrCreateCollection()` ngay lúc khởi động và throw `CHROMA_UNAVAILABLE` nếu Chroma lỗi. Vì `MemoryModule` được import vào `AppModule`, server sẽ fail boot khi ChromaDB không sẵn sàng. Điều này trái với acceptance P08.T5: "ChromaDB down -> chat vẫn hoạt động".

Tác động:
- Nếu Chroma container chưa start, đang restart, hoặc mất network, cả API chat/journal/auth cũng không lên.
- `safeRetrieveMemory()` trong orchestrator không có cơ hội fallback vì app đã chết từ lúc boot.

Hướng dẫn refactor:
- Đổi `ChromaClient` sang lazy/non-fatal initialization: `onModuleInit()` chỉ log warning và set state unavailable, không throw trong runtime app.
- Thêm `ensureCollection()` được gọi trong `addDocuments/query/getByIndexRange`, có retry/backoff nhẹ và throw `CHROMA_UNAVAILABLE/CHROMA_QUERY_FAIL` tại operation boundary.
- Giữ memory writer retry qua BullMQ, còn chat reader phải return `''` khi Chroma unavailable.
- Nếu muốn fail-fast cho worker riêng, tách worker process/module config riêng thay vì fail cả API process.
- Thêm test boot module khi Chroma init fail: app vẫn compile/start, `retrieveContext()` fallback rỗng.

### P1 - Memory writer có idempotency sai khi fail giữa plot và character memories

**Files**:
- `apps/server/src/modules/memory/memory.worker.ts:42`
- `apps/server/src/modules/memory/memory.worker.ts:55`
- `apps/server/src/modules/memory/memory.worker.ts:68`
- `apps/server/src/modules/memory/memory.worker.ts:73`
- `apps/server/src/modules/memory/memory.worker.ts:145`

Worker check idempotency bằng cách query xem plot doc của session đã tồn tại chưa. Nếu plot write thành công nhưng bất kỳ character memory nào fail, BullMQ retry sẽ thấy `existingPlot.length > 0` và skip toàn bộ job. Kết quả là session có plot memory nhưng mất một phần hoặc toàn bộ character memories.

Tác động:
- RAG theo nhân vật sẽ bị thiếu context vĩnh viễn.
- Retry không còn đảm bảo eventually consistent.
- Acceptance "Character memories created per character" và "Retry job idempotent skip" chưa được đảm bảo cùng lúc.

Hướng dẫn refactor:
- Đổi idempotency từ "plot exists -> skip job" sang per-document idempotency.
- Thêm API metadata lookup/get-by-id trong `ChromaClient`, hoặc dùng `upsert` nếu Chroma client hỗ trợ.
- Mỗi document có key ổn định: `${sessionId}_plot`, `${sessionId}_char_${char.id}`. Trước khi ghi từng doc, check doc đó đã tồn tại; doc nào thiếu thì ghi tiếp.
- Cân nhắc tách thành 2 loại job: `write-plot` và `write-character`, hoặc lưu progress state vào Redis/DB để retry tiếp đúng bước.
- Thêm unit test: plot add thành công, character add fail lần 1, retry phải ghi tiếp character thay vì skip.

### P1 - `chunk_index` có thể bị trùng và đang phụ thuộc hardcode vector 1024

**Files**:
- `apps/server/src/modules/memory/memory.service.ts:93`
- `apps/server/src/modules/memory/memory.service.ts:94`
- `apps/server/src/modules/memory/memory.service.ts:102`
- `apps/server/src/modules/memory/memory.service.ts:109`
- `apps/server/src/modules/memory/memory.worker.ts:64`

`getLastChunkIndex()` query Chroma bằng zero vector hardcode 1024 để lấy metadata, rồi cache max index 60s. Cách này có 2 lỗi:

- Nếu đổi embed model/dimension, query metadata có thể fail vì dimension không khớp collection.
- Cache lưu `maxIdx` cũ nhưng không update sau khi worker ghi thành công. Hai session kết thúc trong 60s có thể cùng lấy `maxIdx` cũ và ghi trùng `chunk_index`.
- Query chỉ lấy tối đa 200 kết quả, nên story dài hơn 200 chunks có thể tính sai max index dù Chroma vẫn còn dữ liệu cũ.

Tác động:
- Sliding window và sort theo `chunk_index` mất tính tuyến tính.
- RAG có thể lấy sai neighbor hoặc gom nhiều session vào cùng index.
- Đổi model embedding trong config sẽ làm writer fail ở bước metadata lookup, dù embedding service vẫn dùng model mới.

Hướng dẫn refactor:
- Không dùng similarity query để lấy metadata. Thêm `ChromaClient.get(filter, limit?)` hoặc `listMetadatas(filter)` dựa trên `collection.get`.
- Dùng Redis atomic counter theo key `mem:idx:{userId}:{storyId}:{type}` với lock hoặc `INCR` sau khi bootstrap từ Chroma/DB lần đầu.
- Nếu vẫn cache max index, phải update/invalidate cache sau khi ghi thành công.
- Bỏ hardcode 1024; nếu cần vector dimension thì lấy từ config/model metadata và validate collection dimension lúc init.
- Thêm concurrency test: enqueue 2 memory jobs cùng `(user, story)` song song phải tạo index 1 và 2, không trùng.

### P2 - Character summary prompt bị lồng template hai lần

**Files**:
- `apps/server/src/modules/memory/memory.worker.ts:135`
- `apps/server/src/modules/memory/memory.worker.ts:136`

`writeCharacterMemories()` đã build prompt character đầy đủ bằng `buildCharacterPrompt()`, sau đó lại gọi `llmService.summarize(prompt, 'character', ...)`. Trong `summarize()`, template `summary_character` được load lại và chèn `prompt` vào `{{HISTORY_TEXT}}`, nên prompt thực tế bị lồng instruction + history thêm một lần.

Tác động:
- Token usage tăng không cần thiết.
- Chat history bị bao bởi instruction nằm trong instruction, có thể làm summary kém ổn định.

Hướng dẫn refactor:
- Gọi trực tiếp `this.llmService.summarize(text, 'character', { CHAR_NAME: char.name })`.
- Xóa `buildCharacterPrompt()` nếu không cần, hoặc thêm method LLM riêng `complete(prompt)` nếu muốn truyền prompt đã render sẵn.
- Thêm unit test assert text đưa vào LLM không chứa lặp lại header template `summary_character` hai lần.

### P2 - Test coverage chưa verify đường tích hợp thật của RAG

**Files**:
- `apps/server/src/modules/memory/*.spec.ts`
- `apps/server/src/modules/chat/services/chat-orchestrator.service.spec.ts`

Targeted memory tests hiện pass nhưng hầu hết dùng mock cho Chroma/Ollama/BullMQ. Chưa có integration test với Chroma container, chưa có test BullMQ worker thật, và chưa có E2E đảm bảo prompt chat chứa block memory sau khi seed ended sessions.

Tác động:
- Các lỗi runtime như Chroma filter syntax, API version, metadata shape, dimension mismatch, và boot fallback sẽ không bị bắt.
- Acceptance P08.T1/T3/T4/T5 mới được cover ở mức unit, chưa được cover ở mức workflow.

Hướng dẫn refactor:
- Thêm integration suite có real Chroma container: add/query/filter/getByIndexRange/delete.
- Thêm workflow test seed 3 ended sessions -> writer tạo memory -> `retrieveContext()` lấy đúng memory và không leak user khác.
- Thêm orchestrator test assert `PromptBuilder.buildLlmMessages()` nhận `memoryContext` và system prompt có block `[TRÍ NHỚ DÀI HẠN]`/memory section.
- Thêm test Chroma down lúc runtime và lúc boot.

---

## 4. Refactor Checklist

- [ ] Chroma init không làm server API fail boot; memory operation tự fallback/throw ở boundary phù hợp.
- [ ] Memory writer idempotent theo từng document, retry không làm mất character memories.
- [ ] `chunk_index` được cấp phát atomic/sequential, không dùng zero vector hardcode.
- [ ] Character summary không render nested prompt.
- [ ] Bỏ trailing whitespace trong diff.
- [ ] Bổ sung integration/e2e tests cho Chroma, BullMQ writer và ChatOrchestrator memory injection.
- [ ] Chạy lại full server test trên Node 20.x và xử lý các fail còn lại trước khi merge.

---

## 5. Kết Luận Review

P08 đã được review đủ tất cả subtask trong `Task/Task/phase_08_memory_rag.md` và các file `Task/WorkPlan/P08_*`. Hướng triển khai nhìn chung đúng kiến trúc Phase 8, nhưng hiện chưa đạt mức merge-ready vì các lỗi P1 có thể làm app fail boot, mất memory nhân vật sau retry và sai thứ tự `chunk_index`.
