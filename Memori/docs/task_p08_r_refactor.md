# Memori: Refactor Phase 08 (Memory RAG) Review Findings

## 1. Mục Tiêu
Thực hiện refactor các vấn đề được phát hiện trong quá trình code review của nhánh `Task/P08` cho hệ thống Memory RAG, nhằm đảm bảo hệ thống an toàn (graceful degrade), không trùng lặp `chunk_index`, và bảo toàn đầy đủ character memories trong trường hợp BullMQ retries. Đồng thời fix một số lỗi kiểm thử liên quan đến `JournalService` và `EndChatService` (Node 20+ CI).

## 2. Chi Tiết Refactoring

### 2.1. Graceful Degradation cho ChromaDB Boot
- **Vấn đề**: `ChromaClient.onModuleInit()` throw lỗi nếu Chroma container chưa sẵn sàng, khiến toàn bộ server NestJS không thể khởi động.
- **Giải pháp**: 
  - Thay đổi thành Non-fatal initialization (chỉ log warning).
  - Áp dụng lazy-initialization bằng phương thức `ensureCollection()` trước mọi truy vấn (`addDocuments`, `query`, `getByIds`).
  - Lỗi `CHROMA_UNAVAILABLE` sẽ chỉ bị throw khi thực sự có tác vụ tương tác lúc runtime, cho phép các hệ thống khác (như Chat/Journal) vẫn hoạt động độc lập.

### 2.2. Atomic Chunk Index qua Redis
- **Vấn đề**: Việc lấy `chunk_index` dựa trên query vector zero 1024 chiều phụ thuộc vào model embeddings, và việc cache manual gây race condition.
- **Giải pháp**: Sử dụng cơ chế cấp phát atomic counter bằng Redis `INCR` với key `mem:idx:{userId}:{storyId}:{type}` qua hàm `getNextChunkIndex`. 

### 2.3. Idempotency Cấp Độ Tài Liệu cho Memory Worker
- **Vấn đề**: MemoryWorker sử dụng sự tồn tại của Plot memory để skip luôn toàn bộ job, dẫn đến việc nếu Plot được ghi nhưng Character bị lỗi, quá trình retry sẽ bỏ qua và mất đi trí nhớ nhân vật.
- **Giải pháp**: Xóa cờ skip chung, thay vào đó kiểm tra idempotency ở từng document độc lập bằng `ChromaClient.getByIds([docId])` trước khi LLM tóm tắt và ghi.

### 2.4. Sửa lỗi CI Tests & Prompt
- Sửa lỗi LLM Prompt Summary Character bị render lồng template 2 lần bằng cách truyền trực tiếp `text` nguyên bản.
- Sửa lỗi unit test của `JournalService` để phản ánh đúng cấu trúc `orderBy` mảng và cursor base64url JSON.
- Sửa lỗi unit test của `EndChatService` khi session trống (`prisma.message.count` mock sai).
- Xóa tất cả các khoảng trắng dư thừa trong mã nguồn, bao gồm `.md` và `.spec.ts` files. 

## 3. Kết Quả
Bộ kiểm thử chạy hoàn hảo (260 tests passed). Sẵn sàng cho việc merge nhánh `Task/P08` vào `main`.
