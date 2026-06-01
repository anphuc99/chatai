---
date: 2026-06-01
---
# Thiết kế Kỹ thuật: Hệ thống Text-to-Speech (GPT-SoVITS)

Tài liệu này mô tả chi tiết kiến trúc và luồng hoạt động của hệ thống Text-to-Speech (TTS) dựa trên nền tảng **GPT-SoVITS**. Hệ thống sử dụng cơ chế "Mồi cảm xúc" (Reference Audio) lấy từ bộ dữ liệu đã được phân loại theo 12 cảm xúc và mức độ (Intensity) để tạo ra giọng nói sinh động, tự nhiên nhất.

---

## 1. Cơ chế "Mồi Cảm Xúc" (Emotion Prompting)

Mô hình GPT-SoVITS hoạt động tốt nhất khi được cung cấp một file âm thanh mẫu (Reference Audio) cùng văn bản tương ứng (Reference Text) để bắt chước tông giọng, nhịp điệu và cảm xúc.

- **Dữ liệu nguồn:** Danh sách các mồi cảm xúc được lưu trong file `dataset_chinese/reference_index.json`.
- **Cấu trúc dữ liệu:** Mỗi bản ghi trong JSON chứa `voice` (tên nhân vật), `emotion` (12 loại cảm xúc), `intensity` (mức độ: low, medium, high), `text` (văn bản mẫu), và `file` (tên file `.wav` mẫu).
- **Quy trình chọn mồi:** Khi Server nhận được yêu cầu phát âm một đoạn `text` với `emotion` và `intensity` cụ thể, nó sẽ lọc trong `reference_index.json` tất cả các audio của nhân vật đó khớp với `emotion` và `intensity`. Sau đó, **chọn ngẫu nhiên một audio** để làm mồi cảm xúc. Điều này giúp giọng nói của nhân vật không bị rập khuôn ngay cả khi nói cùng một biểu cảm nhiều lần.
- **Quy trình chọn Model:** Hệ thống sẽ tự động chỉ định mô hình đã được huấn luyện với số epoch cao nhất (ví dụ: `<voicename>-e15`) để gửi cho GPT-SoVITS xử lý.

---

## 2. Sơ đồ Luồng dữ liệu (Data Flow Diagram - DFD)

Sơ đồ này mô tả đường đi của dữ liệu từ Client cho đến khi nhận được file âm thanh hoàn chỉnh từ Engine GPT-SoVITS.

```mermaid
flowchart LR
    Client["React Native App / Modules"]
    Backend["Backend Server / TTS Service"]
    RefJSON[("reference_index.json")]
    FileStore[("Audio Mẫu<br/>dataset_chinese")]
    CacheStore[("Firebase Storage<br/>(TTS Cache)")]
    GPTAPI["GPT-SoVITS Engine"]
    
    Client -- "1. Gửi request (text, voice, emotion, pitch)" --> Backend
    Backend -- "2. Tìm mồi cảm xúc" --> RefJSON
    Backend -- "3. Tính Hash & Kiểm tra" --> CacheStore
    CacheStore -- "4. (Hit) Lấy file Audio gốc" --> Backend
    Backend -- "5. (Miss) Đọc file mẫu" --> FileStore
    Backend -- "6. Gửi Payload sinh TTS" --> GPTAPI
    GPTAPI -- "7. Trả Buffer Audio gốc" --> Backend
    Backend -- "8. Upload file gốc" --> CacheStore
    Backend -- "9. FFmpeg điều chỉnh Pitch" --> Backend
    Backend -- "10. Trả Audio (Stream/Buffer)" --> Client
```

---

## 3. Sơ đồ Hoạt động (Activity Diagram)

Sơ đồ này mô tả logic rẽ nhánh bên trong Backend khi xử lý một Request TTS.

```mermaid
flowchart TD
    Start(["Bắt đầu Request TTS"]) --> ReceiveReq["Nhận tham số: text, voiceName, emotion, intensity, pitch"]
    ReceiveReq --> QueryIndex["Đọc file reference_index.json"]
    
    QueryIndex --> Filter["Lọc danh sách theo voiceName + emotion + intensity"]
    Filter --> CheckExist{"Danh sách lọc<br/>có kết quả?"}
    
    CheckExist -- "Có" --> PickRandom["Chọn ngẫu nhiên 1 Audio Mẫu (Reference)"]
    CheckExist -- "Không (Fallback)" --> Fallback["Lấy Audio Mẫu với cảm xúc 'neutral' hoặc bỏ qua intensity"] --> PickRandom
    
    PickRandom --> CalcHash["Tạo mã Hash: MD5(voiceName + ref_file + text)"]
    CalcHash --> CheckCache{"Kiểm tra Hash<br/>trên Firebase Store?"}
    
    CheckCache -- "Có (Cache Hit)" --> ReturnCache["Tải Buffer Audio gốc từ Firebase"] --> ProcessPitch
    
    CheckCache -- "Không (Cache Miss)" --> GetModel["Xác định Model Weights: <voiceName>-e15"]
    GetModel --> CallGPT["Gửi Request tới GPT-SoVITS API: <br/>text, ref_audio, ref_text, model"]
    
    CallGPT --> ProcessTTS["GPT-SoVITS tiến hành Inference sinh âm thanh gốc"]
    ProcessTTS --> Validate{"Audio sinh ra<br/>thành công?"}
    
    Validate -- "Thành công" --> UploadCache["Lưu Audio gốc lên Firebase Store"]
    Validate -- "Thất bại" --> ReturnError["Trả về thông báo lỗi TTS"]
    
    UploadCache --> ReturnAudio["Lấy Buffer Audio gốc"] --> ProcessPitch
    
    ProcessPitch["Sử dụng FFmpeg điều chỉnh Pitch"] --> SendClient["Trả Stream Audio đã xử lý cho Client"] --> End(["Kết thúc"])
    ReturnError --> End
```

