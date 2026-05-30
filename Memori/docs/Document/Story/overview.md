# Tổng quan Tính năng: Cốt truyện (Story)

Tính năng **Story** cho phép mỗi người dùng sở hữu và quản lý nhiều câu chuyện nhập vai khác nhau. Bối cảnh và cốt truyện do người dùng hoàn toàn tự do định nghĩa và sáng tạo mà không bị giới hạn.

---

## 1. Phân tích Yêu cầu
- **Quản lý Story**: Mỗi User có thể sở hữu nhiều Story. Mỗi Story có một ID riêng, chứa định nghĩa bối cảnh ban đầu do người dùng thiết lập.
- **Tổng hợp Tiến độ (Story Progress)**: Tính năng End Chat (`end_chat.md`) sẽ đảm nhận việc tổng hợp và **cập nhật tiến độ Story hiện tại (Current Story Progress)** mỗi khi người dùng kết thúc một phiên chat.
- **Thuật toán tổng hợp**: Tiến độ mới = LLM Tổng hợp ( `Tiến độ Story trước đó` + `Các dòng Checkpoint trong history_store.md` + `Các tin nhắn mới sau Checkpoint cuối` ).

---

## 2. Các Sơ đồ Thiết kế (UML & Flow)

### 2.1. Sơ đồ Lớp (Class / Entity Diagram)
Mô tả cấu trúc dữ liệu cơ bản của hệ thống Story.

```mermaid
classDiagram
    class User {
        +String user_id
        +String name
        +createStory()
    }
    class Story {
        +String story_id
        +String user_id
        +String title
        +String initial_setting
        +String current_progress
        +Date created_at
        +Date updated_at
        +updateProgress(new_progress)
    }
    class Session {
        +String session_id
        +String story_id
        +String summary
        +Date started_at
        +Date ended_at
    }
    User "1" --> "*" Story : Sở hữu
    Story "1" --> "*" Session : Bao gồm nhiều phiên
```

### 2.2. Luồng Tạo Câu chuyện (Create Story)
Mô tả luồng tương tác khi người dùng khởi tạo một câu chuyện mới.

#### 2.2.1. Sơ đồ Tuần tự
```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native UI
    participant Server as Backend Server
    participant StoryModule as Story Module
    participant DB as Story Database

    User->>App: Điền thông tin Story (Tiêu đề, Bối cảnh)
    User->>App: Bấm "Tạo Câu chuyện"
    App->>Server: POST /story/create (user_id, title, setting)
    Server->>Server: Validate dữ liệu và tạo story_id
    Server->>StoryModule: Yêu cầu lưu Story mới
    StoryModule->>DB: INSERT INTO Story
    DB-->>StoryModule: Xác nhận lưu thành công
    StoryModule-->>Server: Trả kết quả thành công
    Server-->>App: Trả về JSON {story_id, success: true}
    App->>User: Chuyển hướng sang màn hình Chat mới
```

#### 2.2.2. Sơ đồ Luồng dữ liệu
```mermaid
flowchart TD
    User[Người dùng] -->|1. Nhập Tiêu đề và Bối cảnh| App[React Native UI]
    App -->|2. Gọi API POST /story/create| Server[Backend Server]
    Server -->|3. Validate và Giao việc| StoryMod[Story Module]
    StoryMod -->|4. Lưu dữ liệu| DB[(Story Database)]
    DB -->|5. Xác nhận lưu| StoryMod
    StoryMod -->|6. Trả kết quả| Server
    Server -->|7. Phản hồi story_id| App
    App -->|8. Điều hướng tới Chat| ChatScreen[Màn hình Chat]
```

### 2.3. Luồng Chọn và Bắt đầu Chat từ Danh sách (Select & Start Chat)
Mô tả luồng tương tác khi người dùng truy cập danh sách câu chuyện, chọn một câu chuyện mong muốn và bắt đầu phiên chat mới hoặc tiếp tục phiên chat cũ.

#### 2.3.1. Sơ đồ Tuần tự
```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native UI
    participant Server as Backend Server
    participant StoryModule as Story Module
    participant DB as Story Database

    User->>App: Truy cập Danh sách Câu chuyện
    App->>Server: GET /stories với user_id
    Server->>StoryModule: Lấy danh sách Story của User
    StoryModule->>DB: Truy vấn danh sách Story theo user_id
    DB-->>StoryModule: Trả về danh sách Story
    StoryModule-->>Server: Trả về danh sách Story
    Server-->>App: Trả về JSON Danh sách Story
    App->>User: Hiển thị Danh sách Câu chuyện

    User->>App: Chọn một Câu chuyện từ danh sách
    App->>User: Hiển thị Chi tiết Câu chuyện và Nút Chat
    
    User->>App: Bấm Chat để bắt đầu hoặc tiếp tục
    App->>Server: POST /chat/start với story_id và user_id
    Server->>StoryModule: Khởi tạo Phiên chat
    StoryModule->>DB: Truy vấn bối cảnh và tiến độ hiện tại
    DB-->>StoryModule: Trả về thông tin Story
    StoryModule-->>Server: Trả về thông tin Story
    Server-->>App: Trả về JSON với session_id và tiến độ
    App->>User: Điều hướng sang Màn hình Chat
```

