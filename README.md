# StarPal Analytics (SaaS)

Multi-tenant analytics for StarPal avatar conversations. Clients (e.g.
**Willemse** — French garden / plants e-commerce) log in and see analytics for
**their own Pals only**. Intended to live as a sub-module of the StarPal site at
**`starpal.ai/analytics`**.

It is a **read-only consumer** of the upstream StarPal `pal-maker-api`
(`/stat/pal`, `/stat/export`). It never modifies that API.

## Roles & tenancy

| Role | Sees | Can do |
|---|---|---|
| **STAFF** (StarPal) | all Pals | provision clients, attach Pals, create users |
| **CLIENT** (e.g. Willemse) | only their client's Pals | view analytics, export, classify, score |

> 🔒 The upstream API has **no auth** and lets anyone with a `palId` read that
> Pal's data. This backend is the security boundary: login (JWT in an HttpOnly
> cookie) + **server-side tenant checks**. Every data request re-resolves the
> caller's allowed `palId`s from the database and returns **403** for anything
> outside them — the browser never sends a trusted `palId` (a CLIENT only ever
> picks from their own Pals). The Anthropic key stays server-side; LLM results
> are cached.

## Layout (standalone project root)

```
.                         ← repo root: a complete, standalone project
  package.json            root build/start (used by Railway)
  railway.json            Railway deploy (one combined service + Postgres)
  .env                    single shared env (copy from .env.example)
  server/                 Express API: auth + multi-tenant proxy + LLM + cache
    prisma/schema.prisma  Client / Pal / User (multi-tenant model)
    src/auth/             JWT, bcrypt, requireAuth/requireStaff, tenant checks
    src/routes/           auth.routes (login), admin.routes (provisioning)
    src/config.ts         <-- ALL event-schema / taxonomy / model assumptions
    src/index.ts          Express app: auth gate + palId authz + serves web
    scripts/discover.ts   dev-only event-schema discovery tool
    scripts/seed.ts       creates the first STAFF account
  web/                    Vite + React + TS dashboard (login, picker, admin)
```

## Setup

```bash
cp .env.example .env       # fill DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, ...
cd server && npm install
npx prisma db push         # create tables
npm run seed               # create the first STAFF account (from STAFF_* env)
cd ../web && npm install
```

Both apps read the single root `.env`. Vite exposes only `VITE_*` to the
browser, so `ANTHROPIC_API_KEY` / `JWT_SECRET` never ship to the client.

## Run

```bash
# terminal 1 — backend (default :8787, base /analytics)
cd server && npm run dev

# terminal 2 — frontend (default :5173, base /analytics)
cd web && npm run dev
```

Open the web dev URL, log in with the seeded STAFF account, go to
**Administration** → create a client (e.g. Willemse), attach their Pal(s), and
create a CLIENT user. That user then logs in and sees only their Pals.

Production / combined: from the repo root, `npm run build` then `npm start`
(the backend serves the built web app on one port under `/analytics`).

## Discovery — DO THIS FIRST for any new Pal

We know the event envelope `{ sessionId, eventName, eventData, created }` but
**not** which `eventName` holds the user's question vs. the agent's answer. The
discovery script calls `/stat/export` over a wide date range and prints every
distinct `eventName` with its count and one sample `eventData`:

```bash
cd server
npm run discover -- --palId <PAL_ID> [--from <ms>] [--to <ms>]
```

Then encode the result in **`server/src/config.ts → eventSchema`** — the single
place event-schema assumptions live (no magic strings elsewhere):

```ts
export const eventSchema = {
  userQuestion: { names: ["<question_event_name>"], textPath: "eventData.text" },
  agentAnswer:  { names: ["<answer_event_name>"],   textPath: "eventData.text" },
};
```

`textPath` is resolved with a safe dotted-path getter (`src/lib/path.ts`), e.g.
`eventData.text`, `eventData.message.content`. Until real values are filled in
(placeholders start with `TODO_`), `isEventSchemaConfigured()` returns false and
the UI shows **"Aucun événement Q/R reconnu — vérifiez config.ts"** instead of
empty charts.

> The discovery script is the **only** place that prints full conversation
> text. Production request paths never log conversation content.

## Q&A pairing

Within a `sessionId`, events are sorted by `created`; each user-question event
is paired with the next agent-answer event before the following question. Output
is `Turn { sessionId, question, answer, askedAt, answeredAt, status }`. Unpaired
questions are kept and flagged `no_answer`; orphan answers are kept separately.
Nothing is dropped. (`server/src/lib/pairing.ts`)

## Configurable in `config.ts`

