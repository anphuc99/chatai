# P06 — Code Review & Refactor Guide

> **Reviewer**: Senior Code Review  
> **Branch**: `Task/P06` vs `main`  
> **Date**: 2026-05-31  
> **Review status**: DONE  
> **Merge recommendation**: NEEDS REFACTOR BEFORE MERGE

---

## 1. Tổng quan subtask

| Task | Scope | Code | Tests | Review |
|------|-------|------|-------|--------|
| P06.T1 | TokenCounterService + threshold config | DONE | PARTIAL | DONE |
| P06.T2 | Checkpoint writer + async summarize | DONE | PARTIAL | DONE |
| P06.T3 | PromptBuilder đọc checkpoint | DONE | PARTIAL | DONE |

**Kết luận**: Tất cả subtask P06 đã được review đầy đủ. Code hiện tại pass typecheck và unit tests, nhưng còn các vấn đề cần sửa trước khi merge vào `main`, đặc biệt là checkpoint chạy song song với lượt chat mới và không giữ raw recent turns sau checkpoint.

---

## 2. Kết quả kiểm tra

### Commands đã chạy

```powershell
pnpm --filter @chatai/server typecheck
pnpm --filter @chatai/server exec jest --runInBand
git diff --check main...HEAD
```

### Kết quả

| Check | Result | Ghi chú |
|-------|--------|---------|
| Server typecheck | PASS | `tsc --noEmit` không lỗi |
| Server Jest full suite | PASS | 23 suites, 183 tests |
| Targeted P06 Jest | PASS | 6 suites, 59 tests |
| Diff whitespace | FAIL | Có trailing whitespace trong docs/spec/service |

### Warnings

- Môi trường chạy test đang dùng Node `v24.14.0`, trong khi repo yêu cầu `>=20.0.0 <21`.
- Jest báo open handles sau full suite. Không thấy test fail, nhưng cần kiểm tra nếu CI treo.
- `git diff --check` báo trailing whitespace ở:
  - `Memori/docs/task_p06_t1_token_counter.md`
  - `Memori/docs/task_p06_t2_checkpoint_writer.md`
  - `apps/server/src/modules/chat/services/checkpoint.service.ts`
  - `apps/server/src/modules/chat/services/checkpoint.service.spec.ts`

---

## 3. Findings

### P1 — Checkpoint async dùng lock riêng nên có thể race với lượt chat kế tiếp

**Files**:
- `apps/server/src/modules/chat/services/chat-orchestrator.service.ts:145`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:24`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:33`
- `apps/server/src/modules/chat/chat.controller.ts:76`

**Vấn đề**: Lượt chat chính được serialize bằng Redis lock `chat:lock:${sid}`, nhưng checkpoint async dùng lock riêng `chat:ckpt-lock:${sid}`. Sau khi response trả về, checkpoint vẫn có thể đang đọc/summarize history trong lúc request kế tiếp append user/assistant vào cùng `.jsonl`.

Race có thể xảy ra:

1. Turn N append assistant, trả response, schedule checkpoint.
2. Turn N+1 bắt đầu và append user.
3. Checkpoint đọc history và summarize cả user N+1 nhưng chưa có assistant N+1.
4. Checkpoint append `type: checkpoint` vào giữa lifecycle của turn N+1.

Hậu quả: checkpoint có thể chứa context nửa lượt, prompt sau đó mất thứ tự hội thoại hoặc tóm tắt sai trạng thái cuối.

**Hướng refactor**:

- Option A, recommended: checkpoint phải acquire cùng session lock `chat:lock:${sid}` trước khi đọc history. Nếu lock bận thì skip, để lượt sau trigger lại.
- Option B: truyền snapshot entries đã ổn định từ orchestrator sau append assistant vào checkpoint service, không để checkpoint tự `readSinceLastCheckpoint()` trên file đang thay đổi.
- Option C: đưa checkpoint vào background queue theo session, worker serialize theo cùng key session.

Pseudo-fix:

```ts
maybeTriggerAsync(sid: string): void {
  setImmediate(async () => {
    try {
      await this.redis.withLock(`chat:lock:${sid}`, 120_000, async () => {
        await this.checkAndCreateLocked(sid);
      });
    } catch (e) {
      if (e instanceof ConflictException) return;
      this.logger.error({ sid, err: e }, 'Checkpoint trigger failed');
    }
  });
}
```

Sau refactor cần thêm test mô phỏng checkpoint không chạy khi `chat:lock:${sid}` đang bận.

---

### P1 — Checkpoint không giữ raw recent turns sau khi summarize

