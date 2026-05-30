# Phase 0 — Bootstrap & Foundation

> **Mục tiêu**: Dựng xong khung dự án monorepo, docker services, CI cơ bản để tất cả phase sau cắm vào mà không phải lo hạ tầng.

---

## P0.T1 — Khởi tạo Monorepo + Package Manager

**Status**: `[ ]`  
**Depends on**: Không  

**Mô tả chi tiết**:
1. Tạo thư mục root `chatAI/` với cấu trúc:
   ```
   chatAI/
   ├── apps/
   │   ├── mobile/
   │   ├── server/
   │   └── tts-engine/
   ├── packages/
   │   ├── shared-types/
   │   └── prompts/
   ├── package.json (workspaces)
   ├── pnpm-workspace.yaml
   ├── .gitignore
   ├── .editorconfig
   └── turbo.json (optional nếu dùng Turborepo)
   ```
2. `pnpm init` ở root, khai báo workspaces trong `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```
3. Cài devDependencies ở root: `typescript`, `eslint`, `prettier`, `@typescript-eslint/*`.
4. Tạo `tsconfig.base.json` dùng chung cho server + mobile (path aliases, strict mode).
5. Tạo `.prettierrc` + `.eslintrc.js` ở root (sẽ được extend trong mỗi app).
6. Tạo `.gitignore` bao gồm: `node_modules/`, `dist/`, `.env`, `.expo/`, `android/`, `ios/`, `*.local`.

**Output kiểm chứng**:
- `pnpm install` chạy thành công không lỗi.
- `pnpm -r list` hiện đúng 5 workspaces.

---

## P0.T2 — Setup NestJS Server Skeleton

**Status**: `[ ]`  
**Depends on**: P0.T1  

**Mô tả chi tiết**:
1. Trong `apps/server/`, khởi tạo NestJS project:
   ```bash
   cd apps/server
   pnpm add @nestjs/core @nestjs/common @nestjs/platform-fastify rxjs reflect-metadata
   pnpm add -D @nestjs/cli @nestjs/testing jest @types/jest ts-jest
   ```
2. Tạo cấu trúc thư mục:
   ```
   apps/server/src/
   ├── main.ts
   ├── app.module.ts
   ├── config/
   │   └── configuration.ts          # @nestjs/config, load .env
   ├── shared/
   │   ├── guards/
   │   │   └── auth.guard.ts         # placeholder (verify later)
   │   ├── interceptors/
   │   │   └── request-id.interceptor.ts  # inject X-Request-Id
   │   ├── filters/
   │   │   └── global-exception.filter.ts
   │   └── dto/
   │       └── error-response.dto.ts
   └── modules/
       └── health/
           ├── health.controller.ts   # GET /healthz
           └── health.module.ts
   ```
3. `main.ts`: Sử dụng Fastify adapter, bật CORS, global prefix `/api/v1`, global pipes (ValidationPipe + transform), global filter, global interceptor.
4. Setup `@nestjs/config` với `.env.example`:
   ```env
   NODE_ENV=development
   PORT=3000
   DATABASE_URL=postgresql://chatai:chatai_dev_123@localhost:5432/chatai_dev
   REDIS_URL=redis://localhost:6379
   CHROMA_URL=http://localhost:8000
   FIREBASE_PROJECT_ID=
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-sa.json
   OLLAMA_BASE_URL=http://localhost:11434
   TTS_ENGINE_URL=http://localhost:5000
   ```
5. Cấu hình `jest.config.ts` cho unit tests.
6. Thêm scripts vào `package.json`:
   ```json
   "scripts": {
     "dev": "nest start --watch",
     "build": "nest build",
     "test": "jest",
     "test:e2e": "jest --config jest-e2e.json",
     "lint": "eslint src --ext .ts"
   }
   ```

**Output kiểm chứng**:
- `pnpm dev` (trong apps/server) chạy, `GET /api/v1/healthz` trả `{"status":"ok"}`.
- `pnpm test` pass (ít nhất health controller test).

---

## P0.T3 — Setup Expo React Native Skeleton

**Status**: `[ ]`  
**Depends on**: P0.T1  

**Mô tả chi tiết**:
1. Trong `apps/mobile/`, khởi tạo Expo project:
   ```bash
   npx create-expo-app@latest . --template blank-typescript
   ```
2. Cài dependencies chính:
   ```bash
   pnpm add zustand @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
   pnpm add react-native-screens react-native-safe-area-context
   pnpm add react-hook-form @hookform/resolvers zod
   pnpm add axios
   pnpm add @react-native-async-storage/async-storage
   ```
