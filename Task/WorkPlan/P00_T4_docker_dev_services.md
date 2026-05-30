# P00.T4 — Docker Compose for Dev Services

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P00.T4 |
| Tên task | Docker Compose cho Postgres + Redis + ChromaDB |
| Phase | 0 |
| Depends on | P00.T1 |
| Complexity | Low |
| Risk | Low |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- `docker-compose.yml` tại root với 3 services: `postgres`, `redis`, `chromadb`.
- Named volumes persistence.
- Healthchecks cho từng service.
- `Makefile` (hoặc npm scripts) cho lệnh `docker:up`, `docker:down`, `docker:logs`, `docker:reset`.

**Out-of-scope**:
- Production K8s/orchestration (phase 13).
- Ollama (chạy local trên máy dev — không Docker theo plan).
- GPT-SoVITS (Docker riêng ở P03.T1).

---

## 3. FILES CẦN TẠO

| # | Path | Loại | Mục đích |
|---|------|------|----------|
| 1 | `docker-compose.yml` | infra | 3 services |
| 2 | `.env.docker.example` | config | Vars cho compose |
| 3 | `scripts/docker-reset.sh` | script | Drop volumes + recreate |
| 4 | `scripts/docker-reset.ps1` | script | Windows variant |
| 5 | `Makefile` | infra | Targets up/down/logs/reset (optional) |
| 6 | (root `package.json` script update) | — | Thêm `docker:up/down/logs` |

---

## 4. SERVICE DIAGRAM

```mermaid
flowchart LR
    Dev[Developer Machine]
    subgraph DockerNetwork[Docker bridge network: chatai_net]
        PG[(postgres:16-alpine<br/>port 5432:5432<br/>vol: pg_data)]
        RD[(redis:7-alpine<br/>port 6379:6379<br/>vol: redis_data)]
        CH[(chromadb/chroma:0.5<br/>port 8000:8000<br/>vol: chroma_data)]
    end
    Dev -- DATABASE_URL --> PG
    Dev -- REDIS_URL --> RD
    Dev -- CHROMA_URL --> CH
```

Không có class — task infra. Bỏ qua section class.

---

## 5. SERVICE SPEC CHI TIẾT

### 5.1. `postgres`

| Field | Value |
|-------|-------|
| image | `postgres:16-alpine` |
| container_name | `chatai_postgres` |
| restart | `unless-stopped` |
| environment | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (từ `.env.docker`) |
| ports | `${POSTGRES_PORT:-5432}:5432` |
| volumes | `pg_data:/var/lib/postgresql/data`, `./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro` (nếu cần) |
| healthcheck | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` interval 10s, timeout 5s, retries 5 |
| networks | `chatai_net` |

### 5.2. `redis`

| Field | Value |
|-------|-------|
| image | `redis:7-alpine` |
| container_name | `chatai_redis` |
| command | `redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru` |
| ports | `${REDIS_PORT:-6379}:6379` |
| volumes | `redis_data:/data` |
| healthcheck | `redis-cli ping \| grep PONG` interval 10s, timeout 3s, retries 5 |
| networks | `chatai_net` |

### 5.3. `chromadb`

| Field | Value |
|-------|-------|
| image | `chromadb/chroma:0.5.20` (pin version) |
| container_name | `chatai_chromadb` |
| ports | `${CHROMA_PORT:-8000}:8000` |
| environment | `IS_PERSISTENT=TRUE`, `ANONYMIZED_TELEMETRY=FALSE` |
| volumes | `chroma_data:/chroma/chroma` |
| healthcheck | `curl -f http://localhost:8000/api/v1/heartbeat` interval 30s, timeout 10s, retries 5 |
| networks | `chatai_net` |

### 5.4. Top-level

```
networks:
  chatai_net:
    driver: bridge

volumes:
  pg_data:
  redis_data:
  chroma_data:
```

### 5.5. `.env.docker.example`

```
POSTGRES_USER=chatai
POSTGRES_PASSWORD=chatai_dev_pw
POSTGRES_DB=chatai
POSTGRES_PORT=5432
REDIS_PORT=6379
CHROMA_PORT=8000
```

### 5.6. NPM scripts add to root `package.json`

```
"docker:up":    "docker compose --env-file .env.docker up -d"
"docker:down":  "docker compose --env-file .env.docker down"
"docker:logs":  "docker compose logs -f --tail=100"
"docker:reset": "docker compose --env-file .env.docker down -v && docker compose --env-file .env.docker up -d"
"docker:ps":    "docker compose ps"
```

---

## 6. SEQUENCE DIAGRAM — Dev workflow

```mermaid
sequenceDiagram
    actor Dev
    participant CLI as pnpm
    participant Compose as docker compose
    participant PG as postgres
    participant RD as redis
    participant CH as chromadb

    Dev->>CLI: pnpm docker:up
    CLI->>Compose: up -d
    Compose->>PG: start container
    Compose->>RD: start container
    Compose->>CH: start container
    PG-->>Compose: healthcheck ok (10-20s)
    RD-->>Compose: healthcheck ok (<5s)
    CH-->>Compose: healthcheck ok (~30s)
    Compose-->>Dev: 3 services running

    Dev->>PG: psql -U chatai (verify)
    Dev->>RD: redis-cli ping (verify)
    Dev->>CH: curl /api/v1/heartbeat (verify)
```

---

## 7. ACCEPTANCE & TEST PLAN

### Acceptance Criteria
- [x] `pnpm docker:up` → 3 containers chạy, status `healthy`.
- [x] `psql postgresql://chatai:chatai_dev_pw@localhost:5432/chatai -c "SELECT 1"` → trả 1.
- [x] `redis-cli -h localhost -p 6379 ping` → PONG.
- [x] `curl http://localhost:8000/api/v1/heartbeat` → 200.
- [x] `pnpm docker:down` → containers tắt, volumes giữ nguyên.
- [x] `pnpm docker:reset` → volumes bị xoá, data sạch.

### Manual Test
1. Tắt mở máy, `docker ps` → containers tự restart (do `unless-stopped`).
2. Restart Postgres container → data còn (volume persist).
3. `pnpm docker:reset` → user trong DB mất, recreate được.

### Không có test code.
