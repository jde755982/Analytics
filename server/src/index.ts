/**
 * StarPal Analytics — SaaS backend (multi-tenant).
 *
 * Why this server exists (the upstream pal-maker-api has none of these):
 *   - real auth: login/password (JWT in HttpOnly cookie), per-client isolation
 *   - keeps ANTHROPIC_API_KEY server-side (classification never reaches browser)
 *   - caches LLM results on disk
 *
 * Tenancy: every data request resolves the caller's allowed palIds from the DB
 * and rejects any palId outside that set (assertPal). The browser never sends a
 * trusted palId — a CLIENT can only ever read their own client's pals.
 *
 * It ONLY consumes the upstream read endpoints (/stat/pal, /stat/export).
 *
 * Served under a configurable base path (BASE_PATH, default "/analytics") so it
 * can live at starpal.ai/analytics behind a reverse proxy.
 *
 * Note: we deliberately do NOT log conversation text on production paths. The
 * discovery script (scripts/discover.ts) is the dev-only exception.
 */
import "./env.js"; // MUST be first: populates process.env before config.ts loads
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response, Router } from "express";

import { models, questionTaxonomy, relevanceFlags, isEventSchemaConfigured } from "./config.js";
import { classifyQuestions } from "./classify.js";
import { scorePairs, type Pair } from "./relevance.js";
import { hasAnthropicKey } from "./lib/anthropic.js";
import { pairEvents } from "./lib/pairing.js";
import { statExport, statPal, UpstreamEmptyError } from "./lib/upstream.js";
import { authRouter } from "./routes/auth.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { isPalAllowed, listVisiblePals, requireAuth } from "./auth/middleware.js";
import type { SessionUser } from "./auth/auth.js";

const app = express();
app.set("trust proxy", 1); // behind starpal.ai reverse proxy → correct secure-cookie handling
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

const PORT = Number(process.env.PORT ?? 8787);
// Base path the app is served under (must match the web build's `base`).
const BASE_PATH = (process.env.BASE_PATH ?? "/analytics").replace(/\/$/, "");

const api = Router();

/** Health check is intentionally unauthenticated. */
api.get("/health", (_req, res) => {
  res.json({ ok: true, schemaConfigured: isEventSchemaConfigured(), anthropic: hasAnthropicKey() });
});

// Login / logout / me.
api.use("/auth", authRouter);
// Staff-only provisioning (clients, pals, users).
api.use("/admin", adminRouter);

// Everything below requires a valid session.
api.use(requireAuth);

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/**
 * Tenancy gate: validate body.palId belongs to the caller. Returns the palId on
 * success; on failure it has already sent 400/403 and returns null.
 */
async function assertPal(req: Request, res: Response): Promise<string | null> {
  const palId = req.body?.palId;
  if (typeof palId !== "string" || !palId) {
    res.status(400).json({ error: "palId requis." });
    return null;
  }
  const allowed = await isPalAllowed(req.user as SessionUser, palId);
  if (!allowed) {
    res.status(403).json({ error: "Accès refusé à ce Pal." });
    return null;
  }
  return palId;
}

/** UI bootstrap: taxonomy/flags/models + the caller's OWN visible pals. */
api.get(
  "/config",
  wrap(async (req, res) => {
    const pals = await listVisiblePals(req.user as SessionUser);
    res.json({
      taxonomy: questionTaxonomy,
      relevanceFlags,
      // Only pals this user may see — replaces the old free palId input.
      pals: pals.map((p) => ({ palId: p.palId, label: p.label, client: p.client.name })),
      models,
      role: req.user!.role,
      email: req.user!.email,
      schemaConfigured: isEventSchemaConfigured(),
      anthropicEnabled: hasAnthropicKey(),
    });
  }),
);

/** Proxy: aggregated session stats. 404 upstream -> empty state (not error). */
api.post(
  "/stat/pal",
  wrap(async (req, res) => {
    const palId = await assertPal(req, res);
    if (!palId) return;
    const { excludeEmpty, from, to } = req.body ?? {};
    try {
      res.json(await statPal({ palId, excludeEmpty, from, to }));
    } catch (err) {
      if (err instanceof UpstreamEmptyError) {
        res.json({ sessions: [], totalSessions: 0, totalNonEmptySessions: 0, empty: true });
        return;
      }
      throw err;
    }
  }),
);

