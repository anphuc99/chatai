# 12 — Hướng dẫn Setup Môi trường Dev (Local)

> Hướng dẫn từng bước để chạy toàn bộ hệ thống trên **máy cá nhân** (Windows).  
> GPU local cho Ollama + GPT-SoVITS. Docker cho Postgres + Redis + ChromaDB.  
> Mục tiêu: `pnpm dev` → tất cả services running, sẵn sàng code.

---

## 0. Yêu cầu Phần cứng & Phần mềm

### Phần cứng tối thiểu

| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|-----------|-------------|
| GPU | NVIDIA 8GB VRAM (RTX 3060) | 12-24GB VRAM (RTX 3090/4090) |
| RAM | 16GB | 32GB |
| Disk | 50GB trống | 100GB SSD |
| CPU | 4 cores | 8+ cores |

### Phần mềm cần cài

| Tool | Version | Link |
|------|---------|------|
| **Node.js** | 20 LTS | https://nodejs.org/ |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop/ |
| **Git** | Latest | https://git-scm.com/ |
| **VS Code** | Latest | https://code.visualstudio.com/ |
| **Ollama** | Latest | https://ollama.ai/ |
| **Python** | 3.10+ | https://www.python.org/ (cho GPT-SoVITS) |
| **FFmpeg** | Latest | https://ffmpeg.org/download.html |
| **CUDA Toolkit** | 11.8+ hoặc 12.x | https://developer.nvidia.com/cuda-toolkit |

---

## 1. Cài đặt từng bước

### Bước 1: Clone repo & install dependencies

```powershell
# Clone project
git clone https://github.com/<your-username>/chatAI.git
cd chatAI

# Install Node dependencies
pnpm install
```

### Bước 2: Docker services (Postgres + Redis + ChromaDB)

Tạo file `docker-compose.dev.yml` ở root:

```yaml
# docker-compose.dev.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: chatai-postgres
    environment:
      POSTGRES_DB: chatai_dev
      POSTGRES_USER: chatai
      POSTGRES_PASSWORD: chatai_dev_123
    ports:
      - "5432:5432"
    volumes:
      - pg_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatai"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: chatai-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

  chromadb:
    image: chromadb/chroma:latest
    container_name: chatai-chromadb
    ports:
      - "8000:8000"
    volumes:
      - chroma_dev_data:/chroma/chroma
    environment:
      - ANONYMIZED_TELEMETRY=FALSE
      - IS_PERSISTENT=TRUE

volumes:
  pg_dev_data:
  redis_dev_data:
  chroma_dev_data:
```

Chạy Docker:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Verify:

```powershell
# Kiểm tra containers running
docker ps

# Test Postgres connection
docker exec chatai-postgres pg_isready -U chatai
# -> /var/run/postgresql:5432 - accepting connections

# Test Redis
docker exec chatai-redis redis-cli ping
# -> PONG

# Test ChromaDB
curl http://localhost:8000/api/v1/heartbeat
# -> {"nanosecond heartbeat": ...}
```

### Bước 3: Ollama (Local LLM)

```powershell
# Cài Ollama (nếu chưa) - download từ https://ollama.ai
# Sau khi cài, Ollama chạy tự động ở http://localhost:11434

# Pull models (cần ~15-20GB disk)
ollama pull qwen2.5:14b        # Large AI - chính cho chat (~9GB)
ollama pull qwen2.5:3b         # Small AI - summarize (~2GB)
ollama pull bge-m3             # Embedding model (~2GB)

# Verify
ollama list
# NAME              SIZE
# qwen2.5:14b      9.0 GB
# qwen2.5:3b       2.0 GB
# bge-m3           1.2 GB

# Test LLM
ollama run qwen2.5:3b "Trả lời bằng JSON: {\"test\": true}"
# Ctrl+D để thoát
```

> **Lưu ý VRAM:**
> - `qwen2.5:14b` cần ~10GB VRAM khi inference
> - `qwen2.5:3b` cần ~3GB VRAM
> - Nếu chỉ có 8GB VRAM: dùng `qwen2.5:7b` thay `14b` cho dev
> - 2 model KHÔNG chạy đồng thời — Ollama tự load/unload

### Bước 4: GPT-SoVITS (Local TTS)

