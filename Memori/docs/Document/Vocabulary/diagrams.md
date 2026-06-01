---
date: 2026-06-01
---
# Tổng hợp Sơ đồ Hệ thống: Ôn tập Từ vựng (Vocabulary Review)

Tài liệu này cung cấp các sơ đồ trực quan mô tả luồng hoạt động, luồng dữ liệu và thiết kế hệ thống cho tính năng **Story-based Vocabulary Review** (bao gồm cơ chế Super Sentence và Hardcore SRS Schedule).

---

## 1. Sơ đồ Luồng Dữ liệu (Data Flow Diagram)

Sơ đồ này mô tả cách dữ liệu từ vựng được lấy từ Database, đưa vào Hàng đợi (Queue), gửi lên AI và xử lý phần bù (những từ AI quên dùng), sau cùng là lưu trạng thái vào DB và xóa cache.

```mermaid
flowchart TD
    %% Khởi tạo
    DB[("Database<br>User_Vocabulary")] -->|"1. Query từ vựng đến hạn"| InitQueue["Khởi tạo Hàng đợi Động<br>(Dynamic Word Queue)"]
    InitQueue --> ClientState["Client State<br>(Danh sách các từ cần ôn)"]

    %% Vòng lặp chat
    ClientState -->|"2. Lấy N từ (Tùy thuật toán độ dài)"| PromptGen("Tạo Prompt<br>(Kèm N từ vựng)")
    
    PromptGen --> AI("LLM (Ollama API)")
    AI -->|"3. Trả về Story & used_words (JSON)"| ClientFilter{"Kiểm duyệt<br>(Strict Verification)"}

    %% Xử lý kết quả trả về
    ClientFilter -->|"4a. Các từ đã dùng thành công"| RemoveFromQueue("Loại khỏi Hàng đợi")
    ClientFilter -->|"4b. Các từ AI quên dùng"| PushBack("Trả lại vào Hàng đợi cho lượt sau")
    PushBack --> ClientState

    %% Lưu Cache
    AI -->|"5. Ghi lịch sử lượt chat"| Cache[("Local Cache<br>(vocab_session.jsonl)")]
    
    %% Quản lý tràn Token
    Cache --> CheckToken{"Vượt ngưỡng Token?"}
    CheckToken -->|Có| SmallAI("Small AI Tóm tắt lịch sử")
    SmallAI --> WriteCheckpoint("Ghi Checkpoint vào .jsonl")
    WriteCheckpoint --> ClientState
    CheckToken -->|Không| ClientState

    %% Kết thúc phiên
    RemoveFromQueue --> CheckEmpty{"Hàng đợi rỗng?"}
    CheckEmpty -->|"Chưa rỗng"| ClientState
    CheckEmpty -->|"Đã rỗng"| EndSession("Sự kiện: Hoàn thành Phiên Ôn tập")

    EndSession --> UpdateDB("Tính toán & Cập nhật<br>step_index, next_review_date")
    UpdateDB --> DB
    EndSession --> CleanCache("XÓA file vocab_session.jsonl")
```

---

## 2. Sơ đồ Tuần tự (Sequence Diagram) - Trải nghiệm Người dùng

