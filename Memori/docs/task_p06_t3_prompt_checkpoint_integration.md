# Task P06.T3 — Tích Hợp Checkpoint vào Prompt Builder

## 1. Mô Tả Tính Năng
Cập nhật `PromptBuilderService` để hỗ trợ trích xuất checkpoint (tóm tắt lịch sử trước đó) ở đầu mảng lịch sử trò chuyện `history`. Checkpoint này được đưa vào danh sách tin nhắn dưới dạng tin nhắn hệ thống (system message) chuyên biệt, giúp nén prompt gửi đến LLM Ollama mà vẫn giữ được bối cảnh cốt truyện chính.

## 2. Chi Tiết Các Hàm

### `PromptBuilderService` (`apps/server/src/modules/chat/services/prompt-builder.service.ts`)

*   `buildLlmMessages(systemPrompt, history, userMessage, persistentOOC, ephemeralOOCs, memoryContext)`:
    *   **Bước 1 (Composite System)**: Kết hợp `systemPrompt` gốc với `persistentOOC` (bối cảnh cố định) và `memoryContext` (ký ức dài hạn) thành tin nhắn `system` đầu tiên.
    *   **Bước 2 (Trích xuất Checkpoint đầu)**: Tạo bản sao nông `workingHistory = [...history]`. Lấy phần tử đầu tiên `firstEntry = workingHistory[0]`. Nếu nó là `checkpoint`, đẩy tin nhắn `system` với nội dung `## TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ\n${summary}` vào mảng `messages`, đồng thời gọi `workingHistory.shift()` để loại bỏ checkpoint này khỏi danh sách duyệt tiếp theo.
    *   **Bước 3 (Duyệt lịch sử)**: Duyệt qua `workingHistory` còn lại. Nếu gặp checkpoint phụ (nested), hiển thị dưới dạng `## TÓM TẮT TRƯỚC ĐÓ (PHỤ)`. Các loại entry khác xử lý như cũ.
    *   **Bước 4 (User Turn cuối)**: Kết hợp tin nhắn `userMessage` hiện tại với `ephemeralOOCs` (nếu có) thành tin nhắn `user` cuối cùng.

## 3. Data Flow Diagram

```mermaid
graph TD
    A[Bắt đầu buildLlmMessages] --> B[Tạo Composite System Message]
    B --> C{workingHistory[0] là checkpoint?}
    C -- Đúng --> D[Trích xuất summary và push System Message 'TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ']
    D --> E[workingHistory.shift]
    C -- Sai --> F[Duyệt qua các History Entry]
    E --> F
    F --> G[Xử lý từng entry: user, assistant_batch, checkpoint phụ...]
    G --> H[Thêm tin nhắn User cuối kèm Ephemeral OOC]
    H --> I[Trả về LlmMessage[]]
```

## 4. Lưu Ý Quan Trọng (Gotchas & Bugs)

*   **TypeScript Discriminated Union Narrowing**:
    *   *Lỗi gặp phải*: Khi kiểm tra `workingHistory[0].type === 'checkpoint'` trực tiếp trên mảng, TypeScript Compiler báo lỗi `Object is possibly 'undefined'` và không thu hẹp kiểu (narrowing) thuộc tính `workingHistory[0].data` thành kiểu chứa `summary`.
    *   *Cách giải quyết*: Gán phần tử đầu tiên vào một hằng số cục bộ `const firstEntry = workingHistory[0];`. Sau đó kiểm tra `if (firstEntry && firstEntry.type === 'checkpoint')`. Lúc này TypeScript thực hiện narrowing kiểu chính xác trên `firstEntry` và cho phép truy cập `firstEntry.data.summary` một cách an toàn.