```powershell
# Clone GPT-SoVITS vào thư mục riêng (KHÔNG trong monorepo)
cd C:\Dev
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS

# Tạo virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install fastapi uvicorn

# Download pretrained models (theo hướng dẫn GPT-SoVITS)
# Copy models đã train vào ./pretrained_models/

# Copy dataset reference audio
# Copy thư mục dataset_chinese từ Document vào GPT-SoVITS
xcopy /E /I "C:\path\to\chatAI\Document\dataset_chinese" "C:\Dev\GPT-SoVITS\dataset_chinese"
```

Tạo file wrapper API `C:\Dev\GPT-SoVITS\api_server.py`:

```python
"""
Minimal FastAPI wrapper for GPT-SoVITS inference.
Dev-only: single-threaded, no caching.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI()

class TTSRequest(BaseModel):
    text: str
    ref_audio_path: str
    ref_text: str
    model_name: str = "default"

class HealthResponse(BaseModel):
    status: str = "ok"

@app.get("/health")
def health():
    return HealthResponse()

@app.post("/inference")
async def inference(req: TTSRequest):
    # TODO: Integrate actual GPT-SoVITS inference
    # For dev, return a dummy response or call the real model
    try:
        # Real implementation will be:
        # audio_buffer = run_inference(req.text, req.ref_audio_path, ...)
        # return Response(content=audio_buffer, media_type="audio/wav")
        return {"status": "ok", "message": "TTS inference placeholder"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
```

Chạy TTS server:

```powershell
cd C:\Dev\GPT-SoVITS
.\venv\Scripts\activate
python api_server.py
# -> Uvicorn running on http://0.0.0.0:5000
```

### Bước 5: Firebase Project Setup

1. Truy cập https://console.firebase.google.com/
2. Tạo project mới: `chatai-dev`
3. Bật **Authentication** → Sign-in method → Google → Enable
4. Tạo **Firestore Database** (Start in test mode cho dev)
5. Bật **Storage** (Start in test mode)
6. Vào Project Settings → Service Accounts → Generate new private key
7. Save file JSON → `apps/server/firebase-sa-dev.json` (KHÔNG commit vào git!)

```powershell
# Thêm vào .gitignore
echo "firebase-sa-dev.json" >> .gitignore
echo "firebase-sa-*.json" >> .gitignore
```

### Bước 6: Environment Variables

Tạo file `apps/server/.env`:

```bash
# === App ===
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1

# === Database ===
DATABASE_URL=postgresql://chatai:chatai_dev_123@localhost:5432/chatai_dev

# === Redis ===
REDIS_URL=redis://localhost:6379

# === ChromaDB ===
CHROMA_URL=http://localhost:8000

# === Ollama (Local) ===
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_LARGE=qwen2.5:14b
OLLAMA_MODEL_SMALL=qwen2.5:3b
OLLAMA_EMBED_MODEL=bge-m3

# === TTS Engine (Local) ===
TTS_ENGINE_URL=http://localhost:5000

# === Firebase ===
FIREBASE_PROJECT_ID=chatai-dev
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-sa-dev.json
FIREBASE_STORAGE_BUCKET=chatai-dev.appspot.com

# === App Config ===
MAX_HISTORY_TOKENS=20000
CHECKPOINT_KEEP_TURNS=5
RATE_LIMIT_CHAT_PER_MIN=999
JSONL_CACHE_DIR=./tmp/sessions
JSONL_CLEANUP_DAYS=7

# === Security (relaxed for dev) ===
CORS_ORIGINS=*
IDEMPOTENCY_TTL_HOURS=24

# === Logging ===
LOG_LEVEL=debug
```

Tạo file `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api/v1
EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID=<từ Firebase Console>
```

> **Lưu ý**: `192.168.x.x` là IP LAN của máy dev (không dùng `localhost` vì mobile emulator không truy cập được).

### Bước 7: Database Migration & Seed

```powershell
cd apps/server

# Chạy Prisma migration
npx prisma migrate dev --name init

# Seed data mẫu
npx prisma db seed
```

### Bước 8: Tạo thư mục cache

```powershell
# Tạo thư mục cho .jsonl cache (dev)
mkdir -p apps/server/tmp/sessions
```

---

## 2. Chạy Development

