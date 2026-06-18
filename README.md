# PanelForge — AI Webtoon Studio

Type a story idea → an AI writes a panel-by-panel webtoon script → each panel is
rendered as illustrated manhwa-style art → you read it as an immersive vertical
scroll. Built on **NestJS + Prisma + PostgreSQL + Redis**.

It runs **for free out of the box**: scripts fall back to a built-in "mock"
writer when no AI key is set, and panel art is generated via a keyless image API.
Add an Anthropic key to get real, prompt-specific writing.

---

## Features

- **AI script generation** — a story idea becomes a structured webtoon script
  (title, logline, per-panel scene + dialogue + caption) via Claude, with a
  graceful **mock fallback** so it works with zero config.
- **Real panel art** — every panel and discovery-card renders an actual
  AI-generated image with a consistent manhwa style suffix + per-episode seed.
- **Backend image proxy + cache** — the server fetches and caches art
  (cache-aside); first hit ~4s, cached hits <2ms, served from your own origin.
- **Immersive reader** — Webtoon/manhwa-inspired UI: discovery grid with
  illustrated covers, genre pills, then a vertical-scroll reader with dialogue
  bubbles + caption boxes overlaid on the art (text never baked into the image).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| ORM / DB | Prisma 6 + PostgreSQL 16 |
| Cache | Redis 7 (ioredis) |
| AI (text) | `@anthropic-ai/sdk` (Claude Sonnet) — optional |
| AI (image) | Pollinations (keyless, Flux model) via a server-side proxy |
| Infra | Docker Compose (Postgres + Redis) |

---

## Prerequisites

- **Node.js 20+**
- **Docker** (for Postgres + Redis) — Docker Desktop on Mac/Windows
- No local Postgres/Redis needed; Docker provides them

## Pull & run

```bash
# 1. clone
git clone <repo-url> panelforge
cd panelforge

# 2. install deps
npm install

# 3. environment
cp .env.example .env          # defaults work as-is for local dev

# 4. start Postgres + Redis (background)
docker compose up -d

# 5. set up the database
npx prisma generate
npx prisma migrate dev        # applies the initial migration

# 6. run the app (watch mode)
npm run start:dev
```

Then open the reader:

> **http://localhost:3005/webtoon/reader**

Type an idea (or tap an example card) and hit **Create**. Panels paint in as the
art generates (2 at a time). Repeat visits load cached art instantly.

### Ports (chosen to avoid clashing with other local stacks)

| Service | Host port |
|---|---|
| API | 3005 |
| Postgres | 5435 |
| Redis | 6381 |

If a port is taken, change it in `docker-compose.yml` / `.env` / `src/main.ts`.

## Turn on real AI writing (optional)

Mock mode writes a generic story arc. For prompt-specific writing:

```bash
# add your key to .env
ANTHROPIC_API_KEY=sk-ant-...
```

Restart the app. The log stops saying "MOCK mode" and Claude writes the script.
Cost is ~$0.02–0.06 per episode (Haiku/Sonnet). Image generation stays free.

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness — pings Postgres + Redis |
| `POST` | `/webtoon/generate` | Story idea → webtoon script (JSON) |
| `GET` | `/webtoon/img` | Cached image proxy (the art) |
| `GET` | `/webtoon/reader` | The reader UI |

Example:

```bash
curl -X POST http://localhost:3005/webtoon/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a duke falls for the maid he mistook for a noblewoman","genre":"Historical","panelCount":6}'
```

## Project structure

```
src/
├── main.ts                  # bootstrap (port 3005)
├── app.module.ts            # root module — wires everything
├── prisma/                  # PrismaService + @Global module (DB layer)
├── redis/                   # RedisService + @Global module (cache layer)
├── health/                  # /health endpoint
└── webtoon/
    ├── webtoon.types.ts     # Panel / WebtoonScript / input shapes
    ├── webtoon.service.ts   # AI script gen (Claude + mock) + image proxy/cache
    ├── webtoon.controller.ts# /generate, /img, /reader  (+ the reader UI)
    └── webtoon.module.ts
```

See **[INTERVIEW.md](INTERVIEW.md)** for a deep technical walkthrough (architecture,
design decisions, and interview talking points).

## Roadmap

- Persist series/episodes/panels to Postgres (Prisma)
- Move the image cache to Redis (survives restarts, shared across instances)
- RAG (pgvector) for series consistency — episodes remember prior canon
- Character-consistent art via a reference-image image model
- Auth + RBAC (creators vs readers), coins to unlock premium episodes
