# 06 — Deployment & Infrastructure

> Tài liệu đặc tả hạ tầng triển khai cho **solo developer**, target < 50 concurrent users (beta).  
> Chiến lược: **Hybrid** — GPU Cloud (RunPod/Vast.ai) cho AI + VPS giá rẻ cho API + Firebase Free tier.

---

## 1. Tổng quan Hạ tầng

```mermaid
flowchart TB
    subgraph Client["📱 Mobile Client"]
        RN[React Native / Expo]
    end

    subgraph GitHub["🔧 CI/CD"]
        GA[GitHub Actions]
        EAS[EAS Build]
    end

    subgraph VPS["🖥 VPS API Server (~$10-20/mo)"]
        Docker[Docker Compose]
        NestJS[NestJS API]
        PG[(PostgreSQL 16)]
        Redis[(Redis 7)]
        Chroma[(ChromaDB)]
        BullMQ[BullMQ Workers]
        JSONL[(.jsonl cache)]
    end

    subgraph GPU["🤖 GPU Cloud (RunPod/Vast.ai)"]
        Ollama[Ollama - qwen2.5:14b + 3b]
        GPTSV[GPT-SoVITS FastAPI]
        FFmpeg[FFmpeg]
    end

    subgraph Firebase["☁️ Firebase (Spark Free)"]
        FBAuth[Firebase Auth]
        FBStore[Cloud Firestore]
        FBStorage[Firebase Storage 5GB]
    end

    RN --> NestJS
    RN --> FBAuth
    RN --> FBStore
    NestJS --> PG
    NestJS --> Redis
    NestJS --> Chroma
    NestJS --> Ollama
    NestJS --> GPTSV
    NestJS --> FBStorage
    NestJS --> FBStore
    GA --> Docker
    GA --> EAS
```

---

## 2. Chi tiết từng Thành phần

### 2.1. VPS API Server

| Hạng mục | Spec đề xuất | Provider gợi ý |
|----------|-------------|-----------------|
| CPU | 2-4 vCPU | Hetzner CX31 / DigitalOcean $24 |
| RAM | 8GB (Postgres + Redis + ChromaDB + NestJS) | |
| Disk | 80GB SSD (Postgres data + `.jsonl` cache + ChromaDB persist) | |
| OS | Ubuntu 22.04 LTS | |
| Network | 1Gbps, public IPv4 | |
| Location | Singapore/Tokyo (gần user Việt Nam) | Hetzner Ashburn hoặc DigitalOcean SGP |

**Docker Compose stack trên VPS:**

```yaml
# docker-compose.prod.yml
version: "3.9"
services:
  api:
    build: ./apps/server
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, redis, chromadb]
    volumes:
      - jsonl_cache:/var/lib/chatai/sessions
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: chatai
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports: ["5432:5432"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports: ["6379:6379"]
    restart: unless-stopped

  chromadb:
    image: chromadb/chroma:latest
    volumes:
      - chroma_data:/chroma/chroma
    ports: ["8000:8000"]
    environment:
      - ANONYMIZED_TELEMETRY=FALSE
    restart: unless-stopped

volumes:
  pg_data:
  redis_data:
  chroma_data:
  jsonl_cache:
```

### 2.2. GPU Cloud Server (RunPod/Vast.ai)

| Hạng mục | Spec tối thiểu | Ghi chú |
|----------|---------------|---------|
| GPU | 1x RTX 3090/4090 (24GB VRAM) | Chạy đồng thời Ollama 14b + GPT-SoVITS |
| RAM | 32GB system RAM | |
| Disk | 100GB (models + reference audio) | |
| Bandwidth | Unlimited / high | |

**Lý do chọn RunPod/Vast.ai:**
- Thuê theo giờ (on-demand) hoặc spot — phù hợp beta test
- RunPod: ~$0.40-0.80/hr cho RTX 3090; ~$0.74/hr RTX 4090
- Vast.ai: có thể rẻ hơn ($0.20-0.50/hr) nhưng kém stable

**Deployment script GPU server:**

```bash
#!/bin/bash
# setup_gpu.sh - Run on GPU cloud instance

# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull qwen2.5:14b
ollama pull qwen2.5:3b
ollama pull bge-m3  # embedding model

# Setup GPT-SoVITS
cd /workspace
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
pip install -r requirements.txt

# Copy custom models & reference audio
# (from persistent storage or S3)
cp -r /storage/models ./pretrained_models/
cp -r /storage/dataset_chinese ./

# Start services
ollama serve &                      # Port 11434
python app.py --port 5000 &         # GPT-SoVITS FastAPI port 5000
```

**Network: VPS ↔ GPU communication:**
- Dùng **Tailscale** (WireGuard mesh VPN) để kết nối private giữa VPS và GPU server
- Ollama API: `http://gpu-tailscale-ip:11434`
- GPT-SoVITS API: `http://gpu-tailscale-ip:5000`
- Không expose GPU ports ra public internet

### 2.3. Firebase (Spark Free Plan)

