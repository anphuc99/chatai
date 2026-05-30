# P13.T4 — Final QA + Build + Deploy Prep

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P13.T4 |
| Phase | 13 |
| Depends on | P13.T3 |
| Complexity | Medium |
| Risk | High (release-critical) |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- Full regression test matrix.
- Security audit (deps, Firestore rules, Storage rules, auth coverage, PII in logs, user isolation).
- EAS Build configuration (dev/preview/prod) + first prod build smoke test.
- Server Dockerfile (multi-stage), docker-compose.prod.yml.
- Production env vars reference doc.
- DB migration deployment strategy (Prisma).
- Backup strategy (pg_dump cron + S3).
- Final docs review (README, API, runbook).

---

## 3. FILES CẦN TẠO / SỬA

| # | Path |
|---|------|
| 1 | `apps/server/Dockerfile` |
| 2 | `apps/server/.dockerignore` |
| 3 | `docker-compose.prod.yml` |
| 4 | `apps/mobile/eas.json` |
| 5 | `apps/mobile/app.config.ts` — production env mapping |
| 6 | `Document/technical documentation/qa_checklist.md` |
| 7 | `Document/technical documentation/security_audit.md` |
| 8 | `Document/technical documentation/env_reference.md` |
| 9 | `Document/technical documentation/db_migration_runbook.md` |
| 10 | `Document/technical documentation/backup_restore_runbook.md` |
| 11 | `Document/technical documentation/release_runbook.md` |
| 12 | `README.md` — final polish |
| 13 | `firestore.rules` — final review (verify P01.T4) |
| 14 | `storage.rules` |
| 15 | `scripts/backup-postgres.sh` |
| 16 | `.github/workflows/server-ci.yml` (optional) |
| 17 | `.github/workflows/mobile-ci.yml` (optional) |

---

## 4. QA CHECKLIST (qa_checklist.md)

Phase-by-phase happy path verification:

```
Phase 1 — Auth:
  [ ] Google sign-in iOS + Android
  [ ] Session expired refresh
  [ ] Sign out clears local data
Phase 2 — Story/Character:
  [ ] CRUD story
  [ ] CRUD character
  [ ] Image upload to Firebase Storage
Phase 3 — Home/Profile/TTS:
  [ ] Home renders streak + missions
  [ ] TTS plays in correct voice
  [ ] Cached TTS fast on replay
Phase 4 — Chat MVP:
  [ ] Start session, send message, end session
  [ ] Multi-character batch
  [ ] OOC persistent + ephemeral
Phase 5 — Chat UI/Playback:
  [ ] Sequential audio + bubble timing
  [ ] Pinyin overlay
  [ ] Translation slide
  [ ] Tap word tooltip + save
Phase 6 — Checkpoint:
  [ ] Auto checkpoint at threshold
  [ ] Memory summary injected in prompt
Phase 7 — End Chat & Journal:
  [ ] End atomic + idempotent
  [ ] Journal list paginate
  [ ] Journal detail render read-only
Phase 8 — Memory RAG:
  [ ] Memory write after end
  [ ] Memory retrieve in new session
  [ ] User isolation
Phase 9 — Auto/Shop:
  [ ] Auto loop continues + stop
  [ ] Shop event card buy/decline
  [ ] Insufficient gems handling
Phase 10 — Vocab SRS:
  [ ] Save dedup
  [ ] Review session full flow
  [ ] SRS advance/reset
Phase 11 — Mission/Streak/Shop:
  [ ] Mission auto-progress
  [ ] Claim → gems
  [ ] Streak +1 daily, freeze consume
  [ ] SSE realtime
Phase 12 — Tutorial:
  [ ] 7 steps end-to-end
  [ ] Skip works
Phase 13 polish:
  [ ] STT voice input
  [ ] Streaming chat
Cross-cutting:
  [ ] Offline graceful errors
  [ ] Rate limits enforced
  [ ] All endpoints require auth
  [ ] No console errors on happy path
```

---

## 5. SECURITY AUDIT (security_audit.md)

