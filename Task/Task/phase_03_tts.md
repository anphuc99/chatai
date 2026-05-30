# Phase 3 — TTS Service (GPT-SoVITS)

> **Mục tiêu**: Setup TTS engine, server TTS module với cache hash, cho phép test voice khi tạo character.  
> **Phụ thuộc**: Phase 0 (Storage), Phase 2 (Character voice config).

---

## P3.T1 — GPT-SoVITS Python Wrapper (tts-engine)

**Status**: `[REJECTED]` — Dùng trực tiếp `api_v2.py` của GPT-SoVITS (port 9872), không cần wrapper.  
**Depends on**: P2.T6 (Phase 2 hoàn thành)

**Mô tả chi tiết**:
1. Tạo `apps/tts-engine/`:
   ```
   tts-engine/
   ├── app.py                   # FastAPI main
   ├── requirements.txt
   ├── Dockerfile
   ├── config.py                # env vars
   └── models/                  # Mount GPT-SoVITS model weights
   ```
2. `requirements.txt`:
   ```
   fastapi==0.111.*
   uvicorn[standard]
   python-multipart
   numpy
   torch
   # GPT-SoVITS dependencies (theo repo gốc)
   ```
3. `app.py` — FastAPI endpoints:
   ```python
   @app.get("/health")
   async def health():
       return {"status": "ok", "model_loaded": model_manager.is_ready()}

   @app.post("/infer")
   async def infer(request: InferRequest):
       """
       Body:
         - text: str (文字要合成)
         - ref_audio_path: str (đường dẫn file reference audio)
         - ref_text: str (transcript của reference audio)
         - language: str = "zh"
       Returns:
         - audio bytes (wav format)
       """
       audio_bytes = await model_manager.synthesize(
           text=request.text,
           ref_audio=request.ref_audio_path,
           ref_text=request.ref_text,
           language=request.language
       )
       return Response(content=audio_bytes, media_type="audio/wav")
   ```
4. `model_manager.py`:
   - Load GPT-SoVITS model on startup.
   - Expose `is_ready()` và `synthesize()`.
   - Warmup với 1 câu test khi khởi động.
5. Đặt dataset reference audios:
   - Copy `Document/dataset_chinese/` vào `apps/tts-engine/dataset/` hoặc mount volume.
   - Mỗi folder (Achernar, Aoede...) chứa `.wav` files cho voice đó.
6. Dockerfile:
   ```dockerfile
   FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
   ```

**Output kiểm chứng**:
- `python app.py` → server start, `/health` trả model_loaded=true.
- `POST /infer` với text + ref → trả audio wav bytes, phát được.

---

## P3.T2 — Server: TtsModule — ReferenceIndexManager + CacheHash

**Status**: `[x]` ✅ DONE  
**Depends on**: P3.T1

**Mô tả chi tiết**:
1. Tạo `src/modules/tts/`:
   ```
   tts/
   ├── tts.module.ts
   ├── tts.controller.ts
   ├── tts.service.ts
   ├── reference-index.manager.ts
   ├── gptsovits.client.ts
   ├── ffmpeg.service.ts
   └── dto/
       ├── synthesize.dto.ts       # { text, voiceName, emotion?, intensity?, pitch? }
       └── test-voice.dto.ts       # { voiceName, pitch, sampleText? }
   ```
2. `reference-index.manager.ts`:
   - Load `reference_index.json` on module init.
   - Cấu trúc JSON: `{ "Achernar": { "Happy": { "high": ["file1.wav",...], "medium": [...] } } }`
   - Method `pickRandom(voiceName, emotion, intensity)`:
     - Lookup `index[voiceName][emotion][intensity]`.
     - Random pick 1 file path.
     - Fallback: nếu không có emotion/intensity → fallback `Neutral/medium`.
     - Return `{ refAudioPath, refText }` (refText lấy từ filename hoặc companion .txt).
3. `tts.service.ts`:
   - `synthesize(text, voiceName, emotion, intensity, pitch)`:
     1. Gọi `referenceIndexManager.pickRandom(voiceName, emotion, intensity)` → `{ refAudioPath, refText }`.
     2. Tính `cacheHash = MD5(voiceName + refAudioPath + text)`.
     3. Check Firebase Storage `tts_audio/{cacheHash}.wav` exists (HEAD request).
     4. **Nếu cached**: Trả signed URL.
     5. **Nếu miss**:
        a. Acquire Redis lock `tts:lock:{cacheHash}` (TTL 60s) — tránh duplicate infer.
        b. Gọi `gptsovitsClient.infer(text, refAudioPath, refText)` → raw audio buffer.
        c. Nếu `pitch ≠ 1.0`: gọi `ffmpegService.adjustPitch(buffer, pitch)`.
        d. Upload buffer → Firebase Storage `tts_audio/{cacheHash}.wav`.
        e. Release lock.
        f. Trả signed URL.
   - `testVoice(voiceName, pitch, sampleText?)`:
     - sampleText mặc định: "你好，很高兴认识你".
     - Gọi synthesize với emotion=Neutral, intensity=medium.
