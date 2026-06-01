---
description: Luôn áp dụng quy trình Memori trong repository này. Trước khi đề xuất giải pháp, thiết kế kiến trúc, refactor hoặc hiện thực một task mới, hãy truy vấn Memori để lấy bối cảnh liên quan từ quá khứ. Sau khi task ổn định và được chấp thuận, hãy ghi tài liệu vào Memori/docs và đồng bộ lại bộ nhớ.
alwaysApply: true
---

# Hướng dẫn Memori cho AI

Dự án này sử dụng hệ thống "Memori" làm bộ nhớ dài hạn, được lưu bằng VectorDB (Ollama `qwen3-embedding` + JSON). Luôn tuân thủ quy trình dưới đây để tránh lặp lại lỗi cũ và giữ thiết kế dự án nhất quán.

## 1. Trước khi bắt đầu task mới

Trước khi đề xuất giải pháp, thiết kế kiến trúc, review, refactor hoặc viết code cho một task mới, phải truy vấn Memori để lấy bối cảnh liên quan.

- Chạy lệnh: `node Memori/memori-query.mjs "<mô tả ngắn gọn của task hiện tại>"`
- Đọc kỹ kết quả trả về.
- Rút ra các nguyên tắc, quy ước, gotcha, bug cũ và cách xử lý đã từng được áp dụng.
- Nếu task là review hoặc sửa lỗi, ưu tiên truy vấn bằng tên module, feature, endpoint hoặc phase liên quan.

## 2. Trong lúc thực hiện task

- Không bỏ qua thông tin đã truy vấn được từ Memori khi ra quyết định.
- Nếu phát hiện quy ước mới, bug quan trọng hoặc cách xử lý cần tái sử dụng, hãy ghi nhớ để đưa vào tài liệu Memori sau khi task được chấp thuận.

## 3. Sau khi hoàn thành task

Khi tính năng đã ổn định và được người dùng chấp thuận:

- Tạo một file Markdown mới trong `Memori/docs/`.
- Đặt tên file rõ nghĩa, ví dụ: `Memori/docs/task_login_api.md`.
- Nội dung tối thiểu cần có:
  1. Mô tả ngắn gọn tính năng hoặc thay đổi vừa thực hiện.
  2. Giải thích rõ các module, hàm, service hoặc luồng xử lý chính đã tác động.
  3. Thêm biểu đồ Mermaid cho data flow hoặc class diagram nếu điều đó giúp tái sử dụng kiến thức.
  4. Ghi rõ các gotcha, bug, regression risk và cách giải quyết.
- Sau khi tạo tài liệu, thông báo cho người dùng hoặc chạy: `npm run memori:sync`

## 4. Nguyên tắc bắt buộc

- Không bỏ qua bước truy vấn Memori đối với task mới.
- Không kết luận thiết kế chỉ dựa trên suy đoán nếu Memori đã có dữ liệu liên quan.
- Không kết thúc task mà không cập nhật `Memori/docs/` khi thay đổi đã được chấp thuận và có giá trị tái sử dụng.
