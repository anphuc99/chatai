# 11 — Cost Estimation & Resource Planning

> Ước tính chi phí hạ tầng hàng tháng cho solo dev, < 50 concurrent users (beta).  
> Chiến lược: Tối ưu chi phí, chấp nhận trade-off về latency và availability.

---

## 1. Tổng quan Chi phí Hàng tháng

| Hạng mục | Provider | Plan | Chi phí/tháng (USD) |
|----------|----------|------|---------------------|
| VPS API Server | Hetzner CX31 | 4vCPU, 8GB RAM, 80GB | **$15** |
| GPU Cloud (Ollama + TTS) | RunPod Serverless | Pay-per-second | **$30 - $120** |
| Domain + DNS | Cloudflare | Free plan | **$0** |
| SSL | Let's Encrypt (Caddy) | Free | **$0** |
| Firebase Auth | Spark (Free) | 10K users | **$0** |
| Cloud Firestore | Spark (Free) | 50K reads/day | **$0** |
| Firebase Storage | Spark (Free) | 5GB | **$0** |
| Monitoring (Sentry) | Free tier | 5K events/month | **$0** |
| Monitoring (UptimeRobot) | Free tier | 50 monitors | **$0** |
| CI/CD (GitHub Actions) | Free tier | 2000 min/month | **$0** |
| EAS Build (Expo) | Free tier | 30 builds/month | **$0** |
| Backup Storage | Backblaze B2 | 10GB free | **$0** |
| Tailscale VPN | Free (≤3 users) | Personal plan | **$0** |
| **TỔNG (ước tính thấp)** | | | **$45 - $135/tháng** |

---

## 2. Chi tiết GPU Cloud Cost

### 2.1. RunPod Serverless (Khuyến nghị cho Beta)

| Model | GPU Required | Cold Start | Cost/second | Est. monthly |
|-------|-------------|-----------|-------------|--------------|
| qwen2.5:14b | 24GB VRAM (A5000/3090) | ~30-60s | $0.00032/s | Tuỳ usage |
| qwen2.5:3b | 8GB VRAM (4060/A4000) | ~15-30s | $0.00019/s | Tuỳ usage |
| GPT-SoVITS | 8-12GB VRAM | ~20-40s | $0.00025/s | Tuỳ usage |
| bge-m3 (embedding) | 4GB VRAM | ~10s | $0.00019/s | Tuỳ usage |

### 2.2. Usage Estimation (50 users, beta)

**Assumptions:**
- 50 users, mỗi user trung bình 5 sessions/tuần
- Mỗi session: 15 messages → 15 LLM calls + 15 TTS calls
- Mỗi LLM call (14b): ~10s processing
- Mỗi TTS call: ~5s processing (50% cache hit → chỉ 50% cần inference)

| Workload | Calls/month | Seconds/call | Total seconds | Cost |
|----------|------------|-------------|---------------|------|
| Large LLM (14b) | 50×5×4×15 = 15,000 | 10s | 150,000s | ~$48 |
| Small LLM (3b) | ~3,000 (summaries) | 5s | 15,000s | ~$3 |
| TTS inference | 7,500 (50% of 15K) | 5s | 37,500s | ~$9 |
| Embedding | ~2,000 | 2s | 4,000s | ~$1 |
| **Total GPU** | | | | **~$61/month** |

### 2.3. Alternative: Always-On Dedicated GPU

| Option | Cost/month | Pros | Cons |
|--------|-----------|------|------|
| RunPod Community (3090) | ~$190 (24/7) | Zero latency | Overkill cho beta |
| RunPod Secure (3090) | ~$290 (24/7) | Reliable | Expensive |
| Vast.ai Spot (3090) | ~$110 (24/7) | Cheapest | Can be interrupted |
| **RunPod Serverless** | **~$61** (usage-based) | **Pay only for use** | Cold start 30-60s |

**Khuyến nghị**: Dùng **RunPod Serverless** cho beta, chấp nhận cold start. Upgrade sang dedicated khi có >100 active users.

---

## 3. VPS Cost Breakdown

### 3.1. Hetzner Cloud Options

