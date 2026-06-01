---
date: 2026-06-01
---
# Tổng quan Tính năng: Quản lý Nhân vật (Character)

Tài liệu này mô tả chi tiết thiết kế hệ thống, sơ đồ luồng dữ liệu, sơ đồ hoạt động và sơ đồ tuần tự cho tính năng quản lý nhân vật (CRUD) trong ứng dụng.

---

## 1. Sơ đồ Luồng Dữ liệu (Data Flow Diagram - DFD)

Sơ đồ này mô tả cách thông tin nhân vật di chuyển giữa Người dùng, Giao diện React Native, Server lưu trữ media, Cơ sở dữ liệu cục bộ và Engine phát âm (TTS) để nghe thử giọng nói:

```mermaid
flowchart TD
    User([Người dùng])
    UI[React Native UI]
    Server[Media/File Server]
    DB[(Database SQLite/LocalStore)]
    TTS[GPT-SoVITS TTS Engine]

    %% Luồng chọn và upload ảnh
    User -- "1. Chọn ảnh avatar từ thiết bị" --> UI
    UI -- "2. Upload file ảnh (Multipart)" --> Server
    Server -- "3. Trả về URL ảnh trên CDN" --> UI

    %% Luồng tạo và quản lý
    User -- "4. Điền thông tin nhân vật còn lại" --> UI
    UI -- "5. Yêu cầu lưu Character (kèm URL avatar)" --> DB
    DB -- "6. Trả về trạng thái & danh sách Character" --> UI
    UI -- "7. Hiển thị danh sách (Lọc theo Story ID)" --> User

    %% Luồng test giọng nói
    UI -- "8. Yêu cầu nghe thử (Voice ID, Pitch, Text)" --> Server
    Server -- "9. Gọi TTS sinh âm thanh gốc" --> TTS
    TTS -- "10. Trả về file âm thanh gốc" --> Server
    Server -- "11. FFmpeg chỉnh Pitch & trả về Client" --> UI
    UI -- "12. Phát âm thanh" --> User
```

---

## 2. Sơ đồ Hoạt động (Activity Diagram)

Mô tả luồng tương tác và rẽ nhánh của người dùng khi sử dụng giao diện quản lý nhân vật:

```mermaid
flowchart TD
    Start([Bắt đầu màn hình Character]) --> ShowList[Hiển thị danh sách Characters]
    
    %% Lọc theo Story
    ShowList --> FilterStory{Lọc theo Story?}
    FilterStory -- "Có" --> ApplyFilter[Lọc danh sách theo Story ID] --> RenderList[Render danh sách đã lọc]
    FilterStory -- "Không" --> RenderList
    
    RenderList --> UserAction{Thao tác của Người dùng}
    
    %% Thêm mới
    UserAction -- "Bấm Thêm mới" --> ShowFormAdd[Hiển thị Form Thêm Character]
    ShowFormAdd --> FillForm[Điền: Tên, Tuổi, Tính cách, Voice, Pitch, Chọn Story]
    FillForm --> PickAvatarAdd[Chọn ảnh từ thiết bị]
    PickAvatarAdd --> UploadAvatarAdd[Upload lên Server và nhận URL CDN]
    UploadAvatarAdd --> TestVoiceAdd{Bấm nghe thử giọng?}
    TestVoiceAdd -- "Có" --> PlayTestAdd["Backend gọi TTS sinh file gốc"]
    PlayTestAdd --> FFmpegAdd["Backend dùng FFmpeg chỉnh Pitch"] --> ReturnAudioAdd["Phát âm thanh"] --> UploadAvatarAdd
    TestVoiceAdd -- "Không" --> ClickSaveAdd[Bấm Lưu]
    ClickSaveAdd --> ValidateAdd{Dữ liệu hợp lệ & Đã upload avatar?}
    ValidateAdd -- "Không" --> ShowErrorAdd[Báo lỗi trường thông tin / avatar] --> FillForm
    ValidateAdd -- "Có" --> SaveToDB[Lưu Character kèm URL avatar vào DB] --> ShowList
    
    %% Chỉnh sửa
    UserAction -- "Bấm Sửa Character" --> ShowFormEdit[Hiển thị Form Sửa với dữ liệu cũ]
    ShowFormEdit --> EditFields[Chỉnh sửa thông tin, Voice, Pitch]
    EditFields --> ChangeAvatar{Thay đổi Avatar?}
    ChangeAvatar -- "Có" --> PickAvatarEdit[Chọn ảnh mới từ thiết bị] --> UploadAvatarEdit[Upload lên Server & nhận URL mới] --> TestVoiceEdit
    ChangeAvatar -- "Không" --> TestVoiceEdit{Bấm nghe thử giọng?}
    TestVoiceEdit -- "Có" --> PlayTestEdit["Backend gọi TTS sinh file gốc"]
    PlayTestEdit --> FFmpegEdit["Backend dùng FFmpeg chỉnh Pitch"] --> ReturnAudioEdit["Phát âm thanh"] --> ChangeAvatar
    TestVoiceEdit -- "Không" --> SaveOrCancel{Bấm Lưu hay Hủy?}
    SaveOrCancel -- "Hủy" --> ShowList
    SaveOrCancel -- "Lưu" --> ValidateEdit{Dữ liệu hợp lệ?}
    ValidateEdit -- "Không" --> ShowErrorEdit[Báo lỗi trường thông tin] --> EditFields
    ValidateEdit -- "Có" --> UpdateDB[Cập nhật DB với URL avatar mới/cũ] --> ShowList
    
    %% Xóa
    UserAction -- "Bấm Xóa Character" --> ShowWarning[Hiển thị Popup cảnh báo xóa vĩnh viễn]
    ShowWarning --> ConfirmDelete{Xác nhận xóa?}
    ConfirmDelete -- "Hủy" --> ShowList
    ConfirmDelete -- "Xác nhận" --> DeleteDB["Xóa Character khỏi DB & Cập nhật NULL liên kết trong Messages cũ"] --> ShowList
```

