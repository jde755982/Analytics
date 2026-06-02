/**
 * Admin provisioning routes (STAFF only): create clients, attach pals to a
 * client, create users. This is how StarPal onboards a customer like Willemse
 * and grants them their pals.
 */
import { Router } from "express";
import { hashPassword, prisma } from "../auth/auth.js";
import { requireAuth, requireStaff } from "../auth/middleware.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireStaff);

// ---- Clients ----
adminRouter.get("/clients", async (_req, res) => {
  const clients = await prisma.client.findMany({
    include: { pals: true, users: { select: { id: true, email: true, role: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ clients });
});

adminRouter.post("/clients", async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Nom du client requis." });
    return;
  }
  const client = await prisma.client.create({ data: { name: name.trim() } });
  res.json({ client });
});

// ---- Pals (attach to a client) ----
adminRouter.post("/pals", async (req, res) => {
  const { clientId, palId, label } = req.body ?? {};
  if (![clientId, palId, label].every((v) => typeof v === "string" && v.trim())) {
    res.status(400).json({ error: "clientId, palId et label requis." });
    return;
  }
  try {
    const pal = await prisma.pal.create({
      data: { clientId, palId: palId.trim(), label: label.trim() },
    });
    res.json({ pal });
  } catch {
    res.status(409).json({ error: "Ce palId est déjà attaché à ce client." });
  }
});

adminRouter.delete("/pals/:id", async (req, res) => {
  await prisma.pal.delete({ where: { id: req.params.id } }).catch(() => undefined);
  res.json({ ok: true });
});

// ---- Users ----
adminRouter.post("/users", async (req, res) => {
  const { email, password, role, clientId } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Email et mot de passe (≥ 8 caractères) requis." });
    return;
  }
  const finalRole = role === "STAFF" ? "STAFF" : "CLIENT";
  if (finalRole === "CLIENT" && (typeof clientId !== "string" || !clientId)) {
    res.status(400).json({ error: "Un utilisateur CLIENT doit être rattaché à un client." });
    return;
  }
  try {
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
        role: finalRole,
        clientId: finalRole === "CLIENT" ? clientId : null,
      },
    });
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch {
    res.status(409).json({ error: "Cet email existe déjà." });
  }
});
