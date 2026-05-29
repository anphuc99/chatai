# ChatAI

Ứng dụng học tiếng Anh qua hội thoại với AI characters, sử dụng voice-first approach.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo / React Native |
| Server | NestJS + Fastify |
| Database | PostgreSQL (Prisma ORM) |
| Cache | Redis (ioredis) |
| Vector DB | ChromaDB |
| LLM | Ollama (local) |
| TTS | GPT-SoVITS (local) |
| Auth | Firebase Auth |
| Storage | Firebase Storage |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start Docker services (Postgres, Redis, ChromaDB)
pnpm docker:up

# Start all apps in dev mode
pnpm dev
```

## Project Structure

```
chatAI/
├── apps/
│   ├── mobile/          # Expo React Native app
│   ├── server/          # NestJS API server
│   └── tts-engine/      # GPT-SoVITS wrapper (future)
├── packages/
│   ├── shared-types/    # Shared TypeScript types
│   └── prompts/         # LLM prompt templates
├── Document/            # Project documentation
└── docker-compose.dev.yml
```

## Documentation

- [Architecture Overview](Document/technical%20documentation/00_overview_architecture.md)
- [Database Schema](Document/technical%20documentation/01_database_schema.md)
- [API Specification](Document/technical%20documentation/04_api_specification.md)
- [Dev Setup Guide](Document/technical%20documentation/12_dev_setup_guide.md)
