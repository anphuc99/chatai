# Thiết kế Kỹ thuật: Module Tài khoản (Account & Authentication)

Tài liệu này mô tả chi tiết luồng hoạt động, cấu trúc dữ liệu và các sơ đồ thiết kế cho tính năng Quản lý Tài khoản trong ứng dụng. Hệ thống sử dụng **Google Sign-In** thông qua **Firebase Authentication** làm phương thức xác thực duy nhất để đảm bảo tính tiện lợi và bảo mật.

---

## 1. Sơ đồ Luồng Dữ liệu (Data Flow Diagram - DFD)

Sơ đồ mô tả đường đi của dữ liệu từ khi người dùng bấm nút đăng nhập cho đến khi thông tin tài khoản được lưu vào cơ sở dữ liệu.

```mermaid
flowchart LR
    User(["Người dùng"])
    App["React Native App<br/>(Zustand State)"]
    Google["Google OAuth Service"]
    FirebaseAuth["Firebase Authentication"]
    Firestore[("Cloud Firestore<br/>(users collection)")]

    User -- "1. Bấm 'Đăng nhập với Google'" --> App
    App -- "2. Yêu cầu cấp quyền" --> Google
    Google -- "3. Trả về Google Credential" --> App
    App -- "4. Xác thực Credential" --> FirebaseAuth
    FirebaseAuth -- "5. Trả về User Info (uid, email, photo)" --> App
    App -- "6. Đồng bộ / Khởi tạo Profile" --> Firestore
    Firestore -- "7. Trả về Data User (gems, streak)" --> App
    App -- "8. Cập nhật UI & Vào Home" --> User
```

---

## 2. Sơ đồ Hoạt động (Activity Diagram)

Mô tả rẽ nhánh logic khi xử lý đăng nhập, đặc biệt là việc phân biệt giữa người dùng mới (lần đầu đăng nhập) và người dùng cũ.

```mermaid
flowchart TD
    Start(["Mở Ứng dụng"]) --> CheckLocal{"Đã có Session<br/>đăng nhập cục bộ?"}
    
    CheckLocal -- "Có" --> GoToHome(["Chuyển vào Màn hình Home"])
    CheckLocal -- "Không" --> ShowLogin["Hiển thị Màn hình Login"]
    
    ShowLogin --> ClickLogin["Người dùng bấm 'Login with Google'"]
    ClickLogin --> CallGoogle["Gọi Google Sign-In SDK"]
    CallGoogle --> GetToken{"Lấy Token<br/>thành công?"}
    
    GetToken -- "Thất bại/Hủy" --> ShowError["Hiển thị thông báo lỗi"] --> ShowLogin
    GetToken -- "Thành công" --> AuthFirebase["Gửi Token lên Firebase Auth"]
    
    AuthFirebase --> FirebaseSuccess{"Xác thực Firebase<br/>thành công?"}
    FirebaseSuccess -- "Lỗi" --> ShowError
    FirebaseSuccess -- "Thành công" --> CheckFirestore["Kiểm tra Document UID trong Firestore"]
    
    CheckFirestore --> CheckNewUser{"User đã tồn tại?"}
    
    CheckNewUser -- "Chưa tồn tại (New)" --> CreateDoc["Tạo Document mới: <br/>{email, name, gems: 0, streak: 0}"]
    CheckNewUser -- "Đã tồn tại (Old)" --> UpdateLogin["Cập nhật trường last_login"]
    
    CreateDoc --> SaveLocalState
    UpdateLogin --> SaveLocalState
    
    SaveLocalState["Lưu thông tin User vào Zustand (State) & Async Storage"] --> GoToHome
```

---

## 3. Sơ đồ Tuần tự (Sequence Diagram)

Mô tả chi tiết quá trình giao tiếp giữa các thành phần phần mềm theo thời gian thực.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as RN App (UI + Logic)
    participant Google as Google Provider
    participant Auth as Firebase Auth
    participant DB as Cloud Firestore

    User->>App: Bấm nút Đăng nhập Google
    App->>Google: signIn()
    
    alt Người dùng từ chối cấp quyền
        Google-->>App: Trả về lỗi hủy (Canceled)
        App-->>User: Hiện thông báo "Đăng nhập bị hủy"
    else Cấp quyền thành công
        Google-->>App: Trả về idToken & accessToken
        App->>Auth: signInWithCredential(credential)
        Auth-->>App: Trả về đối tượng User (uid, email, displayName, photoURL)
        
        Note over App, DB: Đồng bộ dữ liệu Profile
        App->>DB: GET /users/{uid}
        
        alt Document chưa tồn tại
            DB-->>App: Không tìm thấy (Not Found)
            App->>DB: POST /users/{uid} (Tạo mới kèm gems = 0, streak = 0)
            DB-->>App: Xác nhận tạo thành công
        else Document đã tồn tại
            DB-->>App: Trả về dữ liệu (gems, level, streak, ...)
            App->>DB: PATCH /users/{uid} (Cập nhật last_login)
        end
        
        App->>App: Lưu trạng thái đăng nhập vào Zustand & AsyncStorage
        App-->>User: Đổi giao diện sang màn hình chính (Home)
    end
```

---

## 4. Sơ đồ Lớp (UML Class Diagram)

Sơ đồ mô tả cấu trúc của một đối tượng User khi được lưu trữ trên Firestore và các Service quản lý trạng thái tài khoản trong ứng dụng.

```mermaid
classDiagram
    class UserProfile {
        +String uid
        +String email
        +String displayName
        +String photoURL
        +Integer gems
        +Integer currentStreak
        +Integer highestStreak
        +String hskLevel
        +Date createdAt
        +Date lastLogin
    }
    
    class AppState {
        -UserProfile currentUser
        -Boolean isAuthenticated
        -Boolean isLoading
        +loginWithGoogle() Promise
        +logout() void
        +updateGems(amount: Integer) void
        +updateStreak() void
    }
    
    class FirebaseAuthService {
        +signInWithCredential(token) UserCredential
        +signOut() void
        +getCurrentUser() FirebaseUser
    }
    
    class FirestoreUserService {
        +getUserProfile(uid: String) UserProfile
        +createUserProfile(uid: String, data: UserProfile) void
        +updateLastLogin(uid: String) void
    }
    
    %% Quan hệ giữa các thành phần
    AppState "1" *-- "1" UserProfile : "Quản lý"
    AppState --> FirebaseAuthService : "Sử dụng để xác thực"
    AppState --> FirestoreUserService : "Sử dụng để đồng bộ DB"
```
