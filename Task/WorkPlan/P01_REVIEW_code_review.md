# 📋 Code Review — Phase 01: Auth + User Profile

**Reviewer**: Senior Code Review  
**Branch**: `Task/P01` vs `main`  
**Ngày review**: 2026-05-30  
**Tổng files thay đổi**: ~250 files, +7946 / -143 lines

---

## 🔍 Tổng Quan

Phase 01 triển khai xác thực Google Sign-In, quản lý profile người dùng, navigation flow, và shared types package. Nhìn chung code **đạt chất lượng tốt**, kiến trúc rõ ràng, theo đúng workplan. Tuy nhiên có một số vấn đề cần refactor trước khi merge.

---

## 🔴 VẤN ĐỀ NGHIÊM TRỌNG (Phải sửa)

### R1. Firebase Config Hardcode trong Source Code
**File**: `apps/mobile/src/utils/firebase.ts` (Line 5-12)

```typescript
const firebaseConfig = {
  apiKey: 'AIzaSyCkqBzJfQShMO6yKWvkidD1JBihLh4Asd8',
  authDomain: 'chatai-24b76.firebaseapp.com',
  projectId: 'chatai-24b76',
  // ...
};
```

**Vấn đề**: Firebase config (API key, project ID, app ID) bị hardcode trực tiếp. Mặc dù Firebase API key không phải là secret theo nghĩa truyền thống (nó được giới hạn bởi security rules), nhưng nó vẫn **không nên nằm trong source code** vì:
1. Khó chuyển đổi giữa các môi trường (dev/staging/production).
2. Nếu cần rotate key → phải sửa code, rebuild.