### Terminal Layout (VS Code)

Mở 4 terminals trong VS Code:

| Terminal | Mục đích | Command |
|---------|----------|---------|
| **T1** | Docker services | `docker compose -f docker-compose.dev.yml up` |
| **T2** | NestJS Server | `cd apps/server && pnpm dev` |
| **T3** | React Native (Expo) | `cd apps/mobile && pnpm start` |
| **T4** | GPT-SoVITS (tuỳ chọn) | `cd C:\Dev\GPT-SoVITS && python api_server.py` |

> Ollama chạy tự động như Windows service — không cần terminal riêng.

### Quick Start (sau khi setup xong)

```powershell
# 1. Start Docker (nếu chưa)
docker compose -f docker-compose.dev.yml up -d

# 2. Start Server
cd apps/server
pnpm dev
# -> http://localhost:3000
# -> GET http://localhost:3000/healthz -> {"status": "ok"}

# 3. Start Mobile
cd apps/mobile
pnpm start
# -> Expo DevTools mở, scan QR bằng Expo Go app
```

---

## 3. Verify Everything Works

### Checklist sau khi setup

```powershell
# ✅ Docker containers
docker ps
# CONTAINER ID  IMAGE                  STATUS    PORTS
# xxx           postgres:16-alpine     Up        0.0.0.0:5432->5432
# xxx           redis:7-alpine         Up        0.0.0.0:6379->6379
# xxx           chromadb/chroma        Up        0.0.0.0:8000->8000

# ✅ Ollama
curl http://localhost:11434/api/tags
# -> {"models": [...]}

# ✅ Test Ollama JSON mode
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:3b",
  "messages": [{"role": "user", "content": "Return JSON: {\"hello\": \"world\"}"}],
  "format": "json",
  "stream": false
}'

# ✅ NestJS API
curl http://localhost:3000/healthz
# -> {"status": "ok", "checks": {"postgres": "ok", "redis": "ok", ...}}

# ✅ Postgres connection
docker exec chatai-postgres psql -U chatai -d chatai_dev -c "SELECT 1;"

# ✅ Redis
docker exec chatai-redis redis-cli ping

# ✅ ChromaDB
curl http://localhost:8000/api/v1/collections
```

### Troubleshooting

| Vấn đề | Nguyên nhân | Fix |
|--------|-------------|-----|
| Ollama không load model | Thiếu VRAM | Dùng model nhỏ hơn (7b → 3b) |
| Docker port conflict | Port đã bị dùng | Đổi port trong docker-compose hoặc stop service cũ |
| Prisma migrate fail | DB chưa ready | Đợi postgres healthcheck pass |
| Mobile không connect API | Dùng `localhost` | Đổi sang IP LAN (192.168.x.x) |
| CUDA error | Driver cũ | Update NVIDIA driver |
| ChromaDB crash | Thiếu RAM | Tăng Docker memory limit |

---

## 4. VS Code Extensions khuyến nghị

```jsonc
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "ms-azuretools.vscode-docker",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "eamodio.gitlens",
    "humao.rest-client",
    "mikestead.dotenv"
  ]
}
```

---

## 5. VS Code Settings

```jsonc
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/node_modules": true,
    "**/.expo": true,
    "**/dist": true
  }
}
```

---

## 6. Scripts (package.json root)

```jsonc
// package.json (root workspace)
{
  "scripts": {
    "dev": "pnpm --filter server dev & pnpm --filter mobile start",
    "dev:server": "pnpm --filter server dev",
    "dev:mobile": "pnpm --filter mobile start",
    "docker:up": "docker compose -f docker-compose.dev.yml up -d",
    "docker:down": "docker compose -f docker-compose.dev.yml down",
    "docker:reset": "docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d",
    "db:migrate": "pnpm --filter server prisma migrate dev",
    "db:seed": "pnpm --filter server prisma db seed",
    "db:studio": "pnpm --filter server prisma studio",
    "db:reset": "pnpm --filter server prisma migrate reset",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter server test:e2e",
    "clean": "pnpm -r exec rm -rf node_modules dist .expo"
  }
}
```

---

## 7. Git Hooks (Husky + lint-staged)

```powershell
# Setup
pnpm add -D -w husky lint-staged
npx husky init
```