#### 2.3.2. Sơ đồ Luồng dữ liệu (Data Flow Diagram)
```mermaid
flowchart TD
    User[Người dùng] -->|1. Yêu cầu xem Danh sách| App[React Native UI]
    App -->|2. GET /stories| Server[Backend Server]
    Server -->|3. Lấy Story của User| StoryMod[Story Module]
    StoryMod -->|4. Truy vấn Danh sách| DB[(Story Database)]
    DB -->|5. Danh sách Story| StoryMod
    StoryMod -->|6. Danh sách Story| Server
    Server -->|7. Phản hồi JSON| App
    App -->|8. Hiển thị Danh sách và Chọn câu chuyện| User

    User -->|9. Bấm Chat| App
    App -->|10. POST /chat/start| Server
    Server -->|11. Yêu cầu tiến độ và bối cảnh| StoryMod
    StoryMod -->|12. Truy vấn chi tiết| DB
    DB -->|13. Chi tiết Story và Tiến độ hiện tại| StoryMod
    StoryMod -->|14. Khởi tạo session thành công| Server
    Server -->|15. Phản hồi session_id và thông tin| App
    App -->|16. Điều hướng| ChatScreen[Màn hình Chat]
```

### 2.4. Luồng Cập nhật Tiến độ (End Chat Flow)

#### 2.4.1. Sơ đồ Tuần tự
Mô tả luồng tương tác khi người dùng kết thúc phiên chat để cập nhật tiến độ Story.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native UI
    participant Server as Backend Server
    participant StoryModule as Story Module
    participant File as Server File (.jsonl)
    participant LLM as LLM API (Ollama)
    participant Journal as Journal DB

    User->>App: Bấm "Kết thúc chat"
    App->>Server: POST /chat/end (session_id, story_id)
    
    Server->>StoryModule: Yêu cầu Tiến độ Story trước đó (current_progress)
    StoryModule-->>Server: Trả về [Previous Progress]
    
    Server->>File: Đọc file history_session.jsonl
    File-->>Server: Trả về [Danh sách Checkpoints] & [Tin nhắn mới]
    
    Server->>LLM: Gửi Prompt yêu cầu tóm tắt gồm: [Previous Progress] + [Checkpoints] + [Tin nhắn mới]
    Note right of Server: Yêu cầu LLM trả về 2 phần: Session Summary và Current Story Progress
    LLM-->>Server: Trả về JSON {session_summary, current_progress}
    
    Server->>StoryModule: Bàn giao Tiến độ Story mới (current_progress)
    StoryModule-->>Server: Xác nhận cập nhật thành công
    Server->>Journal: Bàn giao payload (session_summary + Metadata)
    Journal-->>Server: Xác nhận lưu thành công
    
    Server->>File: Xóa file cache .jsonl
    Server-->>App: Phản hồi thành công
    App->>User: Điều hướng về màn hình Home
```

#### 2.4.2. Sơ đồ Luồng dữ liệu (Data Flow Diagram)
Mô tả sự dịch chuyển và tổng hợp dữ liệu.

```mermaid
flowchart TD
    Client[React Native Chat UI] -->|Yêu cầu End Chat| Server[Backend Server]
    
    Server -->|1. Lấy Tiến độ cũ| StoryMod[Story Module]
    StoryMod -->|Truy vấn| DB_Story[(Story Database)]
    DB_Story -->|Tiến độ cũ| StoryMod
    StoryMod -->|Trả về Tiến độ cũ| Server
    
    Server -->|2. Đọc Cache| CacheFile[(history_session_jsonl)]
    CacheFile -->|Checkpoints và Tin nhắn| Server
    
    Server -->|3. Gửi Dữ liệu tổng hợp| LLM[LLM API]
    LLM -->|4. Trả về Tóm tắt Session và Tiến độ Story| Server
    
    Server -->|5. Bàn giao Tiến độ mới| StoryMod
    StoryMod -->|Cập nhật| DB_Story
    Server -->|6. Bàn giao Tóm tắt Session| DB_Journal[(Journal Database)]
    
    Server -->|7. Phản hồi hoàn tất| Client
```

#### 2.4.3. Sơ đồ Hoạt động (Activity Diagram)

```mermaid
stateDiagram-v2
    [*] --> StartEndChat : Bấm Kết thúc Chat
    StartEndChat --> FetchPreviousProgress : Yêu cầu Story Module lấy Tiến độ cũ
    FetchPreviousProgress --> ReadCache : Đọc file .jsonl lấy Checkpoints
    ReadCache --> CallLLM : Gửi tổng hợp dữ liệu lên LLM
    CallLLM --> ExtractData : AI sinh Tóm tắt phiên & Tiến độ mới
    ExtractData --> UpdateStoryProgress : Bàn giao Tiến độ Story cho Story Module
    UpdateStoryProgress --> SaveJournal : Bàn giao Tóm tắt Session cho Journal
    SaveJournal --> ClearCache : Xóa cache tạm .jsonl
    ClearCache --> [*] : Chuyển về Home
```
