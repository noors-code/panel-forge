# PanelForge — Interview Deep Dive

A complete technical walkthrough so you can explain this project end-to-end and
answer follow-ups with confidence. Read top to bottom once; then rehearse the
"talking points" and "likely questions" out loud.

---

## 1. The 30-second pitch

> "PanelForge is an AI webtoon studio. You describe a story; an LLM writes a
> structured panel-by-panel script; each panel is rendered as manhwa-style art by
> an image model; and you read it as an immersive vertical scroll. It's a NestJS +
> Prisma + Postgres + Redis backend. The interesting engineering is the AI
> integration with a structured-output contract and graceful fallback, and a
> server-side image proxy with a cache-aside layer that took repeat image loads
> from ~4 seconds to under 2 milliseconds."

## 2. Architecture at a glance

```
Browser (reader UI, vanilla JS)
   │  POST /webtoon/generate {prompt, genre, panelCount}
   ▼
NestJS  ── WebtoonController ── WebtoonService
   │                               ├── Claude (@anthropic-ai/sdk)  → structured JSON script
   │                               │      └── falls back to mock writer if no API key
   │                               └── getImage() cache-aside ──► Pollinations (Flux)
   │  GET /webtoon/img?prompt&w&h&seed  (browser hits OUR origin)
   ▼
PrismaService → PostgreSQL      RedisService → Redis      (both @Global, used by /health today)
```

Two AI calls, cleanly separated: **text** (the script) and **image** (the art).
The browser never talks to an AI provider directly — everything is proxied through
the NestJS server.

## 3. Request lifecycle (know this cold)

NestJS pipeline: `Middleware → Guard → Interceptor → Pipe → Controller → Service`.
A `POST /webtoon/generate` today goes straight to the controller (no auth yet),
which delegates to the service. When auth is added, a `JwtAuthGuard` slots into the
Guard stage and a validation `Pipe` validates the body DTO — without touching the
controller logic. Being able to say *where* each future feature plugs in is the point.

## 4. Dependency Injection

`WebtoonController` declares `constructor(private webtoon: WebtoonService)` and
NestJS injects a single shared instance. `PrismaService` and `RedisService` are
`@Global` providers — registered once, available everywhere — because they're
cross-cutting infrastructure. Benefits: testability (inject a mock service),
decoupling, and one shared DB/Redis connection instead of many.

## 5. The AI script integration (the centerpiece)

File: `src/webtoon/webtoon.service.ts → generateScript()`

Design decisions and why:

