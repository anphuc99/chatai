# Thiết kế tính năng: Màn hình Cá nhân (Profile & Settings)

Tài liệu này mô tả sơ đồ luồng hoạt động (UML Sequence Diagram) cho các thao tác chính trong màn hình Hồ sơ cá nhân (Profile). Bao gồm: Tải thông tin, Cập nhật cài đặt học tập và Đổi ảnh đại diện.

---

## 1. Sơ đồ UML Tuần tự: Tải thông tin và Thống kê học tập

Khi người dùng mở màn hình Profile, ứng dụng sẽ lấy thông tin cá nhân, thống kê tiến độ học (XP, Streak) và các cài đặt từ server.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native App (UI)
    participant State as Local State (Zustand)
    participant API as Backend Server
    participant DB as Database

    User->>App: Mở màn hình Profile
    
    %% Fetch dữ liệu từ API
    App->>API: Gửi yêu cầu lấy thông tin user (GET /users/me)
    API->>DB: Truy vấn thông tin cơ bản & Settings
    DB-->>API: Trả về dữ liệu User
    
    API->>DB: Truy vấn Thống kê học tập (Streak, XP, Words)
    DB-->>API: Trả về Dữ liệu thống kê
    
    API-->>App: Trả về JSON (Profile + Stats + Settings)
    
    %% Cập nhật UI
    App->>State: Lưu dữ liệu vào Global State
    State-->>App: Trigger re-render UI
    App-->>User: Hiển thị giao diện Profile đầy đủ (Avatar, Streak, Settings)
```

---

## 2. Sơ đồ UML Tuần tự: Thay đổi Cài đặt Học tập (Settings)

Quá trình người dùng thay đổi các cấu hình như: Bật/tắt hiển thị Pinyin, đổi tốc độ giọng đọc AI (TTS Speed).

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native App (UI)
    participant Storage as Async Storage (Local)
    participant API as Backend Server

    User->>App: Bật/tắt Pinyin HOẶC Thay đổi tốc độ giọng đọc
    
    %% Áp dụng ngay trên UI cho mượt
    App->>Storage: Lưu cài đặt xuống Local Storage (để dùng Offline)
    App-->>User: Cập nhật giao diện lập tức (Optimistic UI)
    
    %% Đồng bộ Background
    App->>API: Gửi yêu cầu cập nhật Settings (PATCH /users/preferences)
    
    alt Cập nhật thành công
        API-->>App: HTTP 200 OK
    else Lỗi kết nối / Server lỗi
        API-->>App: HTTP 400/500 Error
        App->>User: Hiển thị Toast thông báo lỗi ("Không thể đồng bộ cài đặt")
        App->>Storage: (Tuỳ chọn) Rollback lại cài đặt cũ
    end
```

---

## 3. Cài đặt Ngôn ngữ Dẫn truyện (Narrator Language)

Trong phần Cài đặt của Profile, người dùng có thể thiết lập ngôn ngữ hiển thị cho **Người dẫn chuyện (Narrator)**. Giá trị này sẽ được lưu và truyền vào biến `[NGÔN NGỮ NARRATOR]` trong System Prompt.

Ứng dụng sẽ có logic tự động **gợi ý ngôn ngữ Narrator** dựa trên cấp độ HSK hiện tại của người dùng nhằm tối ưu hóa trải nghiệm học tập:

- **Tân binh (HSK 1 - HSK 2):** Khuyến nghị chọn **Tiếng Việt**. (Giúp người mới học không bị ngợp khi đọc các đoạn mô tả bối cảnh dài).
- **Trung cấp (HSK 3 - HSK 4):** Khuyến nghị chọn **Tiếng Anh** hoặc **Tiếng Trung (kèm Pinyin)**. (Khuyến khích quen dần với văn cảnh ngoại ngữ, tạo môi trường song ngữ).
- **Cao cấp (HSK 5 - HSK 6):** Khuyến nghị chọn **Tiếng Trung (Tắt Pinyin)**. (Môi trường nhúng 100% tiếng Trung để rèn tư duy ngôn ngữ trực tiếp).

*Lưu ý: Mặc dù có gợi ý, người dùng vẫn có quyền tuỳ chỉnh và tự do chọn ngôn ngữ Narrator mà mình muốn.*

---

## 4. Sơ đồ UML Tuần tự: Cập nhật Ảnh đại diện (Upload Avatar)

Luồng tải ảnh mới lên hệ thống, có thể kết hợp với các dịch vụ Cloud như AWS S3 hoặc Cloudinary.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as React Native App (UI)
    participant API as Backend Server
    participant Cloud as Cloud Storage (S3/Cloudinary)

    User->>App: Nhấn chọn ảnh đại diện mới từ thư viện máy
    App-->>User: Hiển thị Preview ảnh vừa chọn
    
    User->>App: Xác nhận "Lưu/Cập nhật"
    App->>App: Nén ảnh (Compress Image) ở client
    
    App->>API: Gọi API lấy Pre-signed URL hoặc gửi trực tiếp file (POST /users/avatar)
    
    %% Luồng Upload
    API->>Cloud: Upload file ảnh
    Cloud-->>API: Trả về URL ảnh công khai (Public URL)
    
    %% Lưu URL vào Database
    API->>API: Cập nhật Avatar URL vào bảng User
    API-->>App: Trả về URL ảnh mới (HTTP 200)
    
    App-->>User: Hiển thị thông báo "Cập nhật thành công" và áp dụng Avatar mới
```