4. `gptsovits.client.ts`:
   - HTTP client gọi `POST http://{TTS_ENGINE_URL}/infer`.
   - Timeout 30s.
   - Retry 1 lần nếu timeout.
5. `ffmpeg.service.ts`:
   - Dùng `fluent-ffmpeg` hoặc spawn `ffmpeg` process.
   - `adjustPitch(buffer: Buffer, pitch: number): Promise<Buffer>`.
   - Command: `ffmpeg -i pipe:0 -af "asetrate=44100*{pitch},aresample=44100" -f wav pipe:1`.

**Output kiểm chứng**:
- Gọi synthesize 2 lần cùng params → lần 2 trả cached URL, không gọi GPT-SoVITS.
- Pitch 1.2 vs 1.0 → audio nghe khác nhau.

---

## P3.T3 — Server: TTS Controller Endpoints

**Status**: `[x]` ✅ DONE  
**Depends on**: P3.T2

**Mô tả chi tiết**:
1. `tts.controller.ts`:
   ```typescript
   @Controller('tts')
   export class TtsController {
     @Post('synthesize')
     async synthesize(@Body() dto: SynthesizeDto, @CurrentUser() user) {
       // Rate limit: max 30 requests/min per user
       const result = await this.ttsService.synthesize(
         dto.text, dto.voiceName, dto.emotion, dto.intensity, dto.pitch
       );
       return { audioUrl: result.url, cached: result.fromCache };
     }

     @Post('test-voice')
     async testVoice(@Body() dto: TestVoiceDto) {
       const result = await this.ttsService.testVoice(
         dto.voiceName, dto.pitch, dto.sampleText
       );
       return { audioUrl: result.url };
     }
   }
   ```
2. `synthesize.dto.ts`:
   ```typescript
   export class SynthesizeDto {
     @IsString() @MaxLength(500) text: string;
     @IsEnum(VOICE_NAMES) voiceName: string;
     @IsOptional() @IsEnum(EMOTIONS) emotion?: string;
     @IsOptional() @IsEnum(INTENSITIES) intensity?: string;
     @IsOptional() @IsNumber() @Min(0.8) @Max(1.5) pitch?: number;
   }
   ```
3. Thêm rate limiting:
   - Cài `@nestjs/throttler` hoặc custom Redis-based.
   - TTS endpoints: 30 req/min per user.
4. Error handling:
   - GPT-SoVITS down → `503 TTS_ENGINE_DOWN`.
   - voiceName không có ref → `404 REFERENCE_NOT_FOUND`.

**Output kiểm chứng**:
- `POST /tts/synthesize` → trả `{ audioUrl, cached }`.
- `POST /tts/test-voice` → trả URL audio test.
- Gọi quá 30 lần/phút → 429.

---

## P3.T4 — Client: TtsService + Wire "Nghe thử" ở CharacterEditor

**Status**: `[x]` ✅ DONE  
**Depends on**: P3.T3, P2.T5

**Mô tả chi tiết**:
1. Tạo `src/features/character/services/tts.service.ts`:
   ```typescript
   export const ttsClientService = {
     async testVoice(voiceName: string, pitch: number, sampleText?: string): Promise<string> {
       const res = await apiClient.post('/tts/test-voice', { voiceName, pitch, sampleText });
       return res.data.audioUrl;
     },
     async playUrl(url: string): Promise<void> {
       // Dùng expo-av Audio.Sound
       const { sound } = await Audio.Sound.createAsync({ uri: url });
       await sound.playAsync();
       // Auto unload sau khi phát xong
       sound.setOnPlaybackStatusUpdate(status => {
         if (status.didJustFinish) sound.unloadAsync();
       });
     }
   };
   ```
2. Cập nhật `CharacterEditorScreen.tsx`:
   - Enable nút "Nghe thử giọng".
   - Khi nhấn: loading state → gọi `ttsClientService.testVoice(selectedVoice, pitch)` → play URL.
   - Disable nút khi đang phát.
3. Cài `expo-av`:
   ```bash
   npx expo install expo-av
   ```
4. Xử lý error: nếu TTS down → Toast "Hệ thống TTS đang bảo trì".

**Output kiểm chứng**:
- Chọn voice + pitch → nhấn "Nghe thử" → nghe được audio.
- Đổi voice/pitch → audio khác.

---

## P3.T5 — Firebase Storage Rules cho TTS Audio

**Status**: `[x]` ✅ DONE  
**Depends on**: P3.T2

**Mô tả chi tiết**:
1. Cập nhật `storage.rules` thêm rule cho TTS audio:
   ```
   match /tts_audio/{fileName} {
     // Chỉ server (Admin SDK) mới write
     // Client có thể read (signed URL từ server)
     allow read: if request.auth != null;
     allow write: if false; // Admin SDK bypass rules
   }
   ```
2. Deploy rules: `firebase deploy --only storage`.
3. Verify: client với auth token có thể GET audio URL, nhưng không thể upload trực tiếp.

**Output kiểm chứng**:
- Audio URL từ server → client fetch được (có auth).
- Client cố upload vào `tts_audio/` → bị deny.

---
