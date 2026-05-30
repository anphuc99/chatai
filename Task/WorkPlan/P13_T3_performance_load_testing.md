# P13.T3 — Performance Optimization + Load Testing

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P13.T3 |
| Phase | 13 |
| Depends on | P13.T2 |
| Complexity | Medium |
| Risk | Medium (regression introduced by tuning) |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- Server tuning: Prisma pool, Redis pipeline batching, response gzip, index audit.
- Client tuning: FlatList virtualization, image cache, audio cleanup, bundle analyzer.
- Load testing scenarios with k6: chat send, TTS, vocab save, SSE concurrency.
- Sentry setup (mobile + server).
- Performance budgets documented + asserted.

**Out-of-scope**: New features, refactors not driven by profiling.

---

## 3. FILES CẦN TẠO / SỬA

| # | Path |
|---|------|
| 1 | `apps/server/src/main.ts` — enable compression plugin |
| 2 | `apps/server/prisma/schema.prisma` — audit/add indexes (verified per query) |
| 3 | `apps/server/src/common/redis/redis-pipeline.helper.ts` |
| 4 | `apps/server/src/sentry.ts` |
| 5 | `apps/server/src/modules/monitoring/metrics.service.ts` |
| 6 | `apps/mobile/src/features/chat/components/MessageList.tsx` — FlatList opts |
| 7 | `apps/mobile/src/core/sentry.ts` |
| 8 | `apps/mobile/App.tsx` — Sentry init wrapper |
| 9 | `load-tests/k6/chat-send.js` |
| 10 | `load-tests/k6/tts-batch.js` |
| 11 | `load-tests/k6/vocab-save.js` |
| 12 | `load-tests/k6/sse-concurrency.js` |
| 13 | `Document/technical documentation/perf_budgets.md` |
| 14 | `Document/technical documentation/load_test_runbook.md` |

---

## 4. PERFORMANCE BUDGETS

```
Server SLOs (p95):
  POST /chat/.../messages         < 3500 ms (incl LLM ~2-3s)
  GET /chat/.../history           < 250 ms
  POST /vocabulary/save           < 200 ms
  GET /missions/today             < 200 ms
  GET /shop/items                 < 200 ms
  GET /realtime/stream connect    < 500 ms
  POST /chat/.../shop-choice      < 4000 ms

Mobile:
  Cold start                      < 3s on mid-range Android
  Cold to first chat bubble       < 5s
  Audio playback start lag        < 500ms after fetch
  FlatList 1000 messages          60fps scroll

Resources:
  Server memory steady-state      < 700 MB
  Server CPU avg                  < 70%
  Mobile JS heap                  < 200 MB
```

---

## 5. CHI TIẾT — Server

### 5.1. Compression

```
import compression from '@fastify/compress'
await app.register(compression, { encodings: ['gzip','deflate'] })
```

### 5.2. Prisma pool

```
DATABASE_URL=postgresql://...?connection_limit=10&pool_timeout=10
```

Document trong env reference.

### 5.3. Index audit checklist

Run `EXPLAIN ANALYZE` cho hot queries; ensure indexes:

- `sessions(user_id, story_id, status)` — finding active session
- `messages(session_id, turn_order)` — history fetch
- `vocabulary(user_id, status, next_review_date)` — due query
- `user_missions(user_id, for_date)` — today fetch
- `shop_transactions(user_id, created_at)` — history
- `chat_sessions(user_id, status, ended_at desc)` — journal pagination

Add missing in migration.

### 5.4. Redis pipeline helper

```
async pipelineExec(ops: ((p: Pipeline)=>void)[]): Promise<any[]> {
  const p = redis.pipeline()
  for (const op of ops) op(p)
  return await p.exec()
}
```

Use cho OOC pull (LRANGE + DEL) — already Lua script in P04.T3; verify.

### 5.5. Sentry server

```
Sentry.init({
  dsn: env.SENTRY_DSN_SERVER,
  tracesSampleRate: 0.1,
  integrations: [Sentry.httpIntegration(), Sentry.prismaIntegration()]
})
app.useGlobalFilters(new SentryExceptionFilter())
```

Custom tags: userId, sessionId where available.

### 5.6. Metrics endpoint

```
GET /internal/metrics (basic-auth) → prom-client default + custom:
  - chat_request_duration_seconds histogram
  - tts_cache_hit_rate gauge
  - llm_latency_seconds histogram (model label)
  - sse_active_connections gauge
  - embed_cache_hit_rate gauge
```

## 6. CHI TIẾT — Client

### 6.1. FlatList optimization

```
<FlatList
  data={messages}
  inverted
  removeClippedSubviews
  initialNumToRender={15}
  maxToRenderPerBatch={10}
  windowSize={10}
  keyExtractor={item => item.id}
  getItemLayout={undefined}  // dynamic height; consider FlashList instead
  ...
/>
```

Consider migrating to `@shopify/flash-list` for large message volumes.

### 6.2. Image caching

Replace `Image` with `expo-image`:
```
<Image source={{ uri: url, cachePolicy: 'memory-disk' }} ... />
```

### 6.3. Audio cleanup

Verify `PlaybackQueueManager` (P05.T1) calls `sound.unloadAsync()` after each playNext.

### 6.4. Bundle analysis

```
npx expo export --dump-sourcemap
npx source-map-explorer dist/_expo/static/js/*.js
```

Remove unused imports (e.g., lodash full → lodash-es per-method).

### 6.5. Sentry mobile

```
import * as Sentry from '@sentry/react-native'
Sentry.init({
  dsn: Constants.expoConfig.extra.SENTRY_DSN_MOBILE,
  tracesSampleRate: 0.2,
  enableAutoSessionTracking: true,
})
Sentry.setUser({ id: userId })  // after login
export default Sentry.wrap(App)
```

## 7. LOAD TESTING

### 7.1. k6 scenarios

```js
// chat-send.js
export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: { http_req_duration: ['p(95)<3500'] }
}
export default function() {
  // login token (pre-seeded), open session, send 5 messages with sleep
}
```

Similar files cho tts-batch (POST TTS pre-cached + miss), vocab-save (parallel saves), sse-concurrency (100 SSE clients).

### 7.2. Run plan

```
docker compose up server postgres redis chroma ollama tts
k6 run load-tests/k6/chat-send.js
k6 run load-tests/k6/tts-batch.js
k6 run load-tests/k6/vocab-save.js
k6 run load-tests/k6/sse-concurrency.js
```

Capture metrics → compare against budgets.

### 7.3. Bottleneck triage matrix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| p95 chat > 5s | LLM model size | Quantize / smaller model / streaming |
| TTS slow | cold cache | warm seed common phrases |
| DB CPU high | missing index | add per EXPLAIN |
| Redis OOM | OOC TTL too long | shrink to 12h |
| SSE 100+ users high RAM | per-user Subject | move to Redis pub/sub |

---

## 8. SEQUENCE — N/A (cross-cutting)

---

## 9. ACCEPTANCE & TEST PLAN

- [ ] All perf budgets met under k6 nominal load.
- [ ] No memory leak: 1h continuous run, RSS stable.
- [ ] Sentry captures forced test error (server + mobile).
- [ ] /internal/metrics exposes counters.
- [ ] Bundle size mobile < 25 MB.
- [ ] Index audit documented; missing ones added.
- [ ] perf_budgets.md committed.
- [ ] load_test_runbook.md committed.