```
[ ] pnpm audit (server + mobile) — no critical
[ ] Firestore rules tested with emulator: cross-user denied
[ ] Storage rules: avatars/{uid}/** read public OR signed; write only by owner
[ ] All controllers @UseGuards(FirebaseAuthGuard) — grep verify
[ ] Idempotency-key validated as random; no replay vectors
[ ] CORS allowlist set in prod
[ ] Helmet headers enabled
[ ] Rate limits per route audited (table)
[ ] No PII in logs (verify pino redact: email, password, token, idToken, phone)
[ ] SQL injection: all queries via Prisma; verify raw queries parameterized
[ ] Prompt injection guard: user inputs in system prompt wrapped in explicit "USER INPUT:" block
[ ] File upload: type whitelist (image/jpeg, image/png, audio/m4a), size cap
[ ] Firebase service account JSON: not in repo, in secret store
[ ] JWT verify Firebase Admin SDK (offline cert refresh)
[ ] Ollama endpoint not publicly exposed (internal network only)
```

---

## 6. DOCKERFILE (server)

```dockerfile
# Multi-stage
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY apps/server/ apps/server/
COPY tsconfig.base.json ./
RUN pnpm --filter server prisma generate
RUN pnpm --filter server build

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable pnpm
ENV NODE_ENV=production
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/prisma apps/server/prisma
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
EXPOSE 3000
USER node
CMD ["node", "apps/server/dist/main.js"]
```

`docker-compose.prod.yml`: services {server, postgres, redis, chroma, ollama, tts-engine}, named volumes, restart policies, healthchecks.

---

## 7. EAS BUILD (eas.json)

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "env": { "API_URL": "http://10.0.2.2:3000" } },
    "preview": { "distribution": "internal", "channel": "preview", "env": { "API_URL": "https://preview-api.example.com" } },
    "production": { "channel": "production", "autoIncrement": true, "env": { "API_URL": "https://api.example.com" } }
  },
  "submit": { "production": {} }
}
```

`app.config.ts` reads `process.env.API_URL`, `SENTRY_DSN_MOBILE`, `ENABLE_STT`, `ENABLE_LLM_STREAMING`.

---

## 8. DB MIGRATION RUNBOOK

```
Pre-deploy:
  1. Backup current DB: ./scripts/backup-postgres.sh
  2. Review migration SQL: prisma migrate diff
  3. Test on staging clone

Deploy:
  1. docker compose -f docker-compose.prod.yml run --rm server pnpm prisma migrate deploy
  2. Validate: pnpm prisma migrate status
  3. Restart server

Rollback:
  1. Restore backup: psql < backup_<ts>.sql
  2. Revert code
  3. Restart
```

---

## 9. BACKUP STRATEGY

```
scripts/backup-postgres.sh (run via cron 02:00 daily):
  #!/bin/bash
  TS=$(date +%F-%H%M)
  pg_dump $DATABASE_URL | gzip > /backups/db_$TS.sql.gz
  aws s3 cp /backups/db_$TS.sql.gz s3://$BACKUP_BUCKET/postgres/
  find /backups -mtime +14 -delete

Verify weekly: restore to staging container.
Retention: 30 daily, 12 weekly, 6 monthly.
```

---

## 10. RELEASE RUNBOOK

```
1. Cut release branch from main: git checkout -b release/v1.0.0
2. Bump version: server package.json + mobile app.config.ts
3. Update CHANGELOG.md
4. Tag: git tag v1.0.0
5. Server:
   - Build image: docker build -t chatai/server:v1.0.0 ./apps/server
   - Push: docker push
   - Deploy: docker compose pull && docker compose up -d
   - Migrate (see db_migration_runbook)
   - Smoke test: curl /health
6. Mobile:
   - eas build --profile production --platform all
   - Internal QA on built artifact
   - eas submit --profile production
7. Tag Sentry release.
8. Monitor 24h: error rate, latency, mission claims, end chat success.
```

---

## 11. ACCEPTANCE & TEST PLAN

- [ ] QA checklist 100% pass.
- [ ] Security audit checklist 100% pass.
- [ ] `docker build` server image < 250MB.
- [ ] Prod EAS build runs on real Android device.
- [ ] Migrate on fresh DB → all migrations apply clean.
- [ ] Backup script produces gzipped dump < 100MB.
- [ ] Restore from backup → app fully functional.
- [ ] README has working quick-start instructions for new dev.
- [ ] All docs cross-link correctly.
- [ ] Sentry receives production-test event.
- [ ] CI workflows (if added) green.

---

## 12. EXIT CRITERIA

Project considered v1.0.0 ready when:
1. All 13 phases tasks DONE.
2. Acceptance gates phase 13 (T1-T4) green.
3. 1 week stability run on staging với synthetic load.
4. Release runbook executed once in staging successfully.
