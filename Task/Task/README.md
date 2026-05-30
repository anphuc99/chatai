# Task Board — Solo Dev Sequential Execution Plan

> **Nguyên tắc phân chia**: Mỗi task là một đơn vị công việc **độc lập về logic**, có input rõ ràng, output kiểm chứng được, và **không conflict** với task khác khi thực hiện tuần tự từ trên xuống dưới.

## Quy ước đọc

- **Phase**: Nhóm lớn theo dependency (tương ứng workplan)
- **Task ID**: `P{phase}.T{số}` — ví dụ `P0.T1`
- **Status**: `[ ]` chưa làm | `[~]` đang làm | `[x]` hoàn thành
- **Depends on**: Task bắt buộc phải xong trước khi bắt đầu task hiện tại

## Tổng quan Phase

| Phase | Tên | Số tasks |
|-------|-----|----------|
| 0 | Bootstrap & Foundation | 8 |
| 1 | Auth + User Profile | 7 |
| 2 | Story + Character CRUD | 6 |
| 3 | TTS Service | 5 |
| 4 | Chat MVP (Core) | 8 |
| 5 | Chat UI + TTS Playback | 5 |
| 6 | Checkpoint Mechanism | 3 |
| 7 | End Chat + Journal | 5 |
| 8 | Long-term Memory (RAG) | 5 |
| 9 | Auto Chat + Shop Contextual | 5 |
| 10 | Vocabulary + SRS | 6 |
| 11 | Mission + Streak + System Shop | 6 |
| 12 | Tutorial Overlay | 3 |
| 13 | Polish + Premium Features | 4 |

**Tổng: 76 tasks**

---

Chi tiết từng task xem file tương ứng:
- [Phase 0](./phase_00_bootstrap.md)
- [Phase 1](./phase_01_auth.md)
- [Phase 2](./phase_02_story_character.md)
- [Phase 3](./phase_03_tts.md)
- [Phase 4](./phase_04_chat_mvp.md)
- [Phase 5](./phase_05_chat_ui_playback.md)
- [Phase 6](./phase_06_checkpoint.md)
- [Phase 7](./phase_07_end_chat_journal.md)
- [Phase 8](./phase_08_memory_rag.md)
- [Phase 9](./phase_09_auto_shop.md)
- [Phase 10](./phase_10_vocabulary_srs.md)
- [Phase 11](./phase_11_mission_streak_shop.md)
- [Phase 12](./phase_12_tutorial.md)
- [Phase 13](./phase_13_premium.md)
