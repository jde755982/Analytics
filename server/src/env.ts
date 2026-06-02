/**
 * Loads environment variables BEFORE any module that reads process.env at
 * import time (notably config.ts). Import this first in every entry point.
 *
 * Single shared env lives at the module root (starpal-analytics/.env). npm
 * scripts run with cwd = server/, so ../.env resolves to the module root; a
 * local server/.env can still override. Vite reads the same root file via
 * envDir (vite.config.ts) and exposes only VITE_* to the browser.
 */
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), "../.env") });
dotenv.config(); // optional server/.env override
