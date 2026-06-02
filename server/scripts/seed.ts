/**
 * Seed: creates the first STAFF (StarPal admin) account from env, so you can log
 * in and provision clients/pals/users via the admin UI. Idempotent.
 *
 *   STAFF_EMAIL / STAFF_PASSWORD  → the initial StarPal admin
 *
 * Optionally bootstraps a demo client + pal when SEED_DEMO=1.
 */
import "../src/env.js";
import { hashPassword, prisma } from "../src/auth/auth.js";

async function main() {
  const email = (process.env.STAFF_EMAIL ?? "admin@starpal.ai").toLowerCase();
  const password = process.env.STAFF_PASSWORD ?? "change-me-now";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`STAFF user already exists: ${email}`);
  } else {
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role: "STAFF" },
    });
    console.log(`Created STAFF user: ${email}`);
    if (password === "change-me-now") console.warn("⚠️  Set STAFF_PASSWORD — using default!");
  }

  if (process.env.SEED_DEMO === "1") {
    const client = await prisma.client.upsert({
      where: { id: "demo-willemse" },
      update: {},
      create: { id: "demo-willemse", name: "Willemse (démo)" },
    });
    console.log(`Demo client: ${client.name} (${client.id})`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
