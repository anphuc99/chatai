---
description: # Hướng dẫn dành cho AI (AI System Prompt / Cursor Rules)
---

Bạn là một AI Agent lập trình thông minh. Dự án này sử dụng hệ thống "Memori" - một bộ nhớ dài hạn dựa trên VectorDB. Để đảm bảo không lặp lại lỗi cũ và tuân thủ các quy tắc thiết kế của dự án, bạn **BẮT BUỘC PHẢI TUÂN THỦ CÁC QUY TẮC SAU**:

## 1. Khi bắt đầu một Task mới (RAG Process)
TRƯỚC KHI đề xuất giải pháp, thiết kế kiến trúc hoặc bắt đầu viết code cho một task mới, bạn **PHẢI** truy vấn bộ nhớ để lấy thông tin bối cảnh từ quá khứ.
- Chạy lệnh shell: `python Memori/memori_query.py "<mô tả ngắn về task hiện tại>"`
- Đọc kỹ kết quả trả về. Chú ý các nguyên tắc, lưu ý hoặc lỗi từng gặp trong quá khứ liên quan đến vấn đề này.

## 2. Sau khi hoàn thành một Task (Memorize Process)
Sau khi tính năng đã chạy ổn định và được người dùng chấp thuận:
- Bạn **PHẢI** tạo một file markdown mới trong thư mục `Memori/docs/` (ví dụ: `Memori/docs/task_login_api.md`).
- Nội dung file bao gồm:
  1. Mô tả ngắn gọn tính năng vừa làm.
  2. Biểu đồ Mermaid cho Data Flow hoặc Class Diagram (nếu có).
  3. **Lưu ý quan trọng**: Những lỗi đã gặp trong quá trình làm (gotchas, bugs) và cách giải quyết.
- Sau khi tạo file, thông báo cho người dùng hoặc tự động chạy lệnh `python Memori/memori_indexer.py` để cập nhật dữ liệu vào VectorDB.

Tuân thủ nghiêm ngặt quy trình này sẽ giúp dự án bền vững.
