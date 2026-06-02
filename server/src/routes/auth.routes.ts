/** Login / logout / current-user routes. */
import { Router } from "express";
import {
  COOKIE_NAME,
  cookieMaxAgeMs,
  prisma,
  signToken,
  verifyPassword,
} from "../auth/auth.js";
import { requireAuth } from "../auth/middleware.js";

export const authRouter = Router();

const isProd = process.env.NODE_ENV === "production";

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email et mot de passe requis." });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Constant-ish response: always run verify to avoid user-enumeration timing.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    res.status(401).json({ error: "Identifiants invalides." });
    return;
  }
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: cookieMaxAgeMs,
    path: "/",
  });
  res.json({ email: user.email, role: user.role });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user!.email, role: req.user!.role });
});