| Export | Purpose |
|---|---|
| `eventSchema` | question/answer event names + text paths (**edit after discovery**) |
| `questionTaxonomy` | French question-type labels (Req 2) |
| `relevanceFlags` | fixed relevance flag set (Req 3) |
| `models` | `ANTHROPIC_MODEL` (typing) / `ANTHROPIC_JUDGE_MODEL` (judging) |
| `knownPals` | optional dropdown in the top bar (no list-pals endpoint upstream) |
| `batching` | batch sizes for classification / relevance calls |

**Models:** confirm exact current Anthropic model IDs before relying on the
defaults — they change. Defaults: `claude-haiku-4-5` (typing) and
`claude-sonnet-4-6` (judging), overridable via env.

## Backend API (under `<BASE_PATH>/api`)

Auth is a session cookie set by `/api/auth/login`. Data routes require a valid
session **and** that `body.palId` is one the caller is allowed to see.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | liveness + config status |
| `POST /api/auth/login` | none | email + password → sets session cookie |
| `POST /api/auth/logout` | none | clears the session cookie |
| `GET /api/auth/me` | session | current user |
| `GET /api/config` | session | taxonomy, flags, models, **the caller's own Pals**, role |
| `POST /api/stat/pal` | session + palId | proxy → session stats (404 → empty) |
| `POST /api/stat/export` | session + palId | proxy → raw events (404 → empty) |
| `POST /api/turns` | session + palId | export + pair Q&A → turns + meta |
| `POST /api/classify` | session + palId | `{ palId, questions[] }` → types (cached) |
| `POST /api/relevance` | session + palId | `{ palId, pairs[] }` → scores (cached) |
| `GET/POST /api/admin/*` | STAFF | provision clients, Pals, users |

A request for a `palId` outside the caller's scope returns **403**. 404 upstream
is an **empty state**, not an error; network / 5xx surface as `502` → UI banner.

## Caching

Classification and relevance results are cached on disk under `server/.cache/`,
keyed by SHA-256 of the question text (typing) or `question + "\n" + answer`
(relevance). Re-runs hit the cache and cost no tokens. Relevance is **never**
auto-scored on load — the analyst uses "Score sample of N" / "Score all".

## Env

See [`.env.example`](./.env.example): `DATABASE_URL`, `JWT_SECRET`,
`STAFF_EMAIL`, `STAFF_PASSWORD`, `STARPAL_API_BASE`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`, `ANTHROPIC_JUDGE_MODEL`, `PORT`, `BASE_PATH`, `NODE_ENV`,
`VITE_BASE_PATH`, (optional) `VITE_API_BASE`.

## Hosting on Railway (its own project + Postgres)

Deploys as **one combined service** (Express serves the built React app on one
port under `/analytics`) plus a **Postgres** plugin, in its **own Railway
project** — independent of every other app.

1. **New Railway project** → add a **PostgreSQL** plugin.
2. **Deploy from GitHub** → select the `analytics` repo (Root Directory `/`).
   Railway reads the root `railway.json`:
   - build: `cd server && npm install && npm run build && cd ../web && npm install && npm run build`
   - pre-deploy: `prisma db push` + `npm run seed` (creates tables + STAFF user)
   - start: `cd server && npm start`
   - health-check: `GET /analytics/api/health`
3. Set the service **Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | reference the Postgres plugin's URL |
   | `JWT_SECRET` | a long random secret (`openssl rand -hex 32`) |
   | `STAFF_EMAIL` / `STAFF_PASSWORD` | the first StarPal admin login |
   | `STARPAL_API_BASE` | `https://pal-maker-api-dot-symbolic-fire-99808.appspot.com` |
   | `ANTHROPIC_API_KEY` | your key (server-side only) |
   | `ANTHROPIC_MODEL` | `claude-haiku-4-5` |
   | `ANTHROPIC_JUDGE_MODEL` | `claude-sonnet-4-6` |
   | `BASE_PATH` | `/analytics` |
   | `VITE_BASE_PATH` | `/analytics/` |
   | `NODE_ENV` | `production` |

   `PORT` is injected by Railway. `VITE_*` vars are read at **build** time and
   only those reach the browser; `ANTHROPIC_API_KEY` / `JWT_SECRET` stay
   server-side.
4. Deploy. Log in with the STAFF account, provision Willemse + their Pals + a
   CLIENT user.

### Serving at `starpal.ai/analytics`

The app is built and served under the `/analytics` base path. To expose it on
the main domain, point a reverse proxy / route for `starpal.ai/analytics/*` at
this Railway service. The session cookie is `SameSite=Lax`, `Secure` in
production, and `trust proxy` is enabled so it works behind the proxy.

> The LLM cache (`server/.cache/`) is on ephemeral storage and resets on
> redeploy. For persistence, attach a Railway volume at `/app/server/.cache`.
