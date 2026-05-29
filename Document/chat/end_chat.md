# Tính năng con: Kết thúc chat & Tóm tắt bài học (End Chat)

Tính năng **Kết thúc chat** giúp người dùng đóng lại phiên hội thoại hiện tại và tự động lưu bản tóm tắt cốt truyện bằng tiếng Việt. Tính năng này đóng vai trò là một bộ điều phối (Orchestrator) thực hiện thu thập dữ liệu cache, làm sạch, tóm tắt và bàn giao **bản tóm tắt (summary)** cùng các siêu dữ liệu (metadata) của session sang cho module Journal để lưu trữ vĩnh viễn (lịch sử tin nhắn chi tiết sẽ do History Store bàn giao riêng). Sau khi hoàn tất, hệ thống sẽ đưa người dùng trở lại màn hình Home.

---

## 1. Mô tả hoạt động

- **Vị trí**: Nút **"Kết thúc chat"** trong Menu góc phải của Header.
- **Cách thức hoạt động**:
  - **Bước 1**: Người dùng bấm nút "Kết thúc chat" và xác nhận đồng ý đóng phiên hội thoại.
  - **Bước 2**: Giao diện Client (React Native) lập tức **khóa ô nhập liệu chat (Input Disabled)** và các nút điều khiển, hiển thị biểu tượng đang tải (Loading indicator) để tránh người dùng tiếp tục gửi tin nhắn trong lúc hệ thống đang đóng phiên.
  - **Bước 3 (Tổng hợp Tóm tắt Session và Tiến độ Story)**: Backend Server đọc nội dung file cache `.jsonl` từ Server đĩa cứng và truy xuất **Tiến độ cốt truyện trước đó (Previous Progress)** từ cơ sở dữ liệu Story. Để triệt tiêu nguy cơ tràn token mà vẫn đảm bảo ngữ cảnh tóm tắt hoàn chỉnh, hệ thống sẽ:
    - Quét toàn bộ file `.jsonl` để thu thập **tất cả các dòng `checkpoint`** đã được tạo ra trong phiên hiện tại.
    - Lấy tiếp toàn bộ các tin nhắn đã làm sạch (phẳng hóa `assistant`, lấy thoại của `user`) nằm phía sau dòng checkpoint cuối cùng.
    - Gửi payload tổng hợp gồm: `[Tiến độ cốt truyện trước đó]` + `[Danh sách Checkpoint Summaries hiện tại]` + `[Các tin nhắn sau checkpoint cuối cùng]` lên LLM API.
    - Yêu cầu LLM thực hiện 2 việc độc lập:
      1. Tóm tắt nội dung dành riêng cho phiên chat hiện tại (Session Summary).
      2. Tổng hợp thành **Tiến độ cốt truyện hiện tại (Current Story Progress)** mới nhất để lưu lại cho tương lai.
  - **Bước 4**: Backend Server thực hiện việc bàn giao dữ liệu cho các module tương ứng:
    - Bàn giao **Tiến độ cốt truyện hiện tại (current_progress)** cho **Story Module**. Story Module sẽ chịu trách nhiệm cập nhật tiến độ mới này vào Database.
    - Bàn giao **bản tóm tắt phiên chat (session summary)** cùng metadata của session (như `session_id`, `user_id`, `story_id`, `started_at`, `ended_at`) cho **Journal Module** xử lý. Journal Module chịu trách nhiệm tự động thực hiện lưu trữ bản tóm tắt này vào Database và cập nhật trạng thái session sang đã đóng (`ended`).
  - **Bước 5**: Nhận được phản hồi thành công từ module Journal, Backend Server xóa file cache `.jsonl` tạm thời trên Server và trả phản hồi thành công về cho Client.
  - **Bước 6**: Nhận được tín hiệu thành công, Client **tự động chuyển hướng điều hướng quay trở lại Màn hình chính (Home Screen)** luôn mà không cần qua bất kỳ màn hình báo cáo trung gian nào. Người dùng có thể xem lại lịch sử các buổi chat này sau đó thông qua tính năng **Journal (Nhật ký)** từ màn hình Home.

### Ví dụ cấu trúc JSON dữ liệu bàn giao cho Journal:
```json
{
  "session_id": "session_123456-uuid-abcd",
  "user_id": "user_789",
  "story_id": "story_cabin_in_snow_001",
  "started_at": 1782500000000, 
  "ended_at": 1782500500000,
  "summary": "Bối cảnh ban đầu là bão tuyết trong cabin gỗ. Có tiếng gõ cửa lạ vang lên, hai anh em sau khi mở cửa đã phát hiện ra một chú chó lạc dưới tuyết và đưa nó vào nhà sưởi ấm. Bão tuyết hiện đã ngớt."
}
```

