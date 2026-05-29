# P03.T5 — Firebase Storage Rules cho TTS Audio

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P03.T5 |
| Phase | 3 |
| Depends on | P03.T2 |
| Complexity | Low |
| Risk | Low |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- Update `storage.rules` thêm path `tts_audio/{fileName}`: allow read mọi authenticated user (public-ish via auth), block write từ client.
- Deploy.

---

## 3. FILES CẦN SỬA

| # | Path |
|---|------|
| 1 | `storage.rules` |

---

## 4. RULE CONTENT (final)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Avatars: user A → mình A
    match /avatars/{uid}/{file=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 2 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    // Character avatars: chỉ server upload (Admin SDK bypass)
    match /characters/{charId}/{file=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // TTS audio: cache server-side; client chỉ read
    match /tts_audio/{file=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

---

## 5. ACCEPTANCE & TEST PLAN

### Acceptance
- [ ] Deploy: `firebase deploy --only storage` thành công.
- [ ] Client (auth) GET URL `tts_audio/<hash>.wav` → 200 audio.
- [ ] Client (auth) cố PUT vào `tts_audio/...` → 403.
- [ ] Client (no auth) GET → 401/403.

### Tests (manual via emulator)
1. `firebase emulators:start --only storage`
2. Mock auth → đọc file OK.
3. Mock auth → upload bị deny.

Không có code mới, chỉ infra.