```bash
# .husky/pre-commit
pnpm lint-staged
```

```jsonc
// package.json (root)
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## 8. Folder Structure sau khi Setup

```
chatAI/
├── apps/
│   ├── mobile/                     # React Native (Expo)
│   │   ├── src/
│   │   ├── app.json
│   │   ├── .env                    # EXPO_PUBLIC_* vars
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── server/                     # NestJS API
│       ├── src/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── tmp/
│       │   └── sessions/           # .jsonl cache (gitignored)
│       ├── firebase-sa-dev.json    # (gitignored)
│       ├── .env                    # (gitignored)
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared-types/               # TS interfaces Client/Server
│   │   ├── src/
│   │   └── package.json
│   └── prompts/                    # System prompts versioned
│       └── v1/
│
├── docker-compose.dev.yml
├── .gitignore
├── .husky/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── Document/                       # Tài liệu thiết kế (đã có)
```

---

## 9. `.gitignore`

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
.expo/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# Firebase
firebase-sa-*.json
.firebase/

# Dev cache
apps/server/tmp/
*.jsonl

# IDE
.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db

# Test
coverage/

# Docker volumes (if local)
postgres_data/
redis_data/
chroma_data/
```

---

## 10. `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 11. Workflow hàng ngày

```
┌─────────────────────────────────────────────────────────────┐
│  Bật máy → Docker Desktop tự start                          │
│  Ollama tự chạy (Windows service)                           │
│                                                             │
│  Terminal 1: docker compose -f docker-compose.dev.yml up -d │
│  Terminal 2: cd apps/server && pnpm dev                     │
│  Terminal 3: cd apps/mobile && pnpm start                   │
│                                                             │
│  Code... test... commit...                                  │
│                                                             │
│  Xong việc: docker compose -f docker-compose.dev.yml stop   │
└─────────────────────────────────────────────────────────────┘
```

### Quick commands hay dùng:

```powershell
# Xem DB trực quan
pnpm db:studio              # Mở Prisma Studio ở localhost:5555

# Reset DB hoàn toàn (dev only)
pnpm db:reset

# Xem logs server
# (NestJS dev mode đã có pino-pretty - logs có màu)

# Test 1 endpoint nhanh (VS Code REST Client)
# Tạo file test.http:
```

```http
### Health check
GET http://localhost:3000/healthz

### Login (cần real Firebase token)
POST http://localhost:3000/api/v1/auth/google-signin
Content-Type: application/json

{
  "idToken": "<paste-firebase-id-token>"
}

### Create story (cần auth)
POST http://localhost:3000/api/v1/stories
Content-Type: application/json
Authorization: Bearer <firebase-id-token>

{
  "title": "Mimi và anh trai",
  "initialSetting": "Mimi 10 tuổi, sống cùng anh trai 16 tuổi trong căn hộ nhỏ."
}
```

---

## 12. Lưu ý quan trọng cho Dev

### GPU Memory Management

```powershell
# Kiểm tra VRAM usage
nvidia-smi

# Nếu VRAM hết (Ollama giữ model trong memory):
# Ollama tự unload model sau 5 phút idle
# Hoặc force unload:
curl -X DELETE http://localhost:11434/api/generate -d '{"model": "qwen2.5:14b", "keep_alive": 0}'
```

### Nếu chỉ có 8GB VRAM

```bash
# Trong .env, đổi model:
OLLAMA_MODEL_LARGE=qwen2.5:7b    # thay vì 14b
OLLAMA_MODEL_SMALL=qwen2.5:3b   # giữ nguyên
```

### Dev không cần TTS

Nếu đang dev feature không liên quan TTS, skip GPT-SoVITS:
- Server sẽ trả `503 TTS_ENGINE_DOWN` khi gọi `/tts/synthesize`
- Client hiển thị text-only mode (acceptable cho dev)

### Firebase Emulator (Alternative)

Nếu không muốn dùng Firebase thật cho dev:

```powershell
npm install -g firebase-tools
firebase init emulators   # Chọn: Auth, Firestore, Storage
firebase emulators:start
# Auth:      http://localhost:9099
# Firestore: http://localhost:8080
# Storage:   http://localhost:9199
```

Thêm vào `.env`:
```bash
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
```
