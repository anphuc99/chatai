# Phase 1 — Auth + User Profile

> **Mục tiêu**: User đăng nhập Google, server verify token, tạo/cập nhật profile, client persist session.  
> **Phụ thuộc**: Phase 0 hoàn thành.

---

## P1.T1 — Firebase Project Setup + Service Account

**Status**: `[x]` ✅ DONE  
**Depends on**: P0.T8 (Phase 0 hoàn thành)

**Mô tả chi tiết**:
1. Vào [Firebase Console](https://console.firebase.google.com/), tạo project `chatai-dev`.
2. Bật **Authentication** → Enable provider **Google**.
3. Tạo **Firestore Database** (Native mode), region `asia-southeast1`.
4. Tạo **Cloud Storage** bucket default.
5. Tải **Service Account JSON** (Project Settings > Service accounts > Generate new private key).
6. Đặt file `firebase-sa.json` vào `apps/server/` (đã có trong `.gitignore`).
7. Ghi nhận các config vào `.env`:
   ```env
   FIREBASE_PROJECT_ID=chatai-dev
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-sa.json
   FIREBASE_STORAGE_BUCKET=chatai-dev.appspot.com
   ```
8. Tạo **Android app** trong Firebase console, tải `google-services.json`.
9. Tạo **iOS app** (nếu cần), tải `GoogleService-Info.plist`.
10. Cấu hình SHA-1 fingerprint (debug keystore) cho Google Sign-In.

**Output kiểm chứng**:
- Firebase console hiện project với Auth, Firestore, Storage enabled.
- Service account JSON decrypt được và có `project_id` đúng.

---

## P1.T2 — Server AuthModule (Firebase Admin SDK Verify)

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T1

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   pnpm add firebase-admin
   ```
2. Tạo `src/modules/auth/`:
   ```
   auth/
   ├── auth.module.ts
   ├── auth.controller.ts
   ├── auth.service.ts
   ├── dto/
   │   ├── google-signin.dto.ts    # { idToken: string }
   │   └── user-response.dto.ts    # UserDto
   └── firebase-admin.provider.ts  # khởi tạo admin.initializeApp()
   ```
3. `firebase-admin.provider.ts`:
   - Load service account từ path trong env.
   - `admin.initializeApp({ credential: admin.credential.cert(sa) })`.
   - Export `firebaseAdmin` instance.
4. `auth.service.ts`:
   - `verifyIdToken(idToken: string)`: Gọi `admin.auth().verifyIdToken(idToken)` → trả `{ uid, email, name, picture }`.
   - `upsertUser(decoded)`: Gọi `PrismaService` upsert `users_meta` + sync Firestore `users/{uid}`.
5. `auth.controller.ts`:
   - `POST /auth/google-signin`: Validate body (`GoogleSigninDto`), gọi service, trả `UserDto`.
   - `POST /auth/logout`: placeholder (204).
6. Cập nhật `AuthGuard` (`shared/guards/auth.guard.ts`):
   - Extract Bearer token từ header.
   - Gọi `admin.auth().verifyIdToken(token)`.
   - Gắn `request.user = { uid, email }`.
   - Throw `UnauthorizedException` nếu invalid/expired.
7. Register `AuthGuard` là **global guard** (trừ routes decorate `@Public()`).
8. Tạo decorator `@Public()` + `@CurrentUser()`.

**Output kiểm chứng**:
- Unit test: mock `admin.auth().verifyIdToken()`, verify guard cho pass/reject.
- Integration: gọi `POST /auth/google-signin` với fake token → trả UserDto (mock Firebase).

---

## P1.T3 — Server UsersModule (Profile CRUD + Firestore Sync)

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T2

**Mô tả chi tiết**:
1. Tạo `src/modules/users/`:
   ```
   users/
   ├── users.module.ts
   ├── users.controller.ts
   ├── users.service.ts
   └── dto/
       ├── update-preferences.dto.ts  # { narratorLanguage?, showPinyin?, ttsSpeed?, hskLevel?, tutorialStep? }
       └── upload-avatar.dto.ts
   ```
2. `users.controller.ts`:
   - `GET /users/me`: Lấy `@CurrentUser()` uid → query Postgres + Firestore merge → trả UserDto.
   - `PATCH /users/preferences`: Validate body, update Firestore `users/{uid}` fields. Nếu field là `gems` hoặc `streak` → reject (chỉ server nội bộ cập nhật).
   - `POST /users/avatar` (multipart): Nhận file, validate kích thước (≤2MB) + type (image/*), resize/compress nếu cần, upload Firebase Storage `avatars/{uid}/{timestamp}.jpg`, trả `{ photoURL }`.
3. `users.service.ts`:
   - `getProfile(uid)`: Query `users_meta` + Firestore `users/{uid}` → merge thành UserDto.
   - `updatePreferences(uid, dto)`: Gọi Firestore `admin.firestore().doc('users/'+uid).update(dto)`.
   - `uploadAvatar(uid, file)`: Upload to `gs://bucket/avatars/uid/file` → get signed URL or public URL → update Firestore `photoURL`.
   - `syncToFirestore(uid, data)`: Helper để server cập nhật Firestore khi gems/streak thay đổi (dùng ở phase sau).
4. **Firestore Security Rules** (tạo file `firestore.rules`):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read: if request.auth != null && request.auth.uid == uid;
         allow write: if request.auth != null && request.auth.uid == uid
           && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['gems','currentStreak','highestStreak']);
       }
     }
   }
   ```
5. **Storage Security Rules** (tạo file `storage.rules`):
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /avatars/{uid}/{fileName} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && request.auth.uid == uid
           && request.resource.size < 2 * 1024 * 1024
           && request.resource.contentType.matches('image/.*');
       }
     }
   }
   ```

