/**
 * Auth + tenancy middleware.
 *
 *  requireAuth  — populates req.user from the session cookie or rejects 401.
 *  requireStaff — additionally requires role === STAFF (provisioning routes).
 *  resolveAllowedPalIds — the heart of multi-tenant isolation: returns the set
 *    of palIds the caller may query. STAFF → all pals; CLIENT → only their
 *    client's pals. Route handlers MUST call assertPalAllowed before proxying.
 */
import type { NextFunction, Request, Response } from "express";
import { COOKIE_NAME, prisma, verifyToken, type SessionUser } from "./auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: "Non authentifié." });
    return;
  }
  req.user = user;
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "STAFF") {
    res.status(403).json({ error: "Réservé au staff StarPal." });
    return;
  }
  next();
}

/** Pals visible to this user: all (STAFF) or their client's (CLIENT). */
export async function listVisiblePals(user: SessionUser) {
  if (user.role === "STAFF") {
    return prisma.pal.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { label: "asc" },
    });
  }
  if (!user.clientId) return [];
  return prisma.pal.findMany({
    where: { clientId: user.clientId },
    include: { client: { select: { name: true } } },
    orderBy: { label: "asc" },
  });
}

/**
 * Returns true iff `palId` is one the caller is allowed to query. This is the
 * server-side gate: the client UI only offers permitted pals, but we never
 * trust that — we re-check here on every data request.
 */
export async function isPalAllowed(user: SessionUser, palId: string): Promise<boolean> {
  if (user.role === "STAFF") {
    const found = await prisma.pal.findFirst({ where: { palId } });
    return Boolean(found);
  }
  if (!user.clientId) return false;
  const found = await prisma.pal.findFirst({ where: { palId, clientId: user.clientId } });
  return Boolean(found);
}