| Dịch vụ | Quota Free | Sử dụng dự kiến (< 50 users) |
|---------|-----------|-------------------------------|
| Auth | 10K verifications/month | ~50 users → OK |
| Firestore reads | 50K/day | ~50 users × 20 reads = 1K/day → OK |
| Firestore writes | 20K/day | ~50 users × 10 writes = 500/day → OK |
| Firestore storage | 1GB | Profile data chỉ ~10KB/user → OK |
| Cloud Storage | 5GB total | ⚠️ TTS cache nhanh đầy — cần cleanup policy |
| Storage download | 1GB/day | ⚠️ Audio files lớn — cần CDN fallback |

**⚠️ Firebase Storage 5GB Mitigation:**
- TTS audio cache: mỗi file ~100KB-500KB WAV
- 5GB ≈ 10,000-50,000 audio files
- **Cleanup cron job**: xóa files > 30 ngày không accessed
- **Alternative**: Dùng VPS disk cho TTS cache, chỉ dùng Firebase Storage cho avatars
- Khi vượt quota: upgrade lên Blaze (pay-as-you-go)

---

## 3. Domain & SSL

| Thành phần | Cấu hình |
|-----------|----------|
| Domain | `api.chatai-app.com` (hoặc tương tự) |
| SSL | Let's Encrypt via Caddy reverse proxy |
| DNS | Cloudflare (free tier — DNS + basic DDoS protection) |

**Caddy reverse proxy (trên VPS):**
```
api.chatai-app.com {
    reverse_proxy localhost:3000
    encode gzip
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Strict-Transport-Security "max-age=31536000"
    }
}
```

---

## 4. CI/CD Pipeline (GitHub Actions)

```mermaid
flowchart LR
    Push[Git Push] --> Lint[ESLint + Prettier]
    Lint --> Test[Unit + Integration Tests]
    Test --> Build[Docker Build]
    Build --> Deploy{Branch?}
    Deploy -->|main| Prod[SSH Deploy to VPS]
    Deploy -->|develop| Staging[Deploy Staging]
    
    Push --> Mobile[EAS Build Trigger]
    Mobile --> Preview[Preview Build]
```

### 4.1. Server Deploy Workflow