| Instance | Spec | Price/mo | Suitability |
|----------|------|----------|-------------|
| CX22 | 2 vCPU, 4GB RAM, 40GB | $5 | ❌ Thiếu RAM cho Postgres+Redis+ChromaDB+NestJS |
| **CX31** | **4 vCPU, 8GB RAM, 80GB** | **$15** | ✅ Đủ cho beta |
| CX41 | 8 vCPU, 16GB RAM, 160GB | $29 | 📈 Upgrade khi scale |

### 3.2. RAM Allocation (CX31 - 8GB)

| Service | RAM Usage | Notes |
|---------|----------|-------|
| PostgreSQL | ~1-2GB | Shared buffers + connections |
| Redis | 256MB (capped) | maxmemory config |
| ChromaDB | ~1-2GB | Depends on data size |
| NestJS API | ~512MB-1GB | Node.js heap |
| BullMQ Workers | ~256MB | Lightweight |
| Docker overhead | ~512MB | Engine + layers |
| OS + cache | ~1-2GB | Linux kernel |
| **Total** | **~6-8GB** | Fits in 8GB with some swap |

---

## 4. Firebase Spark Limits & Workarounds

### 4.1. Quotas tháng (Free Plan)

| Resource | Daily Limit | Monthly Estimate | Risk Level |
|----------|------------|-----------------|------------|
| Firestore Reads | 50,000/day | 1.5M/month | ✅ Low (chỉ profile sync) |
| Firestore Writes | 20,000/day | 600K/month | ✅ Low (server writes gems/streak) |
| Firestore Storage | 1GB total | - | ✅ Low (~50 users × 10KB) |
| Auth Verifications | Unlimited | - | ✅ |
| Storage Space | 5GB total | - | ⚠️ Medium (TTS cache fills up) |
| Storage Downloads | 1GB/day | 30GB/month | ⚠️ Medium (audio files) |
| Storage Uploads | 5GB/day | - | ✅ Low |

### 4.2. Firebase Storage Optimization

**Vấn đề**: 5GB storage + 1GB/day download có thể không đủ nếu TTS cache lớn.

**Giải pháp tiết kiệm:**
1. Lưu TTS audio cache **trên VPS disk** thay vì Firebase Storage
2. Serve qua NestJS static endpoint (hoặc Caddy static files)
3. Firebase Storage chỉ dùng cho **avatars** (rất nhỏ, ~50MB max)
4. Nếu cần CDN cho audio: upgrade Firebase sang Blaze (~$0.026/GB)

```typescript
// Alternative: Local TTS cache instead of Firebase Storage
const TTS_CACHE_DIR = '/var/lib/chatai/tts_cache';

// Save audio locally
fs.writeFileSync(`${TTS_CACHE_DIR}/${hash}.wav`, audioBuffer);

// Serve via API
@Get('/tts/audio/:hash')
getAudio(@Param('hash') hash: string, @Res() res: Response) {
  const filePath = path.join(TTS_CACHE_DIR, `${hash}.wav`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    throw new NotFoundException();
  }
}
```

**Impact**: Tiết kiệm hoàn toàn Firebase Storage cho TTS, trả $0.

---

## 5. Bandwidth Estimation

| Traffic Type | Per Request | Monthly (50 users) | Provider |
|-------------|------------|--------------------|---------| 
| API JSON responses | ~2-5KB | ~50MB | VPS (included) |
| TTS audio files | ~100-500KB | ~5-25GB | VPS or Firebase |
| Avatar images | ~50-200KB | ~500MB | Firebase Storage |
| LLM API calls (internal) | ~5-20KB | ~200MB | Tailscale (free) |
| **Total outbound** | | **~6-26GB** | |

Hetzner CX31 includes 20TB/month bandwidth → no extra cost.

---

## 6. Cost Scaling Projections

### 6.1. Growth Milestones

| Users | Monthly Cost | Key Changes |
|-------|-------------|-------------|
| **1-50 (Beta)** | **$45-135** | RunPod Serverless + Hetzner CX31 + Firebase Free |
| 50-200 | $150-300 | RunPod Dedicated GPU + Hetzner CX41 + Firebase Blaze |
| 200-500 | $300-600 | + Managed Postgres (Supabase/Neon) + CDN |
| 500-1000 | $600-1200 | + 2nd API instance + dedicated GPU server |
| 1000+ | $1000+ | Kubernetes + auto-scaling |

### 6.2. Revenue Targets to Break Even