**Hướng dẫn refactor**:
```typescript
// apps/mobile/src/utils/firebase.ts
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
```
Thêm vào `apps/mobile/.env.example`:
```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

---

### R2. `StorageService.bucket` typing là `any`
**File**: `apps/server/src/shared/firebase/storage.service.ts` (Line 13)

```typescript
private readonly bucket: any; // admin.storage.Bucket
```

**Vấn đề**: Dùng `any` mất type safety. Comment gợi ý type nhưng không dùng.

**Hướng dẫn refactor**:
```typescript
import { Bucket } from '@google-cloud/storage';
// ...
private readonly bucket: Bucket;
```

---

### R3. `UsersController.uploadAvatar` ném raw `Error` thay vì `AppException`
**File**: `apps/server/src/modules/users/users.controller.ts` (Line 34)

```typescript
throw new Error('Không nhận được file upload');
```

**Vấn đề**: Ném `Error` thay vì `AppException` sẽ bypass format lỗi chuẩn của `GlobalExceptionFilter`, trả về lỗi 500 generic thay vì 400 INVALID_PAYLOAD.

**Hướng dẫn refactor**:
```typescript
import { AppException, ERR } from '../../shared/errors/app-exception';
// ...
if (!file) {
  throw new AppException(ERR.INVALID_PAYLOAD as string, 'Không nhận được file upload');
}
```

---

## 🟡 VẤN ĐỀ TRUNG BÌNH (Nên sửa)

### R4. `AuthGuard` re-export `FIREBASE_ADMIN` từ `firebase.module.ts` gây confused import
**File**: `apps/server/src/shared/firebase/firebase.module.ts` (Line 12)

```typescript
export class FirebaseModule {}
export { FIREBASE_ADMIN };
```

**Vấn đề**: `FIREBASE_ADMIN` được export từ cả `firebase-admin.provider.ts` và `firebase.module.ts`. Trong `auth.guard.ts` import từ `firebase.module`, trong `firestore.service.ts` và `storage.service.ts` import từ `firebase-admin.provider.ts`. Không nhất quán, dễ gây confusion.

**Hướng dẫn refactor**: Quy ước chỉ import `FIREBASE_ADMIN` từ `firebase-admin.provider.ts`. Xoá dòng `export { FIREBASE_ADMIN };` khỏi `firebase.module.ts`.

---

### R5. `ERR.INVALID_TOKEN as string` type casting không cần thiết
**File**: Nhiều nơi (`auth.guard.ts`, `auth.service.ts`, `users.service.ts`)

```typescript
throw new AppException(ERR.INVALID_TOKEN as string);
throw new AppException(ERR.INTERNAL_ERROR as string, '...');
```

**Vấn đề**: Nếu `ERR` đã là object chứa string values thì `as string` là redundant. Nếu `AppException` constructor cần `string` nhưng `ERR.INVALID_TOKEN` là kiểu khác → nên fix type definition thay vì cast.

**Hướng dẫn refactor**: Kiểm tra type definition của `ERR` enum/object và `AppException` constructor. Nếu `ERR` values là `string`, loại bỏ tất cả `as string`. Nếu không, sửa type definition cho phù hợp.

---

### R6. `useProfile` hook có stale closure risk trong debounce
**File**: `apps/mobile/src/features/profile/hooks/useProfile.ts` (Line 71-86)

```typescript
debounceTimers.current[key] = setTimeout(async () => {
  try {
    // ...
    await profileApi.patchPreferences(dto);
  } catch (error: any) {
    setUser(previousUser); // ⚠️ previousUser captured at callback creation time
  }
}, 300);
```

**Vấn đề**: `previousUser` được capture tại thời điểm `updatePref` được gọi. Nếu user thay đổi preference A rồi preference B nhanh, và API A fail → revert sẽ dùng state cũ, có thể revert cả B.

**Hướng dẫn refactor**:
```typescript
// Sử dụng ref để lưu previous state cho mỗi key
const previousValues = useRef<{ [key: string]: any }>({});
// Lưu lại giá trị cũ theo key trước khi optimistic update
previousValues.current[key] = key === 'hskLevel' ? user.hskLevel : user.preferences[key];
// Trong catch, chỉ revert key cụ thể thay vì toàn bộ user
```

---

### R7. `useEffect` dependency trong `useProfile` gây re-subscribe không cần thiết
**File**: `apps/mobile/src/features/profile/hooks/useProfile.ts` (Line 39)

```typescript
}, [user?.uid, setUser]);
```

**Vấn đề**: `setUser` là selector từ Zustand store, nhưng nếu dùng `useAuthStore(s => s.setUser)` — selector này trả stable reference. Tuy nhiên nếu có bất kỳ re-render nào khiến `setUser` thay đổi ref, Firestore subscription sẽ bị huỷ rồi tạo lại liên tục.

**Hướng dẫn refactor**: Loại bỏ `setUser` khỏi dependency array vì Zustand selectors trả về stable functions:
```typescript
}, [user?.uid]); // setUser từ Zustand là stable reference
```

---

### R8. Thiếu `storage.rules` newline cuối file
**File**: `storage.rules`

```diff
-    }
-  }
-}
\ No newline at end of file
+    }
+  }
+}
```

**Hướng dẫn**: Thêm newline cuối file.

---

## 🟢 GÓP Ý NHỎ (Nice-to-have)

### R9. `ProfileScreen` hardcode background color
**File**: `apps/mobile/src/features/profile/screens/ProfileScreen.tsx` (Line 191, 202)

```typescript
backgroundColor: '#F8FAFC',
// ...
backgroundColor: '#FFFFFF',
```

**Góp ý**: Nên dùng `theme.colors.background` và `theme.colors.card` để consistency với thiết kế hệ thống.

---

### R10. `auth.store.ts` — `bypassLoginDev` dùng `require()` dynamic import
**File**: `apps/mobile/src/stores/auth.store.ts` (Line 57-58)

```typescript
const { auth } = require('../utils/firebase');
const { signInAnonymously } = require('firebase/auth');
```

**Góp ý**: Dynamic `require()` trong React Native có thể gây issue với Metro bundler (tree-shaking). Nên dùng top-level import nhưng bọc trong `__DEV__` check ở runtime.

---

### R11. Thiếu error handling chi tiết cho Firestore emulator connection
**File**: `apps/mobile/src/utils/firebase.ts` (Line 29-41)

`connectAuthEmulator` và `connectFirestoreEmulator` sẽ throw nếu gọi nhiều lần (ví dụ khi hot-reload). Code đã có try-catch nhưng nên kiểm tra trạng thái đã connect chưa trước khi gọi.

---

### R12. `UsersService.invalidateCache` nên là `private`
**File**: `apps/server/src/modules/users/users.service.ts` (Line 113)

```typescript
async invalidateCache(uid: string): Promise<void> {
```

**Góp ý**: Workplan chỉ rõ đây là `private` method. Hiện đang `public` → other services có thể gọi trực tiếp, không đúng intention.

---

## ✅ ĐIỂM TỐT

1. **Cấu trúc module rõ ràng** — Auth, Users, Firebase tách module đúng NestJS convention.
2. **Unit tests có coverage tốt** — `auth.service.spec.ts`, `auth.guard.spec.ts`, `users.service.spec.ts`, `auth.store.test.ts` đều có mock đầy đủ.
3. **Security rules chặt chẽ** — Firestore rules chặn client sửa `gems`, `streak`, `tutorialStep`. Storage rules kiểm tra size + content type.
4. **Shared types design** — Barrel exports + workspace protocol đúng monorepo convention.
5. **Optimistic update + debounce** — `useProfile` hook triển khai pattern này đúng cách.
6. **Navigation conditional** — Pattern SplashScreen → Auth/Main đúng best practice React Navigation.
7. **AuthGuard global + @Public() decorator** — Pattern chuẩn NestJS.
8. **Token refresh flow** — Hydrate → refresh ID token → load profile flow đầy đủ.

---

## 📊 TỔNG KẾT

| Severity | Số lượng | Trạng thái |
|----------|----------|------------|
| 🔴 Nghiêm trọng | 3 | Cần sửa trước khi merge |
| 🟡 Trung bình | 5 | Nên sửa |
| 🟢 Nhỏ | 4 | Nice-to-have |

**Kết luận**: Code đạt chất lượng tốt về mặt kiến trúc và logic. Các vấn đề nghiêm trọng liên quan đến security (hardcode config) và consistency (type safety, error handling). Recommend **sửa 3 issues đỏ** trước khi merge, các issues vàng có thể xử lý trong sprint tiếp theo.