```yaml
# .github/workflows/deploy-server.yml
name: Deploy Server
on:
  push:
    branches: [main]
    paths: ['apps/server/**', 'packages/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter server lint
      - run: pnpm --filter server test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/chatai
            git pull origin main
            docker compose -f docker-compose.prod.yml build api
            docker compose -f docker-compose.prod.yml up -d api
            docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### 4.2. Mobile Build Workflow

```yaml
# .github/workflows/build-mobile.yml
name: Mobile Build
on:
  push:
    branches: [main]
    paths: ['apps/mobile/**', 'packages/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd apps/mobile && eas build --platform all --profile preview --non-interactive
```

---

## 5. Environment Variables

### 5.1. VPS Server `.env`

```bash
# === App ===
NODE_ENV=production
PORT=3000
API_PREFIX=/api/v1

# === Database ===
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/chatai
DB_USER=chatai_user
DB_PASSWORD=<strong-random-password>

# === Redis ===
REDIS_URL=redis://redis:6379

# === ChromaDB ===
CHROMA_URL=http://chromadb:8000

# === AI Services (via Tailscale) ===
OLLAMA_BASE_URL=http://100.x.x.x:11434
OLLAMA_MODEL_LARGE=qwen2.5:14b
OLLAMA_MODEL_SMALL=qwen2.5:3b
OLLAMA_EMBED_MODEL=bge-m3
TTS_ENGINE_URL=http://100.x.x.x:5000

# === Firebase ===
FIREBASE_PROJECT_ID=chatai-xxxxx
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/firebase-sa.json
FIREBASE_STORAGE_BUCKET=chatai-xxxxx.appspot.com

# === App Config ===
MAX_HISTORY_TOKENS=20000
CHECKPOINT_KEEP_TURNS=5
RATE_LIMIT_CHAT_PER_MIN=30
JSONL_CACHE_DIR=/var/lib/chatai/sessions
JSONL_CLEANUP_DAYS=7

# === Security ===
CORS_ORIGINS=https://chatai-app.com
IDEMPOTENCY_TTL_HOURS=24
```

### 5.2. GPU Server environment

```bash
# Ollama
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_MODELS=/workspace/models

# GPT-SoVITS
TTS_HOST=0.0.0.0
TTS_PORT=5000
TTS_MODEL_DIR=/workspace/GPT-SoVITS/pretrained_models
TTS_DATASET_DIR=/workspace/dataset_chinese
```

---

## 6. Backup & Disaster Recovery

### 6.1. Postgres Backup

```bash
# Cron job: daily backup at 03:00 UTC
# /etc/cron.d/chatai-backup
0 3 * * * root docker exec chatai-postgres pg_dump -U chatai_user chatai | gzip > /backups/pg_$(date +\%Y\%m\%d).sql.gz

# Retention: 7 daily + 4 weekly
find /backups -name "pg_*.sql.gz" -mtime +30 -delete
```

**Upload to external storage:**
```bash
# Upload to Google Cloud Storage (free 5GB) or Backblaze B2
rclone sync /backups remote:chatai-backups --max-age 30d
```

### 6.2. ChromaDB Backup

```bash
# ChromaDB persist directory backup
0 4 * * * root tar -czf /backups/chroma_$(date +\%Y\%m\%d).tar.gz /var/lib/docker/volumes/chatai_chroma_data/_data
```

### 6.3. `.jsonl` Cache Recovery

- `.jsonl` files là cache tạm — nếu mất, active sessions sẽ mất history
- **Mitigation**: Backup volume `jsonl_cache` hàng giờ trong peak hours
- Nếu mất: user phải end chat và bắt đầu session mới (acceptable cho beta)

### 6.4. Recovery Procedure

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| VPS crash/rebuild | 1-2 giờ | 24h (last backup) | Restore docker volumes từ backup |
| GPU instance terminated | 15-30 phút | 0 (stateless) | Spin new instance, run setup script |
| Postgres corruption | 30 phút | 24h | Restore from daily dump |
| Redis data loss | Immediate | 0 (rebuildable) | Redis restart, counters reset to 0 |

---

## 7. Scaling Strategy (Post-Beta)

Khi vượt 50 users, roadmap scale:

| Milestone | Action |
|-----------|--------|
| 50→200 users | Upgrade VPS RAM 16GB, Firebase → Blaze plan |
| 200→500 users | Tách Postgres sang managed DB (Supabase/Neon), add read replica |
| 500→1000 users | Horizontal scale NestJS (2-3 instances + nginx LB) |
| 1000+ | Kubernetes, dedicated GPU server thay vì cloud rental |

---

## 8. GPU Server Cost Optimization

### 8.1. On-Demand vs Always-On

| Strategy | Cost/month | Tradeoff |
|----------|-----------|----------|
| Always-on (RunPod) | ~$290-580 (24/7 × $0.40-0.80/hr) | Zero latency, always ready |
| Scheduled (12h/day) | ~$145-290 | Cold start khi off-hours |
| On-demand (spin up khi có request) | ~$50-150 (tuỳ usage) | 30-60s cold start mỗi lần |
| **Khuyến nghị beta**: Scheduled 16h/day | ~$190-380 | Tắt 00:00-08:00 (low traffic) |

### 8.2. Serverless GPU Alternative

- **RunPod Serverless**: Pay per second of compute, auto-scale to 0
- Ollama: Custom endpoint container
- GPT-SoVITS: Custom endpoint container  
- Cold start: ~30-60s (acceptable cho < 50 users)
- Cost: Chỉ trả khi có request → **rẻ nhất cho beta** (~$20-80/month)

---

## 9. Network Security

```mermaid
flowchart LR
    Internet --> CF[Cloudflare DNS/CDN]
    CF --> Caddy[Caddy Reverse Proxy]
    Caddy --> NestJS[NestJS :3000]
    
    subgraph VPS["VPS Private Network"]
        NestJS --> PG[Postgres :5432]
        NestJS --> Redis[Redis :6379]
        NestJS --> Chroma[ChromaDB :8000]
    end
    
    subgraph Tailscale["Tailscale VPN"]
        NestJS --> GPU_Ollama[Ollama :11434]
        NestJS --> GPU_TTS[GPT-SoVITS :5000]
    end
```

**Rules:**
- Postgres, Redis, ChromaDB: **KHÔNG** expose ra internet (chỉ localhost/docker network)
- GPU services: chỉ accessible qua Tailscale VPN
- NestJS: chỉ accessible qua Caddy (port 3000 không public)
- SSH: key-only authentication, disable password auth
- Firewall (ufw): chỉ mở port 80, 443, 22 (SSH)

---

## 10. Checklist Deployment

### First-time Setup

- [ ] Đăng ký VPS (Hetzner/DO), cài Docker + Docker Compose
- [ ] Setup Tailscale trên VPS
- [ ] Đăng ký RunPod/Vast.ai, tạo template GPU instance
- [ ] Setup Tailscale trên GPU instance
- [ ] Test connectivity VPS ↔ GPU qua Tailscale
- [ ] Tạo Firebase project, download service account JSON
- [ ] Setup domain DNS trên Cloudflare → VPS IP
- [ ] Install Caddy, configure reverse proxy + auto SSL
- [ ] Clone repo, setup `.env`, run `docker compose up -d`
- [ ] Run `prisma migrate deploy` + seed data
- [ ] Verify `GET /healthz` returns 200
- [ ] Setup backup cron jobs
- [ ] Setup Sentry project, add DSN to `.env`
- [ ] GitHub Actions secrets configured
- [ ] First EAS build successful

### Pre-Launch Checklist

- [ ] Load test: 10 concurrent chat sessions
- [ ] TTS latency < 10s (warm cache)
- [ ] LLM response < 15s (14b model)
- [ ] Backup restore tested
- [ ] Firebase security rules deployed
- [ ] Rate limiting verified
- [ ] Error tracking receiving events