**Files**:
- `apps/server/src/modules/chat/services/checkpoint.service.ts:56`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:74`
- `apps/server/src/modules/chat/services/history-store.service.ts:101`

**Vấn đề**: `createCheckpoint()` summarize toàn bộ entries sau checkpoint cuối rồi append checkpoint ở cuối file. `readSinceLastCheckpoint()` sau đó chỉ trả về `[checkpoint]`. Nghĩa là lượt tiếp theo chỉ còn summary, không còn vài lượt raw gần nhất.

Với roleplay/chat, summary 200-400 từ không thay thế tốt các câu gần nhất, cảm xúc cuối, pending question, wording, hoặc OOC mới. Bộ nhớ dài hạn cũng có mô tả luồng "trừ 5 lượt cuối", nhưng implementation hiện tại chưa làm.

**Hướng refactor**:

- Giữ lại N lượt gần nhất, ví dụ 5 user/assistant turns.
- Checkpoint data nên có metadata `coveredUntilTimestamp` hoặc `coveredUntilEntryIndex`.
- `readSinceLastCheckpoint()` không nên chỉ `slice(lastCheckpointIndex)`. Nó cần trả về checkpoint gần nhất + các raw entries sau `coveredUntil`.

Ví dụ schema:

```ts
data: {
  summary,
  tokensBefore,
  entriesCovered,
  coveredUntilTimestamp,
  retainedTailEntries: 10
}
```

Read logic:

```ts
const last = findLastCheckpoint(all);
if (!last) return all;
return [
  last,
  ...all.filter((e) => e.timestamp > last.data.coveredUntilTimestamp && e.type !== 'checkpoint'),
];
```

Acceptance nên đổi từ "không có raw messages từ trước checkpoint" thành "không có entries đã covered; vẫn giữ tail chưa covered".

---

### P2 — `character_toggle` bị skip khi token count và summarize checkpoint

**Files**:
- `apps/server/src/modules/chat/services/token-counter.service.ts:48`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:110`
- `apps/server/src/modules/chat/services/prompt-builder.service.ts:141`

**Vấn đề**: PromptBuilder đã biết inject `character_toggle` vào prompt khi raw history còn tồn tại, nhưng checkpoint formatter lại skip entry này. Sau checkpoint, sự kiện nhân vật vào/rời cảnh có thể biến mất khỏi context nếu LLM không tự suy ra từ assistant messages.

TokenCounter cũng skip `character_toggle`, nên threshold undercount khi session có nhiều toggle events.

**Hướng refactor**:

Trong `TokenCounterService`:

```ts
case 'character_toggle':
  sum += this.estimateTokens(e.data.name) + 8;
  break;
```

Trong `CheckpointService.formatHistoryForSummary()`:

```ts
case 'character_toggle': {
  const action = e.data.on ? 'xuất hiện trong cảnh' : 'rời khỏi cảnh';
  lines.push(`[Nhân vật: ${e.data.name} ${action}]`);
  break;
}
```

Thêm unit test cho cả token count và summary formatter.

---

### P2 — Config threshold thiếu validation bounds

**Files**:
- `apps/server/src/config/validation.schema.ts:18`
- `apps/server/src/config/chat.config.ts:10`

**Vấn đề**: `MAX_HISTORY_TOKENS` và `CHECKPOINT_TRIGGER_RATIO` chỉ là `Joi.number()`. Các giá trị như `0`, `-1`, `2`, hoặc `NaN` có thể khiến checkpoint trigger mỗi lượt hoặc không bao giờ trigger.

**Hướng refactor**:

```ts
MAX_HISTORY_TOKENS: Joi.number().integer().min(1).default(6000),
CHECKPOINT_TRIGGER_RATIO: Joi.number().greater(0).max(1).default(0.8),
```

Thêm `chat.config.spec.ts` cho default `6000`, `0.8`, threshold `4800`, và invalid env values.

---

### P2 — Test lock concurrency chưa chứng minh acceptance "chỉ 1 checkpoint"

**Files**:
- `apps/server/src/modules/chat/services/checkpoint.service.spec.ts:112`
- `apps/server/src/modules/chat/services/checkpoint.service.spec.ts:151`

**Vấn đề**: Test hiện tại xác nhận `withLock()` được gọi và xử lý `SESSION_LOCKED`, nhưng chưa có test concurrent thật cho 2 `maybeTriggerAsync()` cùng session. Acceptance P06.T2 yêu cầu "2 turns gần nhau cùng vượt threshold → chỉ 1 checkpoint được tạo".

**Hướng refactor test**:

- Dùng fake timers hoặc expose `maybeTrigger()` async nội bộ để test deterministically.
- Mock `redis.withLock()` giữ promise pending cho call đầu, call hai trả `ConflictException`.
- Assert `createCheckpoint` chỉ được gọi 1 lần.

Đề xuất tách method:

```ts
maybeTriggerAsync(sid: string): void {
  setImmediate(() => void this.maybeTrigger(sid));
}

async maybeTrigger(sid: string): Promise<void> {
  // logic hiện tại
}
```

Unit test gọi trực tiếp `await service.maybeTrigger(sid)` sẽ sạch hơn `done + setImmediate`.

---

### P2 — Prompt system order không khớp WorkPlan T3

**Files**:
- `apps/server/src/modules/chat/services/prompt-builder.service.ts:93`
- `apps/server/src/modules/chat/services/prompt-builder.service.ts:96`
- `Task/WorkPlan/P06_T3_prompt_checkpoint_integration.md`

**Vấn đề**: WorkPlan T3 mô tả `memoryContext` trước `persistentOOC`, nhưng code hiện tại append persistent OOC trước memory. Đây không phải bug runtime rõ ràng, nhưng prompt contract nên ổn định vì Phase 8 sẽ gắn memory vào đây.