Sơ đồ này mô tả chi tiết tương tác giữa Người dùng, Giao diện, Backend và API khi chơi Story Review, đặc biệt là cơ chế Bóng đèn (Hint) và giải đố xếp hình.

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as Client UI
    participant Hint as Hint System (Puzzle Mode)
    participant Cache as Local .jsonl Cache
    participant API as LLM (Ollama API)

    %% Bắt đầu phiên
    User->>UI: Bấm "Ôn tập Từ vựng"
    UI->>API: Gửi Prompt bắt đầu câu chuyện + [Mẻ từ vựng 1]
    API-->>UI: Trả về JSON: Lời dẫn (Narrator) + Câu cần dịch + used_words
    UI->>Cache: Append dòng JSON (Lịch sử)
    UI->>User: Hiển thị lời dẫn & Yêu cầu dịch câu tiếng Việt sang tiếng Trung

    %% Cơ chế Bóng đèn
    rect rgb(240, 248, 255)
        UI->>UI: Kích hoạt đếm ngược 10 giây
        Note over User, UI: ... 10s trôi qua, User chưa gõ xong ...
        UI->>User: Hiển thị Icon Bóng đèn 💡 rung lắc
        User->>UI: Bấm vào 💡
        UI->>Hint: Kích hoạt Puzzle Mode
        Hint-->>User: Đổ ra 10-20 thẻ từ vựng tiếng Trung bị xáo trộn
    end

    %% Ghép câu và hoàn thành
    User->>UI: Sắp xếp các thẻ / Gõ lại câu hoàn chỉnh
    UI->>UI: Kiểm tra tính chính xác của câu
    UI->>User: Báo đúng (Effect 🎉)
    
    %% Gọi mẻ tiếp theo
    UI->>API: Gửi câu trả lời của User + Prompt tiếp tục câu chuyện + [Mẻ từ vựng 2]
    API-->>UI: Trả về kịch bản tiếp theo
    UI->>Cache: Append dòng JSON (Lịch sử)
```

---

## 3. Sơ đồ Hoạt động (Activity Diagram) - Thuật toán Hardcore SRS

Sơ đồ diễn tả quá trình xử lý ngầm khi hệ thống cập nhật chỉ số của từ vựng sau một phiên ôn tập dựa trên mảng `SRS_SCHEDULE` cực đoan.

```mermaid
stateDiagram-v2
    [*] --> StartUpdate : Session Kết thúc (Hàng đợi rỗng)
    
    state StartUpdate {
        [*] --> FetchWords : Lấy danh sách từ vựng vừa ôn
        FetchWords --> LoopWords : Lặp từng từ
    }

    state LoopWords {
        [*] --> GetCurrentStep : Lấy step_index hiện tại
        GetCurrentStep --> CalcNextDate : Lấy số ngày nghỉ từ SRS_SCHEDULE[step_index]
        CalcNextDate --> UpdateDate : next_review_date = current_date + days_to_wait
        UpdateDate --> IncreaseStep : step_index += 1
        
        IncreaseStep --> CheckMastery : step_index >= 26 (Chiều dài mảng) ?
        CheckMastery -->|Yes| SetMastered : status = 'mastered'
        CheckMastery -->|No| SaveDB : Lưu DB (Giữ status 'learning')
    }

    LoopWords --> EndUpdate : Hoàn tất duyệt danh sách
    EndUpdate --> [*]
```

---

## 4. Biểu đồ Lớp (UML Class Diagram) - Cấu trúc Dữ liệu

Sơ đồ mô tả các thực thể dữ liệu chính tham gia vào tiến trình Ôn tập.

```mermaid
classDiagram
    class User_Vocabulary {
        +String word_id
        +String hz (Chữ Hán)
        +String py (Pinyin)
        +String vn (Nghĩa tiếng Việt)
        +String source_sentence (Câu ngữ cảnh gốc)
        +String status ("learning" | "mastered")
        +Int step_index (Chỉ số trong mảng SRS)
        +Long next_review_date (Timestamp)
    }

    class Vocab_Session {
        +List~Word~ dynamic_queue
        +List~Word~ success_words
        +Int total_tokens
        +String cache_file_path ("vocab_session.jsonl")
    }

    class LLM_Payload {
        +String system_prompt
        +String summary_checkpoint
        +List~History~ recent_5_turns
        +List~Word~ requested_words_batch
    }

    class LLM_Response {
        +String narrator_text
        +String target_translation
        +List~String~ used_words
        +List~String~ scrambled_cards
    }

    Vocab_Session "1" *-- "many" User_Vocabulary : Quản lý Hàng đợi
    Vocab_Session --> LLM_Payload : Tạo Payload gửi AI
    LLM_Response --> Vocab_Session : Trả kết quả để Verify
```