| Cost/month | Users needed | Revenue model |
|-----------|-------------|---------------|
| $100 | 50 free users | Pre-revenue (development) |
| $200 | 40 paying users @ $5/mo | Subscription launch |
| $500 | 100 paying users @ $5/mo | Growth phase |

---

## 7. Cost Optimization Strategies

### 7.1. Immediate (Beta Phase)

| Strategy | Savings | Tradeoff |
|----------|---------|----------|
| RunPod Serverless vs Dedicated | ~$130/mo | 30-60s cold start |
| Local TTS cache instead of Firebase Storage | ~$5-20/mo | Slightly more complex serving |
| Firebase Spark instead of Blaze | ~$10-30/mo | 5GB storage limit |
| Hetzner instead of DigitalOcean | ~$10/mo | EU location (but SGP available) |
| GitHub Actions free tier | ~$10-20/mo | 2000 min limit |

### 7.2. Medium-term (Post-Beta)

| Strategy | Impact |
|----------|--------|
| Aggressive TTS caching (target >50% hit rate) | Reduce GPU seconds by 50% |
| Smaller model for simple tasks (3b for queries, summarize) | Reduce cost per LLM call |
| Checkpoint sooner (reduce context size) | Fewer tokens per LLM call |
| Queue non-urgent tasks (memory write, TTS gen) | Spread GPU usage, avoid peaks |
| Serverless GPU auto-scale to zero off-hours | Save 30% on quiet hours |

### 7.3. Long-term

| Strategy | Impact |
|----------|--------|
| Self-hosted GPU (RTX 4090 ~$1600 one-time) | Break even in ~4-6 months vs cloud |
| Fine-tuned smaller model (7b instead of 14b) | 50% cost reduction |
| Client-side TTS fallback (system TTS) | Reduce server TTS calls |
| Edge caching for popular phrases | Near-zero cost for repeated content |

---

## 8. Free Tier Utilization Summary

| Service | Free Tier Used | Monthly Value |
|---------|---------------|---------------|
| Firebase Auth | ✅ | ~$5 saved |
| Cloud Firestore (Spark) | ✅ | ~$10 saved |
| Firebase Storage (5GB) | ✅ (avatars only) | ~$5 saved |
| GitHub Actions (2000 min) | ✅ | ~$15 saved |
| Cloudflare DNS + DDoS | ✅ | ~$20 saved |
| Sentry (5K events) | ✅ | ~$26 saved |
| UptimeRobot (50 monitors) | ✅ | ~$7 saved |
| Tailscale (personal) | ✅ | ~$5 saved |
| Let's Encrypt SSL | ✅ | ~$10 saved |
| EAS Build (30 builds) | ✅ | ~$15 saved |
| **Total free tier value** | | **~$118/month saved** |

---

## 9. Budget Decision Matrix

| Nếu budget < $50/mo | Nếu budget $50-150/mo | Nếu budget > $150/mo |
|---------------------|----------------------|---------------------|
| RunPod Serverless (minimal usage) | RunPod Serverless (normal usage) | RunPod Dedicated GPU |
| Hetzner CX22 (4GB RAM) - risky | Hetzner CX31 (8GB RAM) ✅ | Hetzner CX41 (16GB RAM) |
| SQLite thay Postgres | Postgres in Docker | Managed Postgres |
| Skip ChromaDB (no memory) | ChromaDB in Docker | ChromaDB in Docker |
| Firebase Spark only | Firebase Spark + local TTS cache | Firebase Blaze |
| Manual deploy (no CI/CD) | GitHub Actions | GitHub Actions |

**Khuyến nghị cho bạn**: Budget **$50-135/tháng** là phù hợp nhất cho beta phase.

---

## 10. Monthly Cost Tracking Template

```markdown
## Tháng: ____/2026

| Hạng mục | Dự kiến | Thực tế | Ghi chú |
|----------|---------|---------|---------|
| Hetzner VPS | $15 | | |
| RunPod GPU | $61 | | |
| Firebase | $0 | | |
| Domain | $0 | | |
| Other | $0 | | |
| **TOTAL** | **$76** | | |

### GPU Usage Detail:
- LLM calls: _____ calls, _____ seconds
- TTS calls: _____ calls, _____ seconds  
- Cache hit rate: ___%
```
