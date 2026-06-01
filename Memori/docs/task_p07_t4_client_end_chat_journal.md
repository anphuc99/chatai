---
date: 2026-05-31
---
# Tài liệu Memori: Client End Chat Flow & Journal Screens (P07.T4)

Tài liệu này ghi lại kiến thức thiết kế và triển khai của luồng Kết thúc chat và giao diện Nhật ký (Journal) trên React Native Client.

## 1. Mô tả tính năng
Tích hợp nút kết thúc hội thoại và đồng bộ hoá dữ liệu hội thoại đã kết thúc thành định dạng Sổ tay/Nhật ký (Journal).
- Nút kết thúc `🔚` trên header của `ChatRoomScreen` cho phép người dùng xác nhận kết thúc phiên chat hiện tại.
- Dừng phát giọng nói TTS, gửi yêu cầu kết thúc kèm theo một `Idempotency-Key` (dạng `end-${sessionId}-${Date.now()}`) đến backend để xử lý tóm tắt.
- Chuyển trang an toàn chéo Navigator (từ `Stories/ChatRoom` sang `Journal/JournalDetail`) bằng cách lồng tham số `Main` -> `Journal` -> `JournalDetail`.
- Giao diện Sổ tay (`JournalListScreen`) liệt kê danh sách các phiên chat đã kết thúc với cơ chế phân trang cursor và pull-to-refresh.
- Màn hình chi tiết (`JournalDetailScreen`) hiển thị toàn bộ hội thoại đã lưu ở chế độ chỉ đọc và card tóm tắt nội dung collapsible.

## 2. Chi tiết các hàm & cấu trúc

### `apiClient` (`client.ts`)
- **Cải tiến**: Điều chỉnh request interceptor kiểm tra nếu `config.headers['Idempotency-Key']` đã được định nghĩa thì giữ nguyên, tránh ghi đè ngẫu nhiên bằng `uuidv4()` đối với các request cần cơ chế idempotency từ trước.

### `chatService.endSession(sid, idempotencyKey)`
- Gửi POST request tới `/chat/sessions/:sid/end`. Truyền `Idempotency-Key` trong headers.

### `journalService`
- `listSessions({ storyId, cursor, limit })`: Gửi GET tới `/journal/sessions` kèm query params.
- `getDetail(sid)`: Gửi GET tới `/journal/sessions/:sid`.

### `useJournalStore` (Zustand)
- `items`: Danh sách tóm tắt các session (`SessionSummaryDto[]`).
- `nextCursor`: Cursor cho trang kế tiếp.
- `currentDetail`: Chi tiết session hiện tại (`SessionDetailDto`).
- `loadFirstPage(opts)`: Tải trang đầu tiên (có thể lọc theo `storyId`).
- `loadMore()`: Tải trang tiếp theo nếu `nextCursor` tồn tại.
- `loadDetail(sid)`: Tải chi tiết một session.
- `reset()`: Reset trạng thái store về mặc định khi thoát màn hình.

## 3. Biểu đồ Sequence (End Chat & Navigation)

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant ChatUI as ChatRoomScreen
    participant ChatService as chatService
    participant Backend as Backend Server
    participant Navigation as React Navigation
    participant JournalDetail as JournalDetailScreen

    User->>ChatUI: Nhấn nút 🔚
    ChatUI->>User: Hiện Alert xác nhận
    User->>ChatUI: Chọn "Kết thúc"
    ChatUI->>ChatUI: Dừng phát TTS; setEnding(true)
    ChatUI->>ChatService: endSession(sid, idempKey)
    ChatService->>Backend: POST /chat/sessions/:sid/end
    Note over Backend: Xử lý khóa, tóm tắt bằng LLM & lưu DB
    Backend-->>ChatService: { journalSessionId, summary, ... }
    ChatService-->>ChatUI: Trả về kết quả
    ChatUI->>Navigation: Điều hướng tới Main -> Journal -> JournalDetail (sessionId)
    Navigation->>JournalDetail: Mount màn hình với sessionId
    JournalDetail->>Backend: GET /journal/sessions/:sid
    Backend-->>JournalDetail: SessionDetailDto
    JournalDetail-->>User: Hiển thị tóm tắt & bong bóng chat chỉ đọc
```

## 4. Lưu ý quan trọng & Sửa lỗi (Gotchas / Bugs)

1. **Lỗi resolve merge conflict ở `MessageBubble.tsx`**:
   - *Vấn đề*: Trong quá trình merge trước đó giữa nhánh `Task/P05` và nhánh chính, tệp `MessageBubble.tsx` bị mất hoàn toàn phần imports và khai báo function `MessageBubble`, bắt đầu trực tiếp bằng câu lệnh `case 'assistant':` làm vỡ cú pháp biên dịch.
   - *Cách giải quyết*: Khôi phục lại toàn bộ import và định nghĩa component ở phần đầu file để hoạt động bình thường.
2. **Sử dụng `@react-navigation/native-stack` thay vì `@react-navigation/stack`**:
   - *Vấn đề*: Thư mục mobile sử dụng thư viện native-stack nên việc import `createStackNavigator` và `StackNavigationProp` từ `@react-navigation/stack` dẫn đến lỗi `Module not found`.
   - *Cách giải quyết*: Thay thế bằng `createNativeStackNavigator` và `NativeStackNavigationProp` tương ứng từ `@react-navigation/native-stack`. Cấu hình header option sử dụng `headerShadowVisible: false` thay thế cho các thuộc tính `elevation` và `shadowOpacity`.
3. **Điều hướng chéo Stack**:
   - *Vấn đề*: Nút kết thúc nằm ở `ChatRoom` (thuộc `StoryStack`), còn màn hình đích `JournalDetail` lại nằm ở `JournalStack` riêng.
   - *Cách giải quyết*: Sử dụng cú pháp lồng của React Navigation để nhảy sang MainTab rồi đi sâu vào detail:
     ```typescript
     navigation.navigate('Main', {
       screen: 'Journal',
       params: {
         screen: 'JournalDetail',
         params: { sessionId: result.journalSessionId },
       },
     });
     ```
