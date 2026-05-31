# P06.T3 — PromptBuilder đọc Checkpoint

> **Review**: DONE — xem `Task/WorkPlan/P06_R_review_refactor.md`

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P06.T3 |
| Phase | 6 |
| Depends on | P06.T2 |
| Complexity | Low |
| Risk | Low |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- Update `PromptBuilderService.buildLlmMessages` để xử lý entry đầu là `checkpoint`:
  - Inject summary làm system message `[TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ]`.
  - Loại entry checkpoint khỏi conversation loop.
- Đảm bảo memoryContext + persistentOOC + summary thứ tự đúng.

---

## 3. FILES CẦN SỬA

| # | Path |
|---|------|
| 1 | `apps/server/src/modules/chat/services/prompt-builder.service.ts` — sửa |
| 2 | `apps/server/src/modules/chat/services/prompt-builder.service.spec.ts` — bổ sung test |

---

## 4. SEQUENCE — Build with checkpoint

```mermaid
sequenceDiagram
    participant Orch
    participant HS as HistoryStore
    participant PB

    Orch->>HS: readSinceLastCheckpoint(sid)
    HS-->>Orch: [checkpoint, user, ass, user, ass, ...]
    Orch->>PB: buildLlmMessages(sysPrompt, entries, userMsg, persOOC, ephOOCs, memCtx)
    PB->>PB: head = entries[0], if checkpoint → extract summary; tail = entries.slice(1)
    PB->>PB: push system(systemPrompt + persOOC + memCtx)
    PB->>PB: push system("[TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ] " + summary)
    PB->>PB: foreach entry in tail → push user/assistant
    PB->>PB: push final user(userMsg + ephOOC)
    PB-->>Orch: LlmMessage[]
```

---

## 5. CHI TIẾT — buildLlmMessages updated

```
buildLlmMessages(systemPrompt, history, userMessage, persistentOOC, ephemeralOOCs, memoryContext?): LlmMessage[]

Logic:
  messages: LlmMessage[] = []
  
  // 1. Build composite system message
  combinedSystem = systemPrompt
  if memoryContext: combinedSystem += `\n\n## TRÍ NHỚ DÀI HẠN\n${memoryContext}`
  if persistentOOC: combinedSystem += `\n\n## BỐI CẢNH CỐ ĐỊNH (OOC)\n${persistentOOC}`
  messages.push({ role: 'system', content: combinedSystem })

  // 2. Extract checkpoint nếu có
  workingHistory = [...history]
  if workingHistory.length > 0 && workingHistory[0].type === 'checkpoint':
    summary = workingHistory[0].data.summary
    messages.push({
      role: 'system',
      content: `## TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ\n${summary}`
    })
    workingHistory.shift()
  
  // 3. Iterate history (may still contain inner checkpoints if multiple, but readSinceLastCheckpoint slice from last; shouldn't happen)
  for entry of workingHistory:
    switch entry.type:
      case 'user':
        txt = entry.data.text
        if entry.data.ephemeralOOC: txt = `[OOC: ${entry.data.ephemeralOOC}]\n${txt}`
        messages.push({ role: 'user', content: txt })
      case 'assistant_batch':
        messages.push({ role: 'assistant', content: JSON.stringify({ content: entry.data.messages, triggerMemory: entry.data.triggerMemory ?? false }) })
      case 'checkpoint':
        // Nested (rare) → also inject as system note
        messages.push({ role: 'system', content: `## TÓM TẮT TRƯỚC ĐÓ (PHỤ)\n${entry.data.summary}` })
      // persistent_ooc, ephemeral_ooc, system → skip
      default: continue

  // 4. Final user turn
  finalUser = userMessage
  if ephemeralOOCs?.length:
    finalUser = `[OOC: ${ephemeralOOCs.join('; ')}]\n${userMessage}`
  messages.push({ role: 'user', content: finalUser })

  return messages
```

---

## 6. ACCEPTANCE & TEST PLAN

### Acceptance
- [ ] History bắt đầu checkpoint → messages[1] = system với summary.
- [ ] System messages thứ tự: [combinedSystem(prompt+mem+OOC), checkpoint summary, ...history, final user].
- [ ] Token count của messages array < `MAX_HISTORY_TOKENS + len(summary tokens) + system overhead` (verify giảm).
- [ ] Không có entry trước checkpoint còn xuất hiện trong messages.

### Unit Tests
| Test | Assert |
|------|--------|
| history with checkpoint as first | messages includes summary system msg, no pre-checkpoint entries |
| history no checkpoint | no checkpoint system msg |
| memory + OOC + summary all present | order correct |
| ephemerals concat in final user | substring "[OOC: a; b]" |
| assistant_batch serialized as JSON | JSON.parse roundtrip |
