---
date: 2026-05-30
---
# P01: Auth & User Profile - Code Review & Refactor

## 1. Mô tả tính năng
Thực hiện code review cho phase 01 (Auth + User Profile) và tiến hành refactor các vấn đề đã phát hiện trong quá trình code review:
- Thiết lập biến môi trường thay cho hardcode config của Firebase Client.
- Chỉnh sửa lỗi strict typing (vd: `Bucket` của `@google-cloud/storage` thay vì `any`).
- Chuẩn hoá error handling với `AppException` trong các controller.
- Loại bỏ export dư thừa của `FIREBASE_ADMIN` để tránh conflict import.
- Sửa lỗi stale closure có nguy cơ xảy ra ở `useProfile` hook bằng cách sử dụng `useRef` cho optimistic update.
- Sửa lỗi kết nối emulator nhiều lần do Fast Refresh ở client.

## 2. Các hàm / Component chính
- `apps/mobile/src/utils/firebase.ts`: Khởi tạo Firebase App, cấu hình Emulator và sử dụng `process.env`.
- `apps/mobile/src/features/profile/hooks/useProfile.ts`: Quản lý state profile, optimistic updates, và debounce API calls.
- `apps/server/src/shared/firebase/storage.service.ts`: Wrapper service Firebase Admin Storage.
- `apps/server/src/modules/users/users.controller.ts`: Controller API Users, bắt buộc chuẩn hoá exception về `AppException`.

## 3. Lưu ý quan trọng (Gotchas & Bugs)
- **Firebase Config Hardcode**: Firebase config keys cho Web/Client dù an toàn khi public nhưng TUYỆT ĐỐI không nên hardcode. Luôn sử dụng `.env` để dễ dàng đổi môi trường (Staging/Production).
- **Fast Refresh với Firebase Emulator (React Native)**: Khi lưu file `firebase.ts`, Fast Refresh sẽ chạy lại đoạn code kết nối emulator (`connectAuthEmulator`, `connectFirestoreEmulator`), gây văng lỗi do Firebase SDK chặn gọi 2 lần. Cần thêm một flag ngoài module scope như `let isEmulatorConnected = false;` để chặn.
- **Optimistic Updates & Stale Closures**:
  - Khi triển khai debounce logic bên trong React component/hook, cẩn thận với việc sử dụng các state variables (như `user`) trực tiếp trong callback của `setTimeout`.
  - Thay vì capture previous state vào biến hằng cục bộ (`const previousUser = {...user}`), hãy dùng `useRef` để lưu giá trị trước đó (`previousValues.current`) và lúc revert hãy lấy state mới nhất từ store để ghi đè (vd: `useAuthStore.getState().user`) kết hợp giá trị ref, nhằm tránh revert nhầm cả những field vừa cập nhật sau đó.
- **NestJS Custom Exceptions**: Controller không nên ném raw `Error()` vì sẽ trả về lỗi `500 Internal Server Error`. Phải bọc bằng các exception custom chuẩn (vd: `AppException`) để trả mã lỗi phù hợp (vd: 400 Bad Request).
- **Tránh export lặp vòng lặp tên**: Đừng export lại cùng một variable từ các module provider khác nhau. Chỉ nên export ra Provider (nếu dùng chung) từ một file duy nhất để tránh confusion.