3. Cấu trúc thư mục:
   ```
   apps/mobile/src/
   ├── api/
   │   ├── client.ts               # axios instance + interceptors
   │   └── endpoints.ts            # base URL config
   ├── components/                  # shared presentational
   ├── features/                    # feature-sliced (trống, tạo folder)
   │   ├── auth/
   │   ├── home/
   │   ├── story/
   │   ├── character/
   │   ├── chat/
   │   ├── journal/
   │   ├── vocabulary/
   │   ├── mission/
   │   ├── shop/
   │   └── profile/
   ├── models/                      # zod schemas + TS interfaces
   ├── navigation/
   │   └── RootNavigator.tsx        # placeholder Stack
   ├── stores/                      # global Zustand stores
   ├── theme/
   │   └── index.ts                 # colors, spacing, typography
   └── utils/
   ```
4. Tạo `src/api/client.ts` — axios instance với:
   - `baseURL` từ env/config.
   - Request interceptor: inject `Authorization: Bearer <token>` từ AuthStore.
   - Response interceptor: bắt 401 → trigger logout.
   - `X-Request-Id` header (uuid).
5. Tạo navigation placeholder: `RootNavigator` với 1 stack chứa HomeScreen (text "Hello").
6. Update `App.tsx` wrap `NavigationContainer` + `SafeAreaProvider`.

**Output kiểm chứng**:
- `npx expo start` chạy, mở trên Expo Go hiển thị "Hello" screen.
- ESLint + TypeScript strict không lỗi.

---

## P0.T4 — Docker Compose cho Dev Services

**Status**: `[ ]`  
**Depends on**: P0.T1  

**Mô tả chi tiết**:
1. Tạo `docker-compose.dev.yml` ở root project với services:
   - **postgres**: Image `postgres:16-alpine`, port 5432, env `POSTGRES_DB=chatai_dev`, `POSTGRES_USER=chatai`, `POSTGRES_PASSWORD=chatai_dev_123`. Volume persist. Healthcheck `pg_isready`.
   - **redis**: Image `redis:7-alpine`, port 6379, `appendonly yes`. Volume persist.
   - **chromadb**: Image `chromadb/chroma:latest`, port 8000, env `IS_PERSISTENT=TRUE`, `ANONYMIZED_TELEMETRY=FALSE`. Volume persist.
2. Tạo `Makefile` hoặc scripts cho tiện:
   ```makefile
   dev-up:
     docker compose -f docker-compose.dev.yml up -d
   dev-down:
     docker compose -f docker-compose.dev.yml down
   dev-reset:
     docker compose -f docker-compose.dev.yml down -v
   ```
3. Đảm bảo `.gitignore` loại trừ volume data.

**Output kiểm chứng**:
- `docker compose -f docker-compose.dev.yml up -d` → 3 containers healthy.
- `psql -h localhost -U chatai -d chatai_dev` kết nối được.
- `redis-cli ping` → `PONG`.
- `curl http://localhost:8000/api/v1/heartbeat` → 200.

---

## P0.T5 — Prisma ORM Setup + First Migration

**Status**: `[ ]`  
**Depends on**: P0.T2, P0.T4  

**Mô tả chi tiết**:
1. Trong `apps/server/`:
   ```bash
   pnpm add @prisma/client
   pnpm add -D prisma
   npx prisma init
   ```
