# 07 — Monitoring & Observability

> Thiết kế phù hợp cho **solo developer**, beta < 50 users.  
> Chiến lược: **Sentry (free tier)** + **Pino structured logs** + **UptimeRobot** + **Docker healthchecks**.  
> Không over-engineer: tránh Prometheus/Grafana stack (tốn RAM, phức tạp cho 1 người maintain).

---

## 1. Kiến trúc Observability

```mermaid
flowchart TB
    subgraph App["🖥 NestJS Application"]
        Pino[Pino Logger]
        Sentry_SDK[Sentry SDK]
        Health[/healthz Endpoint]
        Metrics[/metrics Endpoint]
    end

    subgraph Storage["📁 Log Storage"]
        LogFile["/var/log/chatai/*.log"]
        Docker[Docker stdout/stderr]
    end

    subgraph External["☁️ External Services"]
        SentryCloud[Sentry Cloud - Free 5K events/mo]
        UptimeBot[UptimeRobot - Free 50 monitors]
    end

    subgraph Alerts["🔔 Alerts"]
        Email[Email Notification]
        Telegram[Telegram Bot - Optional]
    end

    Pino --> LogFile
    Pino --> Docker
    Sentry_SDK --> SentryCloud
    Health --> UptimeBot
    SentryCloud --> Email
    UptimeBot --> Email
    UptimeBot --> Telegram
```

---

## 2. Logging (Pino)

### 2.1. Cấu hình Logger

```typescript
// apps/server/src/shared/logger/logger.config.ts
import { LoggerModule } from 'nestjs-pino';

export const loggerConfig = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' 
      ? { target: 'pino-pretty' } 
      : undefined,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        userId: req.user?.uid, // Inject sau AuthGuard
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    redact: {
      paths: ['req.headers.authorization', 'req.body.idToken'],
      censor: '[REDACTED]',
    },
  },
});
```

### 2.2. Log Levels & Quy ước

| Level | Khi nào dùng | Ví dụ |
|-------|-------------|-------|
| `fatal` | App crash, không recover được | Postgres connection lost permanently |
| `error` | Operation fail, cần investigate | LLM JSON parse fail sau 2 retry |
| `warn` | Bất thường nhưng app vẫn hoạt động | Rate limit triggered, TTS fallback |
| `info` | Business events quan trọng | Session started/ended, mission completed |
| `debug` | Dev troubleshooting | Prompt content, ChromaDB query results |

### 2.3. Structured Log Format

```json
{
  "level": "info",
  "time": "2026-05-29T10:30:00.000Z",
  "pid": 1,
  "hostname": "chatai-api",
  "reqId": "abc-123",
  "userId": "firebase-uid-xxx",
  "module": "chat",
  "action": "message_sent",
  "sessionId": "session-uuid",
  "duration_ms": 3200,
  "llm_tokens_used": 1850,
  "msg": "User message processed successfully"
}
```

### 2.4. Log Rotation & Retention

```bash
# /etc/logrotate.d/chatai
/var/log/chatai/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    postrotate
        docker kill --signal=USR1 chatai-api 2>/dev/null || true
    endscript
}
```

**Retention policy:** 14 ngày local, quan trọng giữ 30 ngày.

---

## 3. Error Tracking (Sentry)

### 3.1. Setup

```typescript
// apps/server/src/main.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% traces cho free tier
  beforeSend(event) {
    // Không gửi expected errors
    if (event.exception?.values?.[0]?.type === 'RateLimitException') {
      return null;
    }
    return event;
  },
});
```

```typescript
// apps/mobile/src/utils/sentry.ts (React Native)
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enableAutoSessionTracking: true,
});
```

### 3.2. Sentry Free Tier Budget

| Quota | Limit | Strategy |
|-------|-------|----------|
| Events | 5,000/month | Filter out 4xx errors, rate limit warnings |
| Transactions | 100K/month | 10% sample rate |
| Replays | 50/month | Chỉ bật cho crash sessions |
| Attachments | 1GB/month | Không attach log files |

### 3.3. Custom Tags & Context

```typescript
// Thêm context vào mọi request
Sentry.setTag('module', 'chat');
Sentry.setUser({ id: userId });
Sentry.setContext('session', { sessionId, storyId });
```

---

## 4. Health Checks

### 4.1. Application Health Endpoint

```typescript
// GET /healthz
// Response khi healthy:
{
  "status": "ok",
  "timestamp": "2026-05-29T10:30:00.000Z",
  "uptime_seconds": 86400,
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "chromadb": "ok",
    "ollama": "ok",       // có thể "degraded" nếu GPU off
    "tts_engine": "ok"    // có thể "degraded" nếu GPU off
  }
}

// Response khi unhealthy:
{
  "status": "degraded",
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "chromadb": "ok",
    "ollama": "error",
    "tts_engine": "error"
  }
}
```

### 4.2. Docker Healthcheck

```yaml
# Đã define trong docker-compose (xem 06_deployment)
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

### 4.3. UptimeRobot Monitors (Free: 50 monitors, 5-min interval)

| Monitor | URL | Alert |
|---------|-----|-------|
| API Health | `https://api.chatai-app.com/healthz` | Email + Telegram |
| GPU Ollama | Internal check via `/healthz` | Email |
| Firebase Auth | `https://identitytoolkit.googleapis.com/v1/...` | Email |