/** Proxy: raw event stream. 404 upstream -> empty state. */
api.post(
  "/stat/export",
  wrap(async (req, res) => {
    const palId = await assertPal(req, res);
    if (!palId) return;
    const { from, to } = req.body ?? {};
    try {
      res.json(await statExport({ palId, from, to }));
    } catch (err) {
      if (err instanceof UpstreamEmptyError) {
        res.json({ events: [], empty: true });
        return;
      }
      throw err;
    }
  }),
);

/** Derived: fetch the event stream and return paired Q&A turns + meta. */
api.post(
  "/turns",
  wrap(async (req, res) => {
    const palId = await assertPal(req, res);
    if (!palId) return;
    const { from, to } = req.body ?? {};
    try {
      const { events } = await statExport({ palId, from, to });
      const result = pairEvents(events ?? []);
      res.json({ ...result, rawEvents: events ?? [] });
    } catch (err) {
      if (err instanceof UpstreamEmptyError) {
        res.json({
          turns: [],
          orphanAnswers: [],
          unpairedQuestionCount: 0,
          eventNameCounts: {},
          totalEvents: 0,
          schemaConfigured: isEventSchemaConfigured(),
          voiceShare: null,
          rawEvents: [],
          empty: true,
        });
        return;
      }
      throw err;
    }
  }),
);

/** Question-type classification (cached). Body: { palId, questions: string[] }. */
api.post(
  "/classify",
  wrap(async (req, res) => {
    // palId scoping: classification is content the caller already pulled, but we
    // still require an allowed palId so the endpoint can't be used standalone.
    if (!(await assertPal(req, res))) return;
    const questions = req.body?.questions;
    if (!Array.isArray(questions)) {
      res.status(400).json({ error: "questions[] requis." });
      return;
    }
    if (!hasAnthropicKey()) {
      res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée." });
      return;
    }
    res.json({ results: await classifyQuestions(questions as string[]) });
  }),
);

/** Answer-relevance scoring (cached). Body: { palId, pairs: {question,answer}[] }. */
api.post(
  "/relevance",
  wrap(async (req, res) => {
    if (!(await assertPal(req, res))) return;
    const pairs = req.body?.pairs;
    if (!Array.isArray(pairs)) {
      res.status(400).json({ error: "pairs[] requis." });
      return;
    }
    if (!hasAnthropicKey()) {
      res.status(503).json({ error: "ANTHROPIC_API_KEY non configurée." });
      return;
    }
    res.json({ results: await scorePairs(pairs as Pair[]) });
  }),
);

// JSON 404 for unmatched API routes (so SPA fallback never swallows them).
api.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Mount the API under <BASE_PATH>/api.
app.use(`${BASE_PATH}/api`, api);

// Serve the built web app under BASE_PATH (combined single-service deploy).
const webDist = process.env.WEB_DIST ?? resolve(process.cwd(), "../web/dist");
if (existsSync(webDist)) {
  app.use(BASE_PATH, express.static(webDist));
  // SPA fallback for client-side routing under the base path.
  app.get(`${BASE_PATH}/*`, (_req, res) => res.sendFile(join(webDist, "index.html")));
  // Convenience redirect from root to the app.
  app.get("/", (_req, res) => res.redirect(BASE_PATH));
  console.log(`Serving web build from ${webDist} under ${BASE_PATH}`);
}

// Centralized error handler -> 502 so the frontend shows a banner.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  console.error("[error]", message); // never include conversation text
  res.status(502).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`StarPal analytics backend listening on :${PORT} (base ${BASE_PATH})`);
  if (!process.env.JWT_SECRET) console.warn("WARNING: JWT_SECRET unset — auth will fail.");
  if (!process.env.DATABASE_URL) console.warn("WARNING: DATABASE_URL unset — DB will fail.");
  if (!hasAnthropicKey()) {
    console.warn("WARNING: ANTHROPIC_API_KEY unset — classification/relevance disabled.");
  }
  if (!isEventSchemaConfigured()) {
    console.warn("WARNING: eventSchema in config.ts still has TODO placeholders — run discovery.");
  }
});
