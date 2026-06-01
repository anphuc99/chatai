# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memori Workflow (mandatory)

This project uses a **Memori** system as long-term AI memory, stored in a VectorDB (Ollama `qwen3-embedding`). Always follow this workflow to avoid repeating past mistakes and to keep design consistent.

**Before starting a new task:** Query Memori for relevant past context:

```bash
node Memori/memori-query.mjs "<short description of the current task>"
```

Read all returned results carefully. Extract principles, conventions, known gotchas, past bugs, and proven solutions. For reviews or bug fixes, query by module name, feature, endpoint, or phase.

**While working:** Do not ignore retrieved Memori context when making decisions.

**After task completion:** Once the feature is stable and approved, create `Memori/docs/task_<name>.md` documenting: what changed, which modules/services were affected, Mermaid diagrams for data flow or class structure if helpful, and any gotchas/regression risks. Then run:

```bash
pnpm memori:sync
```

## Commands

### Root (run from repo root with pnpm)

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start all apps in parallel (server + mobile web + previewer)
pnpm build            # Build all packages and apps
pnpm lint             # Lint all packages and apps
pnpm test             # Run tests across all packages
pnpm format           # Format with Prettier
pnpm clean            # Remove node_modules, dist, .turbo
pnpm docker:up        # Start dev services (Postgres, Redis, ChromaDB)
pnpm docker:down      # Stop dev services
```

### Server (`apps/server`)

```bash
pnpm --filter @chatai/server dev           # Watch mode
pnpm --filter @chatai/server test          # Jest unit tests
pnpm --filter @chatai/server test:cov      # Coverage
pnpm --filter @chatai/server test:e2e      # E2E (Supertest)
pnpm --filter @chatai/server typecheck     # TypeScript check only
pnpm --filter @chatai/server prisma:generate
pnpm --filter @chatai/server prisma:migrate
pnpm --filter @chatai/server prisma:studio
pnpm --filter @chatai/server db:seed
```

### Mobile (`apps/mobile`)

```bash
pnpm --filter @chatai/mobile dev           # Expo start
pnpm --filter @chatai/mobile web           # Expo web (port 19006)
pnpm --filter @chatai/mobile test          # Jest
pnpm --filter @chatai/mobile typecheck     # TypeScript check only
```

### Running a single test file

```bash
pnpm --filter @chatai/server test -- --testPathPattern=chat.controller
pnpm --filter @chatai/mobile test -- --testPathPattern=chat-utils
```

## Architecture

**Monorepo (pnpm workspaces):** `apps/` contains three deployable apps; `packages/` contains shared code.

```text
apps/
  mobile/        React Native + Expo 52 (TypeScript)
  server/        NestJS + Fastify (Node 20, port 3000, prefix /api/v1)
  previewer/     Vite + React web previewer (port 4000)
packages/
  shared-types/  Shared TypeScript interfaces — the contract between client and server
  prompts/       Versioned LLM prompt templates (packages/prompts/src/v1/)
  Memori/        Long-term AI memory system (VectorDB indexer + query tool)
```

### Backend (NestJS)

**Entry:** [apps/server/src/main.ts](apps/server/src/main.ts) → Fastify adapter, port 3000.

Nine feature modules, each following `controller → service → Prisma` pattern:

- **auth** — Firebase ID token verification; all routes are guarded by `FirebaseAuthGuard`
- **users** — User preferences and tutorial state
- **stories** — CRUD + progress tracking
- **characters** — CRUD + voice management + avatar upload (Sharp)
- **chat** — Core orchestrator; delegates to sub-services: `HistoryStore`, `OocService`, `PromptBuilder`, `LlmService`, `ChatSessionService`, `TokenCounter`, `CheckpointService`, `EndChatService`
- **journal** — Session history and vocabulary tracking; written by `EndChatService` after a chat ends
- **tts** — GPT-SoVITS integration; FFmpeg audio processing; BullMQ queue for async synthesis
- **memory** — ChromaDB vector store via LangChain; embeddings with Ollama
- **health** — Healthcheck endpoint

**Key architectural rules:**

- During active chat, nothing is written to Postgres. The chat module writes `.jsonl` files only. `EndChatService` persists to Postgres/ChromaDB when the session closes.
- All mutating endpoints require an `Idempotency-Key` (UUID) header to prevent duplicate operations.
- LLM calls always use JSON mode with Zod schema validation; up to 2 retries on parse failure.
- Firebase ID token must be verified on every request — no exceptions.

### Mobile (React Native + Expo)

**Entry:** [apps/mobile/index.ts](apps/mobile/index.ts) → [apps/mobile/src/App.tsx](apps/mobile/src/App.tsx).

State management: Zustand stores in `src/stores/`. Forms: react-hook-form + Zod validators.

Nine feature slices under `src/features/`: auth, profile, story, character, chat, journal, mission, shop, home. Each slice owns its own API calls (`src/api/`), UI components, and store slice.

**Optimistic UI** is used for lightweight operations with rollback on server error.

### Infrastructure

Docker Compose ([docker-compose.dev.yml](docker-compose.dev.yml)) runs three services required for local development:

- **PostgreSQL 16** — primary database (Prisma ORM)
- **Redis 7** — session cache + BullMQ job queue (ioredis)
- **ChromaDB 0.5.20** — vector store for memory module

External AI services (not in Docker): **Ollama** (local LLM + embeddings) and **GPT-SoVITS** (TTS).

### Shared Types

[packages/shared-types/src/](packages/shared-types/src/) is the single source of truth for interfaces shared between server and mobile. Never duplicate type definitions; import from `@chatai/shared-types` instead.

### Code Conventions

- TypeScript strict mode everywhere; path alias `@/*` maps to `apps/server/src/*` on the server.
- Prettier: 100-char line width, 2 spaces, single quotes, trailing commas.
- Test files: `*.spec.ts` (server), `*.test.ts` (mobile).
- NestJS files: `*.controller.ts`, `*.service.ts`, `*.module.ts`, DTOs in `dto/*.dto.ts`.
- Prompt templates are versioned — new prompts go in `packages/prompts/src/v1/` (or a new version folder); never edit in-place without bumping the version.