---

## 5. Performance Metrics

### 5.1. Key Metrics to Track (via Pino logs)

| Metric | Target (P95) | Alert threshold |
|--------|-------------|-----------------|
| API response time (non-AI) | < 200ms | > 1s |
| LLM response time (Large AI) | < 15s | > 30s |
| LLM response time (Small AI) | < 5s | > 10s |
| TTS generation time | < 8s | > 15s |
| TTS cache hit rate | > 30% | < 10% |
| Memory retrieval (ChromaDB) | < 3s | > 8s |
| End-Chat total time | < 30s | > 60s |
| Error rate | < 1% | > 5% |

### 5.2. Custom Metrics Logger

```typescript
// apps/server/src/shared/metrics/performance.logger.ts
@Injectable()
export class PerformanceLogger {
  constructor(private readonly logger: PinoLogger) {}

  logLlmCall(params: {
    model: string;
    tokens_in: number;
    tokens_out: number;
    duration_ms: number;
    success: boolean;
    retries: number;
  }) {
    this.logger.info({ 
      metric: 'llm_call', 
      ...params 
    }, `LLM ${params.model} call: ${params.duration_ms}ms`);
  }

  logTtsCall(params: {
    voice: string;
    cache_hit: boolean;
    duration_ms: number;
    text_length: number;
  }) {
    this.logger.info({ 
      metric: 'tts_call', 
      ...params 
    }, `TTS ${params.cache_hit ? 'HIT' : 'MISS'}: ${params.duration_ms}ms`);
  }
}
```

### 5.3. Simple Analytics Script (cron daily)

```bash
#!/bin/bash
# /opt/chatai/scripts/daily-metrics.sh
# Chạy mỗi ngày 23:59, output report

LOG_FILE="/var/log/chatai/app-$(date +%Y%m%d).log"

echo "=== Daily Metrics Report $(date +%Y-%m-%d) ==="
echo "Total requests: $(grep -c '"level":' $LOG_FILE)"
echo "Errors: $(grep -c '"level":"error"' $LOG_FILE)"
echo "LLM calls: $(grep -c '"metric":"llm_call"' $LOG_FILE)"
echo "TTS calls: $(grep -c '"metric":"tts_call"' $LOG_FILE)"
echo "TTS cache hits: $(grep '"metric":"tts_call"' $LOG_FILE | grep -c '"cache_hit":true')"
echo "Avg LLM duration: $(grep '"metric":"llm_call"' $LOG_FILE | jq -r '.duration_ms' | awk '{s+=$1;n++}END{print s/n "ms"}')"
```

---

## 6. Alerting Rules

### 6.1. Critical (phải fix ngay)

| Condition | Channel | Action |
|-----------|---------|--------|
| `/healthz` down > 5 phút | Email + Telegram | SSH vào check Docker |
| Postgres connection refused | Sentry + Email | Check disk space, restart container |
| Error rate > 10% trong 5 phút | Sentry alert | Check logs, possible LLM down |

### 6.2. Warning (fix trong 24h)

| Condition | Channel | Action |
|-----------|---------|--------|
| Disk usage > 80% | Email | Cleanup old logs/backups |
| Firebase Storage > 4GB | Email | Run TTS cache cleanup |
| Redis memory > 200MB | Log warning | Check for memory leak |
| LLM avg latency > 20s | Log warning | Check GPU server load |

### 6.3. Telegram Bot Setup (Optional)

```bash
# Tạo bot via @BotFather, lấy token
# Script gửi alert
send_alert() {
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT_ID}" \
    -d text="🚨 ChatAI Alert: $1"
}
```

---

## 7. Debugging Workflows

### 7.1. Khi user báo lỗi chat

```bash
# 1. Tìm request ID từ user (hiển thị trong error screen)
grep "reqId.*abc-123" /var/log/chatai/app-20260529.log | jq .

# 2. Xem full trace của request đó
grep "sessionId.*session-uuid" /var/log/chatai/app-20260529.log | jq .

# 3. Check .jsonl file nếu cần
cat /var/lib/chatai/sessions/history_session-uuid.jsonl | jq .
```

### 7.2. Khi LLM trả JSON sai

```bash
# Tìm các LLM failure events
grep '"action":"llm_json_parse_fail"' /var/log/chatai/app-*.log | jq '{time, sessionId, raw_response}'
```

### 7.3. Khi TTS chậm

```bash
# Phân tích TTS latency
grep '"metric":"tts_call"' /var/log/chatai/app-*.log | \
  jq -r '[.time, .voice, .cache_hit, .duration_ms] | @csv' | \
  sort -t',' -k4 -rn | head -20
```

---

## 8. Dashboard (Đơn giản — dùng sau khi scale)

Khi vượt 50 users, cân nhắc thêm:
- **Grafana Cloud Free tier** (10K metrics, 50GB logs)
- Export Pino logs → Grafana Loki
- Metrics → Prometheus → Grafana dashboards
- Hoặc **Better Stack** (free tier: 1GB logs/month)

Hiện tại cho beta, **Sentry + structured logs + daily script** là đủ cho solo dev.
