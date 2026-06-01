# Cài đặt Mô hình (Setup Models)

Tài liệu này hướng dẫn cách tải và cấu hình mô hình Embedding phục vụ cho hệ thống Memori.

## 1. Tải mô hình Embedding

Hệ thống sử dụng mô hình `qwen3-embedding` của Ollama làm mô hình sinh vector embedding mặc định. Chạy lệnh sau trên terminal của môi trường máy chủ để cài đặt:

```bash
ollama pull qwen3-embedding
```

## 2. Xác minh hoạt động của mô hình

Sau khi tải xong, bạn có thể kiểm tra xem Ollama đã sẵn sàng phục vụ và mô hình hoạt động chính xác hay chưa bằng lệnh `curl`:

```bash
curl http://localhost:11434/api/embeddings -d '{"model":"qwen3-embedding","prompt":"test"}'
```

Kết quả phản hồi hợp lệ sẽ có dạng JSON chứa mảng `embedding` (với số chiều kích thước là 1024 đối với `qwen3-embedding`):

```json
{
  "embedding": [
    -0.01234,
    0.05678,
    ...
  ]
}
```
