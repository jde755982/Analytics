/**
 * Authentication primitives: password hashing (bcrypt), JWT issue/verify, and
 * the Prisma client singleton.
 *
 * JWT is carried in an HttpOnly cookie (not localStorage) so the token is not
 * reachable from page JS — defends against XSS token theft.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET ?? "";
const SESSION_HOURS = 8;

export interface SessionUser {
  userId: string;
  email: string;
  role: Role;
  clientId: string | null;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: SessionUser): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign(user, JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
}

export function verifyToken(token: string): SessionUser | null {
  if (!JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionUser & { iat: number; exp: number };
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      clientId: decoded.clientId,
    };
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "starpal_analytics_session";
export const cookieMaxAgeMs = SESSION_HOURS * 60 * 60 * 1000;