---

## 2. Sơ đồ tuần tự Kết thúc chat (Sequence Diagram)

Sơ đồ mô tả luồng tương tác giữa Client, Server, LLM API, Journal Module và File Cache khi kết thúc phiên hội thoại:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native Chat UI
    participant Server as Backend Server
    participant StoryModule as Story Module
    participant File as Server File (.jsonl)
    participant LLM as LLM API (Gemini/OpenAI)
    participant Journal as Journal Module

    User->>App: Bấm chọn Kết thúc chat
    App->>User: Hiển thị hộp thoại xác nhận
    User->>App: Xác nhận Đồng ý kết thúc
    
    App->>App: Khóa ô nhập liệu và cụm điều khiển (Input Disabled & Loading)
    App->>Server: Gửi yêu cầu kết thúc (POST /chat/end, session_id, story_id)
    
    Server->>StoryModule: Yêu cầu Tiến độ Story trước đó
    StoryModule-->>Server: Trả về [Previous Progress]
    
    Server->>File: Đọc file history_session.jsonl
    File-->>Server: Trả về nội dung cache (Checkpoints & Tin nhắn mới)
    
    Server->>LLM: Gửi Prompt yêu cầu tóm tắt: [Previous Progress] + [Checkpoints] + [Tin nhắn mới]
    Note right of Server: Yêu cầu LLM trả về 2 phần: Session Summary và Current Story Progress
    LLM-->>Server: Trả về JSON {session_summary, current_progress}
    
    Server->>StoryModule: Bàn giao Tiến độ Story mới (current_progress)
    StoryModule-->>Server: Xác nhận cập nhật thành công
    Server->>Journal: Bàn giao Tiến độ phiên chat (session_summary + Metadata)
    Journal-->>Server: Xác nhận lưu DB & cập nhật session = ended thành công
    
    Server->>File: Xóa file cache history_session.jsonl
    Server-->>App: Trả phản hồi thành công
    
    App->>App: Mở khóa ô nhập liệu (nếu cần) và điều hướng quay lại Màn hình chính (Home Screen)
```

---

## 3. Sơ đồ Luồng dữ liệu End Chat (Data Flow Diagram)

Sơ đồ mô tả dòng chảy của dữ liệu và các thao tác đọc/ghi giữa Client, Backend Server, LLM API và Relational Database (SQL) thông qua Journal:

```mermaid
flowchart TD
    Client[React Native Chat UI] -->|1. Yêu cầu kết thúc chat| Server[Backend Server]
    
    Server -->|2. Lấy Tiến độ cũ| StoryMod[Story Module]
    StoryMod -->|Truy vấn| DB_Story[(Story Database)]
    DB_Story -->|Tiến độ cũ| StoryMod
    StoryMod -->|Trả về Tiến độ cũ| Server
    
    Server -->|3. Đọc Cache| CacheFile[(history_session_jsonl)]
    CacheFile -->|Checkpoints và Tin nhắn cuối| Server
    
    Server -->|4. Gửi Dữ liệu tổng hợp| LLM[LLM API]
    LLM -->|5. Trả về Tóm tắt Session và Tiến độ Story| Server
    
    Server -->|6. Bàn giao Tiến độ mới| StoryMod
    StoryMod -->|Cập nhật| DB_Story
    Server -->|7. Bàn giao Tóm tắt Session| Journal[Journal Module]
    Journal -->|8. Lưu bản tóm tắt và đóng session| SQLDB[(SQL Database)]
    
    Server -->|9. Xóa file cache| CacheFile
    Server -->|10. Phản hồi thành công| Client
    
    Client -->|11. Điều hướng quay lại| Home[Màn hình chính Home]
```

---

## 4. Ý tưởng phát triển (Premium)

* **Tự động lưu trữ nhanh (One-click End):** Cung cấp cấu hình cho phép kết thúc chat ngay lập tức không cần xác nhận qua modal nếu người dùng đã bật chế độ "Lưu nhanh" trong cài đặt app.
* **Xuất bản kịch bản (Export Script):** Cho phép người dùng xuất bản cuộc trò chuyện nhập vai của mình thành một file PDF hoặc tài liệu chữ có kèm Pinyin và bản dịch từ màn hình Nhật ký (Journal) để ôn tập.