**Hướng refactor**:

- Chốt thứ tự bằng comment/test rõ ràng. Nếu theo WorkPlan, đổi thành:

```ts
let fullSystem = systemPrompt;
if (memoryContext) fullSystem += `\n\n## KÝ ỨC LIÊN QUAN\n${memoryContext}`;
if (persistentOOC) fullSystem += `\n\n## BỐI CẢNH CỐ ĐỊNH\n${persistentOOC}`;
```

- Test nên assert index order, không chỉ `toContain`.

---

### P3 — `git diff --check` fail vì trailing whitespace

**Files**:
- `Memori/docs/task_p06_t1_token_counter.md:13`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:51`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:55`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:58`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:61`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:64`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:68`
- `Memori/docs/task_p06_t2_checkpoint_writer.md:71`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:57`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:66`
- `apps/server/src/modules/chat/services/checkpoint.service.ts:68`
- `apps/server/src/modules/chat/services/checkpoint.service.spec.ts:116`
- `apps/server/src/modules/chat/services/checkpoint.service.spec.ts:136`
- `apps/server/src/modules/chat/services/checkpoint.service.spec.ts:200`

**Hướng refactor**: chạy formatter hoặc xóa trailing spaces trước merge. Đây là low risk nhưng có thể fail CI nếu bật whitespace check.

---

## 4. Acceptance coverage

| Task | Acceptance | Status |
|------|------------|--------|
| P06.T1 | Token heuristic cho Chinese/English/mixed | PASS |
| P06.T1 | `estimateHistoryTokens` synthetic entries | PASS |
| P06.T1 | Config defaults 6000 + 0.8 -> 4800 | CODE OK, MISSING DIRECT TEST |
| P06.T2 | Under threshold không gọi LLM | PASS |
| P06.T2 | Over threshold gọi summarize + append checkpoint | PASS |
| P06.T2 | LLM summarize fail không crash main flow | PARTIAL, covered by fire-and-forget catch style but no orchestrator failure test |
| P06.T2 | Concurrent 2 turns chỉ tạo 1 checkpoint | PARTIAL, lock path tested but not real concurrency |
| P06.T2 | Real Ollama + Redis integration | NOT RUN |
| P06.T3 | History bắt đầu checkpoint -> summary system msg | PASS |
| P06.T3 | No checkpoint -> no summary system msg | PASS |
| P06.T3 | Memory + OOC + summary order | PARTIAL, content tested; exact intended order mismatch |
| P06.T3 | Token count messages < threshold | NOT TESTED |

---

## 5. Refactor priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P1 | Serialize checkpoint with chat turns | 1-2h | Prevent corrupt/partial checkpoint context |
| P1 | Retain recent raw tail after checkpoint | 2-4h | Better roleplay continuity |
| P2 | Include `character_toggle` in token/summary | 20m | Preserve character state across checkpoint |
| P2 | Add config bounds + tests | 20m | Prevent bad env behavior |
| P2 | Deterministic checkpoint concurrency tests | 45m | Prove acceptance |
| P2 | Decide and enforce prompt system order | 10m | Stable Phase 8 integration |
| P3 | Remove trailing whitespace | 5m | CI hygiene |

---

## 6. Suggested post-refactor test plan

1. `pnpm --filter @chatai/server typecheck`
2. `pnpm --filter @chatai/server exec jest --runInBand`
3. Add targeted tests:
   - `ChatConfig` default and invalid env validation.
   - `CheckpointService` same-session lock conflict with active chat lock.
   - `CheckpointService` retains last N turns after checkpoint.
   - `TokenCounterService` and `CheckpointService.formatHistoryForSummary` include `character_toggle`.
   - `PromptBuilderService` asserts exact ordering of system, memory, OOC, checkpoint summary.
4. Manual/integration with real Redis + Ollama:
   - Seed 30 turns above threshold.
   - Send one turn and wait for checkpoint.
   - Send next turn and inspect prompt/history: checkpoint summary exists, recent raw tail still present, no partial current turn summarized.

---

## 7. Files nên sửa khi refactor

| File | Reason |
|------|--------|
| `apps/server/src/modules/chat/services/checkpoint.service.ts` | Serialize lock, tail retention, formatter coverage |
| `apps/server/src/modules/chat/services/history-store.service.ts` | `readSinceLastCheckpoint()` needs coveredUntil-aware logic |
| `apps/server/src/modules/chat/services/token-counter.service.ts` | Count `character_toggle` |
| `apps/server/src/modules/chat/services/prompt-builder.service.ts` | Stabilize memory/OOC order |
| `apps/server/src/config/validation.schema.ts` | Add bounds |
| `apps/server/src/config/chat.config.ts` | Add direct tests; optionally clamp/validate |
| `apps/server/src/modules/chat/services/*.spec.ts` | Add missing acceptance tests |
| `Memori/docs/task_p06_*.md` | Remove trailing whitespace |

---

*Review completed for all P06 WorkPlan subtasks. Implementation is close, but merge should wait until P1/P2 findings are addressed.*