2. Cấu hình `prisma/schema.prisma`:
   ```prisma
   generator client {
     provider = "prisma-client-js"
   }
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Tạo model `UsersMeta` đầu tiên (chỉ model này, các model khác sẽ thêm ở phase tương ứng):
   ```prisma
   model UsersMeta {
     uid              String   @id
     gems             Int      @default(0)
     currentStreak    Int      @default(0) @map("current_streak")
     highestStreak    Int      @default(0) @map("highest_streak")
     streakFreezeCount Int     @default(0) @map("streak_freeze_count")
     lastStreakDate   DateTime? @map("last_streak_date") @db.Date
     tutorialStep     Int      @default(0) @map("tutorial_step")
     createdAt        DateTime @default(now()) @map("created_at")
     updatedAt        DateTime @updatedAt @map("updated_at")
     @@map("users_meta")
   }
   ```
4. Run `npx prisma migrate dev --name init_users_meta`.
5. Tạo `src/shared/prisma/prisma.module.ts` + `prisma.service.ts` (NestJS injectable, extends PrismaClient, implements OnModuleInit).
6. Register `PrismaModule` as global module.

**Output kiểm chứng**:
- Migration file tạo thành công trong `prisma/migrations/`.
- `npx prisma studio` mở được, thấy bảng `users_meta`.
- Inject `PrismaService` vào `HealthController` query `SELECT 1` → pass.

---

## P0.T6 — Redis Module Setup

**Status**: `[ ]`  
**Depends on**: P0.T2, P0.T4  

**Mô tả chi tiết**:
1. Cài dependencies:
   ```bash
   pnpm add ioredis @nestjs-modules/ioredis
   # hoặc dùng cách thủ công:
   pnpm add ioredis
   ```
2. Tạo `src/shared/redis/redis.module.ts`:
   - Sử dụng `ioredis` tạo client từ `REDIS_URL` env.
   - Export injectable `RedisService` wrap client với các method tiện ích: `get`, `set`, `setex`, `del`, `incr`, `setnx` (cho distributed lock).
3. Tạo `src/shared/redis/redis.service.ts`:
   ```typescript
   @Injectable()
   export class RedisService implements OnModuleDestroy {
     private client: Redis;
     // constructor inject config
     async get(key: string): Promise<string | null> { ... }
     async setex(key: string, seconds: number, value: string): Promise<void> { ... }
     async acquireLock(key: string, ttlMs: number): Promise<boolean> { ... }
     async releaseLock(key: string): Promise<void> { ... }
     // ...
   }
   ```
4. Register `RedisModule` as global.
5. Update `HealthController` để check Redis connectivity.

**Output kiểm chứng**:
- `GET /healthz` trả thêm `{"postgres":"ok","redis":"ok"}`.
- Unit test `RedisService` mock ioredis.

---

## P0.T7 — Logger + Global Error Handling + Request Tracing

**Status**: `[ ]`  
**Depends on**: P0.T2  

**Mô tả chi tiết**:
1. Cài `pino` + `pino-pretty` (dev) + `nestjs-pino`:
   ```bash
   pnpm add nestjs-pino pino-http
   pnpm add -D pino-pretty
   ```
2. Tạo `src/shared/logger/logger.module.ts`:
   - Cấu hình `LoggerModule.forRoot()` với:
     - `pinoHttp.genReqId`: lấy từ header `X-Request-Id` hoặc generate UUID.
     - Format: JSON (prod), pretty (dev).
     - Redact: `['req.headers.authorization']`.
3. Cập nhật `GlobalExceptionFilter`:
   - Catch mọi exception, log structured error.
   - Trả response chuẩn: `{ error: { code, message, details } }`.
   - Xử lý riêng: `HttpException`, `ValidationError` (Zod/class-validator), unknown error.
4. Cập nhật `RequestIdInterceptor`:
   - Đọc `X-Request-Id` từ request header.
   - Nếu không có → generate UUID v4.
   - Set vào response header `X-Request-Id`.
   - Gắn vào Pino context.
5. Main.ts: `app.useGlobalFilters()`, `app.useGlobalInterceptors()`, `app.useLogger(app.get(Logger))`.

**Output kiểm chứng**:
- Mọi request log ra structured JSON với `reqId`.
- Throw exception → response đúng format error envelope.
- Request không có `X-Request-Id` → response có header với UUID mới.

---

## P0.T8 — GitHub Actions CI (Lint + Test)

**Status**: `[ ]`  
**Depends on**: P0.T2, P0.T3  

**Mô tả chi tiết**:
1. Tạo `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     lint-and-test:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:16-alpine
           env:
             POSTGRES_DB: chatai_test
             POSTGRES_USER: chatai
             POSTGRES_PASSWORD: test_123
           ports: ['5432:5432']
           options: >-
             --health-cmd pg_isready
             --health-interval 5s
             --health-timeout 3s
             --health-retries 5
         redis:
           image: redis:7-alpine
           ports: ['6379:6379']
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: pnpm
         - run: pnpm install --frozen-lockfile
         - run: pnpm -r run lint
         - run: pnpm --filter server run test
         - run: pnpm --filter mobile run lint
   ```
2. Đảm bảo scripts `lint` và `test` đã được khai báo trong cả `apps/server/package.json` và `apps/mobile/package.json`.
3. Tạo `apps/server/jest.config.ts` với preset ts-jest.

**Output kiểm chứng**:
- Push lên GitHub → Actions chạy xanh.
- Lint error nếu code sai format → CI fail (test thử).

---