---

## 4. Sơ đồ Tuần tự (Sequence Diagram)

Sơ đồ tuần tự mô tả các bước tương tác chi tiết giữa các hệ thống theo thứ tự thời gian.

```mermaid
sequenceDiagram
    autonumber
    participant App as Client / Calling Module
    participant Server as TTS API Server
    participant RefDB as Reference JSON & FS
    participant Cache as Firebase Storage
    participant GPT as GPT-SoVITS Engine

    App->>Server: POST /api/tts {text, voiceName, emotion, intensity, pitch}
    
    %% Tìm mồi cảm xúc
    Note over Server, RefDB: Bước 1: Tìm Mồi cảm xúc (Reference)
    Server->>RefDB: Query index (voice=voiceName, emotion=emotion, intensity=intensity)
    RefDB-->>Server: Trả về Array[] các Audio thỏa mãn
    Server->>Server: Chọn ngẫu nhiên 1 phần tử (ref_text, ref_file)
    
    %% Kiểm tra Cache
    Note over Server, Cache: Bước 2: Kiểm tra Cache TTS gốc trên Firebase
    Server->>Server: Tạo Hash = MD5(voiceName + ref_file + text)
    Server->>Cache: Kiểm tra file /tts_audio/{Hash}.wav
    
    alt Cache Hit (Đã tồn tại)
        Cache-->>Server: Tải Buffer file Audio gốc về RAM
    else Cache Miss (Chưa tồn tại)
        %% Nạp file mẫu
        Server->>RefDB: Đọc file vật lý (ref_file)
        RefDB-->>Server: Trả về Audio Buffer
        
        %% Chọn Model và Inference
        Note over Server, GPT: Bước 3: Gọi GPT-SoVITS Inference
        Server->>Server: Gán model_name = voiceName + "-e15"
        Server->>GPT: POST /inference {text, ref_text, ref_audio_buffer, model_name}
        
        Note over GPT: AI sinh âm thanh gốc (chưa chỉnh pitch)...
        GPT-->>Server: Trả về Buffer âm thanh gốc
        
        %% Lưu Cache
        Note over Server, Cache: Bước 4: Lưu Cache gốc lên Firebase
        Server->>Cache: Upload Buffer âm thanh gốc lên Store
    end
    
    %% Xử lý Pitch & Phản hồi
    Note over Server, App: Bước 5: FFmpeg Xử lý Pitch & Phản hồi
    Server->>Server: Sử dụng FFmpeg điều chỉnh Pitch của Audio gốc
    Server-->>App: Trả về Audio Stream đã chỉnh Pitch (200 OK)
    App->>App: Phát âm thanh qua Loa
```

---

## 5. Sơ đồ Lớp UML (Class Diagram)

Sơ đồ lớp mô tả cấu trúc dữ liệu và các đối tượng nội bộ của Backend quản lý luồng TTS.

```mermaid
classDiagram
    class TTSRequest {
        +String text
        +String voiceName
        +String emotion
        +String intensity
        +Float pitch
    }
    
    class ReferenceAudio {
        +String voice
        +String emotion
        +String intensity
        +String text
        +String file
    }
    
    class ReferenceIndexManager {
        -List~ReferenceAudio~ indexData
        +loadIndex(filePath) void
        +getRandomReference(voice: String, emotion: String, intensity: String) ReferenceAudio
        -getFallbackReference(voice: String) ReferenceAudio
    }
    
    class GPTSoVITSEngine {
        +String apiEndpoint
        +generateAudio(text: String, refText: String, refAudioPath: String, modelName: String) Buffer
    }
    
    class TTSService {
        -ReferenceIndexManager refManager
        -GPTSoVITSEngine engine
        +processTTS(request: TTSRequest) Buffer
        -resolveModelName(voiceName: String) String
        -applyPitchWithFFmpeg(audio: Buffer, pitch: Float) Buffer
    }
    
    %% Relationships
    TTSService --> ReferenceIndexManager : "Sử dụng"
    TTSService --> GPTSoVITSEngine : "Gọi API"
    ReferenceIndexManager "1" *-- "*" ReferenceAudio : "Quản lý danh sách"
```
