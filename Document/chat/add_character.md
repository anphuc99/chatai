# Tính năng con: Thêm nhân vật & Tạo nhân vật tạm thời (Add Character)

Tính năng này giúp người dùng biến cuộc trò chuyện 1-1 thông thường thành một phòng chat đa nhân vật (Group Chat) sinh động bằng cách thêm/bớt nhân vật linh hoạt, hoặc tạo nhanh các nhân vật phụ dùng một lần.

---

## 1. Mô tả hoạt động

### 🔘 A. Quản lý trạng thái Nhân vật qua nút Toggle
Khi bấm nút **"Thêm nhân vật"** trong Menu góc phải của phòng chat, một Pop-up (Modal) sẽ hiện ra danh sách các nhân vật có sẵn. Cạnh mỗi nhân vật có một nút **Toggle (Bật/Tắt)**:

* **Trạng thái Bật (Toggle ON):**
  - Người dùng bấm bật nhân vật A.
  - Hệ thống sẽ **tự động sinh ra một câu lệnh OOC ẩn** để gửi kèm trong lượt chat tiếp theo của người dùng gửi lên AI Game Master.
  - *Nội dung OOC sinh ra*: 
    `[OOC: Nhân vật A (Tên: [Tên], Tuổi: [Tuổi], Mô tả tính cách: [Mô tả]) đã được thêm vào câu chuyện. Từ lượt chat này, bạn (với vai trò Game Master) có thể cho nhân vật này xuất hiện, hành động và đối thoại bằng tiếng Trung.]`
* **Trạng thái Tắt (Toggle OFF):**
  - Người dùng bấm tắt nhân vật A đã thêm trước đó.
  - Hệ thống **tự động sinh ra một câu lệnh OOC ẩn** gửi kèm trong lượt chat tiếp theo:
  - *Nội dung OOC sinh ra*:
    `[OOC: Nhân vật A đã rời khỏi câu chuyện. Vui lòng không cho nhân vật này xuất hiện hoặc đưa vào các diễn biến chat tiếp theo nữa.]`

### 👤 B. Tạo nhân vật tạm thời (Temporary Character)
Để phục vụ cho các tình huống phát sinh đột xuất trong cốt truyện (ví dụ: người đi đường, bà bán rau, tài xế taxi...), người dùng có thể tạo nhanh nhân vật tạm thời ngay trong phòng chat:
* Bấm nút **"Tạo nhân vật tạm thời"** trên Pop-up.
* Một hộp thoại nhập liệu hiện ra yêu cầu điền: **Tên, Tuổi, Mô tả tính cách, Chọn avatar (tải từ máy và upload lên server), Chọn voice, Chỉnh pitch**.
* Nhấn **"Xác nhận"**: Nhân vật tạm thời được tạo thành công, tự động xuất hiện trong danh sách nhân vật với trạng thái **Toggle Bật (ON)**.
* **Quy tắc vòng đời:** Nhân vật tạm thời này **không được lưu vào Database của ứng dụng**. Khi người dùng kết thúc phiên chat hiện tại, các nhân vật tạm thời này sẽ bị xóa khỏi bộ nhớ State của thiết bị và biến mất vĩnh viễn. 
*(Lưu ý: Việc tạo nhân vật vĩnh viễn để tái sử dụng nhiều lần sẽ được thực hiện ở màn hình quản lý nhân vật ngoài Home và tạm thời chưa bàn đến ở đây).*

---

## 2. Sơ đồ luồng hoạt động (Flowchart)

Sơ đồ dưới đây mô tả cách người dùng tương tác với Pop-up quản lý nhân vật:

```mermaid
flowchart TD
    Start("Bấm 'Thêm nhân vật' từ Menu") --> ShowPopup("Hiển thị Pop-up danh sách nhân vật")
    
    ShowPopup --> SelectAction{"Lựa chọn của người dùng"}
    
    %% Nhánh 1: Tương tác Toggle
    SelectAction -->|"Tương tác Toggle nhân vật có sẵn"| ToggleChange{"Hành động Toggle"}
    ToggleChange -->|Bật Toggle - ON| GenOOCAdd("Tự động tạo bối cảnh OOC: Thêm nhân vật A + Thông tin chi tiết") --> UpdateSessionState("Cập nhật State phòng chat")
    ToggleChange -->|Tắt Toggle - OFF| GenOOCRemove("Tự động tạo bối cảnh OOC: Nhân vật A đã rời đi, không chat nữa") --> UpdateSessionState
    
    %% Nhánh 2: Tạo nhân vật tạm thời
    SelectAction -->|"Bấm 'Tạo nhân vật tạm thời'"| ShowForm("Hiện Form: Tên, Tuổi, Mô tả tính cách, Avatar, Voice, Pitch")
    ShowForm --> SubmitForm("User điền thông tin và Xác nhận")
    SubmitForm --> AddTempList("Thêm vào danh sách nhân vật tạm thời (Chỉ lưu ở bộ nhớ RAM của phòng chat)")
    AddTempList --> AutoToggleON("Tự động Bật Toggle (ON) cho nhân vật vừa tạo") --> GenOOCAdd
    
    UpdateSessionState --> ClosePopup("Đóng Pop-up & Trở lại màn hình Chat")
```

---

## 3. Sơ đồ UML tuần tự (Sequence Diagram)

Sơ đồ mô tả quy trình gửi lệnh OOC ẩn lên AI Game Master khi người dùng Bật/Tắt Toggle của một nhân vật:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as Chat Screen (UI)
    participant State as State Manager (Chat Session)
    participant API as Backend / LLM API (Game Master)

    %% Tương tác Bật Toggle nhân vật
    User->>UI: Mở Pop-up & Bật Toggle nhân vật A
    UI->>State: Cập nhật danh sách nhân vật hoạt động (Thêm A)
    State->>State: Tự động tạo chuỗi OOC bối cảnh thêm nhân vật A
    UI-->>User: Đóng Pop-up và thông báo "Nhân vật A đã tham gia"

    %% Gửi tin nhắn nhập vai tiếp theo
    Note over User, UI: Người dùng gửi lượt chat tiếp theo
    User->>UI: Gõ tin nhắn nhập vai và bấm Gửi
    UI->>State: Lấy bối cảnh OOC thêm nhân vật A đang lưu tạm
    UI->>API: Gửi Payload: [Lịch sử Chat] + [Tin nhắn mới] + [OOC: Nhân vật A đã tham gia câu chuyện]
    Note over API: LLM (Game Master) nhận diện bối cảnh mới:\n- Đưa nhân vật A vào câu chuyện\n- Sinh lời thoại tiếng Trung cho A
    API-->>UI: Trả về lời dẫn tiếng Việt & lời thoại tiếng Trung của nhân vật A (bọc trong thẻ <link>)
    UI-->>User: Hiển thị phản hồi của AI (Có lời thoại của nhân vật A)
```