1. **Structured output contract.** The system prompt pins an exact JSON shape
   (`{title, logline, genre, panels:[{order, scene, dialogue, caption}]}`) and the
   response is `JSON.parse`d. The model returns *data*, not prose, so it drops
   straight into the UI. (Mirrors a real production pattern: the clarity-backend
   `analyzeProposal` uses Anthropic's `json_schema` structured outputs.)

2. **Graceful degradation.** The Anthropic client is created only if
   `ANTHROPIC_API_KEY` is set: `this.anthropic = apiKey ? new Anthropic({apiKey}) : null`.
   With no key, `generateScript` returns a deterministic **mock** that still writes a
   coherent story arc. So the whole app — including the demo — runs at zero cost and
   never hard-crashes on a missing key.

3. **Defensive parsing.** The call is wrapped in try/catch; on any failure (API
   error, no text block, invalid JSON) it logs and **falls back to the mock** rather
   than throwing a 500. The feature degrades, it doesn't die.

4. **Input clamping.** `panelCount` is clamped to 3–12 so a caller can't request a
   1000-panel (expensive) generation.

5. **Model choice.** `claude-sonnet-4-6` — the cost/quality sweet spot for creative
   writing (~$0.06/episode). Swappable to Haiku (cheaper) or Opus (richer) in one line.

## 6. The image proxy + cache (the strongest systems story)

File: `src/webtoon/webtoon.service.ts → getImage()` and `webtoon.controller.ts → GET /webtoon/img`

The problem it solves, in order:

1. **Browser throttling.** Originally the browser requested all 6 panel images
   directly from the image provider at once; the free tier throttles concurrent
   requests per IP, so only the first one or two rendered. Fix part 1: load images
   **sequentially (2 at a time) with retries** on the client.

2. **Reliability + caching + origin.** Fix part 2: route images through the NestJS
   server. The browser hits `GET /webtoon/img?...` on **our** origin; the server
   fetches the art and **caches** it. This is the classic **cache-aside** pattern:

   > check cache → miss → fetch from source → store under the key → return.
   > Repeats skip the slow source entirely.

   Measured live: **first hit ~3950 ms, cached hit ~1.7 ms.** That number is the
   whole "why caching" argument in one sentence.

3. **Why proxying is the right call beyond caching:** hides the provider, avoids
   hotlink/referrer issues, lets us add auth/rate-limiting/S3 later, and gives the
   browser a same-origin URL it can cache too (`Cache-Control: immutable`).

Honest limitations (good to volunteer — shows senior judgment):
- The cache is **in-memory + unbounded** → resets on restart, can grow forever.
  Production fix: cap size / TTL, or move to **Redis** (already wired) or **S3 + CDN**.
- Caching speeds **repeats**, not the cold path; first generation is still
  gated by the image provider's latency.

## 7. The art-consistency technique

Naive per-panel image generation produces a different-looking character every
panel. PanelForge keeps a coherent look with:
- a fixed **style suffix** appended to every prompt (`korean manhwa webtoon
  illustration, soft cel shading, ...`), and
- a **per-episode seed** derived by hashing the title, so all panels in an episode
  share palette/style.

True same-face consistency needs a reference-image/character-sheet model — a known
next step. Being able to explain *why* consistency is the hard part of AI comics
(not raw image quality) is a strong signal.

## 8. The "text as a CSS overlay" decision

Dialogue and captions are **not** baked into the generated image — they're HTML
elements positioned over the art with CSS. Why: image models render text poorly;
overlaying keeps it crisp, restyleable, and trivially **translatable** (swap the
text layer, keep the art). This is also how real webtoon localization works.

## 9. Data / types

`WebtoonScript = { title, logline, genre, panels: Panel[] }` and
`Panel = { order, scene, dialogue, caption }`. `scene` feeds the image model;
`caption` is narration; `dialogue` is speech. The story is told **across** panels
(distributed), not as a prose block — that's the webtoon medium.

The DB (Prisma + Postgres) currently backs `/health` only; the webtoon feature is
intentionally **stateless** in this version. Persisting series/episodes/panels is
the first roadmap item (and a clean place to show schema design + transactions).

## 10. Likely interview questions — and crisp answers

**Q: How do you guarantee valid JSON from an LLM?**
A: A structured-output contract (strict shape in the system prompt; in production,
Anthropic's `json_schema` mode) plus a `JSON.parse` guard that falls back to mock on
failure. The model returns data, not prose.

**Q: What happens if the AI API is down or the key is missing?**
A: The client is null without a key → mock writer. API errors are caught → mock
fallback. The request never 500s on the AI path.

**Q: Why proxy images through your server instead of letting the browser fetch them?**
A: Caching (cache-aside, ~4s→~2ms), reliability/retries server-side, hiding the
provider, avoiding per-IP browser throttling and hotlink issues, and a same-origin
cacheable URL. It's also where I'd add auth, rate-limiting, and S3 storage.

**Q: How does the cache work and what are its limits?**
A: Cache-aside keyed by `WxH:seed:prompt`. It's in-memory and unbounded today —
I'd cap/TTL it or move it to Redis (already in the stack) or S3+CDN for persistence
and multi-instance sharing.

**Q: How would you scale this?**
A: Stateless API behind a load balancer (N instances); move the cache to Redis so
it's shared; push generated art to S3 + CDN; make slow generation a background job
(BullMQ) with the client polling/streaming progress; rate-limit the generate
endpoint; add DB persistence with read replicas for the reader.

**Q: How do you keep characters consistent across panels?**
A: Style suffix + per-episode seed gives a consistent look today; true face
consistency needs a reference-image model (character sheet passed to each panel).

**Q: Why NestJS?**
A: Opinionated structure (modules/DI), first-class TypeScript, guards/pipes/
interceptors map cleanly onto auth/validation/cross-cutting concerns — it scales
from this to a large modular monolith without rearchitecting.

## 11. What I'd build next (shows direction)

1. Persist series/episodes/panels (Prisma schema + transactions).
2. Redis-backed image cache (survives restarts, shared across instances).
3. RAG with pgvector so episode N remembers prior canon (series consistency).
4. Background generation (BullMQ) so the UI streams progress instead of blocking.
5. Auth + RBAC (creators vs readers) and coins to unlock premium episodes
   (Stripe authorize/capture + webhooks + idempotency).

Each of these is a self-contained, demonstrable systems topic.