**Output kiểm chứng**:
- `GET /users/me` (auth'd) → trả đầy đủ UserDto.
- `PATCH /users/preferences` cập nhật Firestore → realtime listener thấy thay đổi.
- Upload avatar → URL trả về valid, ảnh hiển thị qua URL.

---

## P1.T4 — Client: Google Sign-In Flow + AuthStore

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T2

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   pnpm add @react-native-google-signin/google-signin
   pnpm add @react-native-firebase/app @react-native-firebase/auth
   # hoặc nếu dùng Expo:
   npx expo install expo-auth-session expo-web-browser expo-crypto
   ```
2. Tạo `src/features/auth/services/auth.service.ts`:
   ```typescript
   export const authService = {
     async signInWithGoogle(): Promise<{ idToken: string }> {
       // Configure Google Sign-In
       // Trigger sign-in flow
       // Get idToken from credential
       // Return idToken
     },
     async signOut(): Promise<void> { ... }
   };
   ```
3. Tạo `src/stores/auth.store.ts` (Zustand + persist):
   ```typescript
   interface AuthState {
     user: UserProfile | null;
     isAuthenticated: boolean;
     isLoading: boolean;
     token: string | null;
     login: () => Promise<void>;
     logout: () => Promise<void>;
     setToken: (token: string) => void;
     hydrate: () => Promise<void>;
   }
   ```
   - `login()`:
     1. Gọi `authService.signInWithGoogle()` → nhận idToken.
     2. Gọi API `POST /auth/google-signin { idToken }` → nhận UserDto.
     3. Set state: `user = userDto`, `isAuthenticated = true`, `token = idToken`.
     4. Persist token vào SecureStore/AsyncStorage.
   - `hydrate()`: Load token từ storage → validate (gọi `/users/me`) → nếu ok set state, nếu fail clear.
4. Cập nhật `src/api/client.ts` interceptor:
   - Request: lấy token từ `useAuthStore.getState().token`, inject vào header `Authorization: Bearer ${token}`.
   - Response 401: gọi `useAuthStore.getState().logout()`.
5. Tạo `src/features/auth/screens/LoginScreen.tsx`:
   - Hiển thị logo app + nút "Đăng nhập với Google".
   - Khi nhấn → gọi `authStore.login()`.
   - Loading spinner khi processing.

**Output kiểm chứng**:
- Nhấn nút đăng nhập → Google picker hiện → chọn account → về app, thấy user info.
- Kill app, mở lại → auto hydrate, không cần đăng nhập lại.
- Token sai → logout tự động.

---

## P1.T5 — Client: Profile Screen + Preferences

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T3, P1.T4

**Mô tả chi tiết**:
1. Tạo `src/features/profile/screens/ProfileScreen.tsx`:
   - Hiển thị avatar (touchable để thay đổi), displayName, email.
   - Section "Cài đặt học":
     - Dropdown `HSK Level` (HSK1-HSK6).
     - Toggle `Hiện Pinyin` (showPinyin).
     - Dropdown `Ngôn ngữ Narrator` (vi / en / zh).
     - Slider `Tốc độ TTS` (0.75 - 1.25).
   - Nút "Đăng xuất".
2. Tạo `src/features/profile/hooks/useProfile.ts`:
   - Load profile từ AuthStore.
   - `updatePreference(key, value)`: Gọi `PATCH /users/preferences` → update local state.
3. Upload avatar flow:
   - Nhấn avatar → `expo-image-picker` mở gallery/camera.
   - Crop/resize (`expo-image-manipulator`, max 512x512, quality 0.8).
   - Call `POST /users/avatar` multipart/form-data.
   - Update local `user.photoURL`.
4. Subscribe Firestore realtime:
   - Dùng `onSnapshot(doc(db, 'users', uid))` → sync gems/streak/tutorialStep realtime vào store.
   - Hoặc dùng SSE sau này (Phase 11). Tạm thời Firestore listener là đủ.

**Output kiểm chứng**:
- Thay đổi toggle showPinyin → Firestore cập nhật realtime.
- Upload ảnh → avatar mới hiển thị.
- Đăng xuất → về LoginScreen.

---

## P1.T6 — Navigation Structure (Authenticated vs Public)

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T4

**Mô tả chi tiết**:
1. Cập nhật `src/navigation/RootNavigator.tsx`:
   ```typescript
   // Nếu isAuthenticated → MainTabNavigator
   // Nếu !isAuthenticated → AuthStack (LoginScreen)
   // Nếu isLoading (hydrating) → SplashScreen
   ```
2. Tạo `src/navigation/MainTabNavigator.tsx`:
   - Bottom Tab với 4 tabs (placeholder screens):
     - 🏠 Home
     - 📖 Stories  
     - 📓 Journal
     - 👤 Profile
3. Tạo `src/navigation/types.ts`:
   - Khai báo `RootStackParamList`, `MainTabParamList` cho type-safe navigation.
4. Tạo `SplashScreen.tsx`: Logo app + activity indicator.

**Output kiểm chứng**:
- App mở → Splash → (hydrate) → nếu có session → MainTab, nếu không → LoginScreen.
- Tab bar hiển thị 4 icon, navigate giữa các tab mượt.

---

## P1.T7 — Shared Types Package (Client-Server DTO đồng bộ)

**Status**: `[x]` ✅ DONE  
**Depends on**: P1.T3

**Mô tả chi tiết**:
1. Trong `packages/shared-types/`:
   ```
   shared-types/
   ├── package.json
   ├── tsconfig.json
   └── src/
       ├── index.ts
       ├── user.ts         # UserDto, Preferences, UpdatePreferencesDto
       ├── story.ts        # (placeholder)
       ├── character.ts    # (placeholder)
       ├── chat.ts         # (placeholder)
       └── common.ts       # ErrorResponse, PaginatedResponse<T>
   ```
2. `user.ts`:
   ```typescript
   export interface UserDto {
     uid: string;
     email: string;
     displayName: string;
     photoURL: string;
     hskLevel: string;
     preferences: Preferences;
     gems: number;
     currentStreak: number;
     highestStreak: number;
     streakFreezeCount: number;
     tutorialStep: number;
   }
   export interface Preferences {
     narratorLanguage: 'vi' | 'en' | 'zh';
     showPinyin: boolean;
     ttsSpeed: number;
   }
   ```
3. `common.ts`:
   ```typescript
   export interface ErrorResponse {
     error: { code: string; message: string; details?: unknown };
   }
   export interface PaginatedResponse<T> {
     items: T[];
     nextCursor?: string;
   }
   ```
4. Cấu hình `package.json` exports để cả server và mobile import được:
   ```json
   {
     "name": "@chatai/shared-types",
     "main": "./src/index.ts",
     "types": "./src/index.ts"
   }
   ```
5. Server và Mobile `package.json` thêm dependency: `"@chatai/shared-types": "workspace:*"`.

**Output kiểm chứng**:
- Server import `import { UserDto } from '@chatai/shared-types'` — TypeScript resolve đúng.
- Mobile import tương tự — không lỗi type.

---