---

## 3. Sơ đồ Tuần tự (Sequence Diagram)

### 3.1. Luồng Thêm mới & Chỉnh sửa Nhân vật

Sơ đồ thể hiện tiến trình thêm mới hoặc cập nhật thông tin nhân vật, bao gồm cả bước chọn ảnh từ thiết bị, tải lên server lưu trữ, và tùy chọn nghe thử giọng nói:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as RN Character UI
    participant Server as Media/File Server
    participant State as State Manager (Zustand)
    participant DB as Database (SQLite/Local)
    participant TTS as GPT-SoVITS Engine

    User->>UI: Chọn Thêm mới / Chỉnh sửa
    UI->>UI: Tải danh sách Story để hiển thị Picker chọn Story
    UI->>User: Hiển thị Form nhập liệu (Tên, Tuổi, Mô tả, Voice, Pitch, Story)

    rect rgb(255, 245, 230)
        Note over User, Server: Quy trình Chọn & Upload Avatar
        User->>UI: Bấm nút "Chọn Avatar"
        UI->>User: Hiển thị giao diện Image Picker thiết bị
        User->>UI: Chọn file ảnh từ thư viện (Gallery)
        UI->>Server: POST /api/upload (gửi Multipart Form Data file ảnh)
        Server-->>UI: Trả về URL ảnh CDN (ví dụ: https://server.com/uploads/abc.png)
        UI->>UI: Cập nhật hiển thị ảnh Preview trên Form
    end

    rect rgb(240, 248, 255)
        Note over User, TTS: Tùy chọn nghe thử giọng nói (TTS Test)
        opt Người dùng nhấn nút "Nghe thử 🔊"
            User->>UI: Bấm nghe thử giọng
            UI->>Server: POST /tts/test (text, voice_id, pitch)
            Server->>TTS: Yêu cầu sinh âm thanh gốc (text, voice_id)
            TTS-->>Server: Trả về Buffer âm thanh gốc
            Note over Server: Sử dụng FFmpeg để chỉnh cao độ (Pitch)
            Server->>Server: Xử lý bằng FFmpeg
            Server-->>UI: Trả về Buffer âm thanh đã xử lý
            UI-->>User: Phát âm thanh qua loa
        end
    end

    User->>UI: Nhấn "Lưu"
    UI->>UI: Kiểm tra dữ liệu (Validation - yêu cầu có URL Avatar)
    
    alt Validate thất bại
        UI->>User: Hiển thị cảnh báo lỗi (Tên trống, Chưa chọn avatar...)
    else Validate thành công
        alt Thao tác là Thêm mới
            UI->>DB: INSERT INTO Characters (name, age, personality, avatar, voice_id, pitch, story_id)
            Note over DB: Trường avatar lưu URL CDN trả về từ Server
        else Thao tác là Chỉnh sửa
            UI->>DB: UPDATE Characters SET ... WHERE id = char_id
        end
        DB-->>UI: Xác nhận lưu thành công
        UI->>State: Cập nhật danh sách nhân vật trên RAM
        UI->>User: Thông báo thành công & Quay lại màn hình danh sách
    end
```

---

### 3.2. Luồng Xóa Nhân vật (Đảm bảo an toàn lịch sử)

Khi xóa một nhân vật, để tránh việc các tin nhắn hội thoại cũ (đang được lưu trong History Store hoặc Journal) bị lỗi hiển thị hoặc bị xóa mất do ràng buộc khóa ngoại (Cascading Delete), hệ thống sẽ gỡ liên kết khóa ngoại trước khi xóa hẳn nhân vật trong Database:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as RN Character UI
    participant State as State Manager (Zustand)
    participant DB as Database (SQLite/Local)

    User->>UI: Nhấn nút "Xóa" trên thẻ nhân vật X
    UI->>User: Hiện Popup: "Hành động này sẽ xóa vĩnh viễn nhân vật X. Các câu thoại cũ của nhân vật vẫn được giữ lại trong lịch sử. Bạn có chắc chắn?"

    alt Người dùng Hủy
        User->>UI: Bấm "Hủy"
        UI->>UI: Đóng Popup & Giữ nguyên trạng thái
    else Người dùng Xác nhận
        User->>UI: Bấm "Xác nhận xóa"
        
        %% Xử lý an toàn dữ liệu
        UI->>DB: UPDATE Messages SET character_id = NULL WHERE character_id = X
        Note over DB: Câu thoại, pinyin, bản dịch cũ trong bảng Messages<br/>vẫn được giữ lại nhờ lưu trữ tĩnh
        
        UI->>DB: DELETE FROM Characters WHERE id = X
        DB-->>UI: Phản hồi xóa thành công
        
        UI->>State: Xóa nhân vật X khỏi danh sách quản lý
        UI->>UI: Làm mới danh sách Character hiển thị
        UI->>User: Thông báo đã xóa nhân vật thành công
    end
```

---

## 4. Đặc tả Cấu trúc Dữ liệu (Database Schema / ERD)

```mermaid
erDiagram
    STORIES ||--o{ CHARACTERS : "contains"
    CHARACTERS ||--o{ MESSAGES : "wrote (nullable)"
    
    STORIES {
        string id PK "UUID câu chuyện"
        string title "Tiêu đề câu chuyện"
        string description "Mô tả bối cảnh"
    }

    CHARACTERS {
        string id PK "UUID nhân vật"
        string name "Tên nhân vật (ví dụ: Mimi, Bố, Anh trai)"
        integer age "Tuổi"
        string personality "Mô tả tính cách"
        string avatar "Đường dẫn URL ảnh avatar trên CDN/Server"
        string voice_id "ID model voice GPT-SoVITS"
        float pitch "Cao độ giọng nói (ví dụ: 0.8 đến 1.5)"
        string story_id FK "Liên kết thuộc Story nào"
        datetime created_at "Ngày tạo"
    }

    MESSAGES {
        string id PK "UUID tin nhắn"
        string session_id FK "Liên kết phiên chat"
        string characterName "Lưu tĩnh tên nhân vật (để render khi character bị xóa)"
        string text "Câu thoại tiếng Trung hoặc lời dẫn"
        string translation "Bản dịch tiếng Việt"
        jsonb words "Mảng phân rã chữ Hán, Pinyin, nghĩa Việt"
        string character_id FK "Liên kết Nullable với Characters"
    }
```
