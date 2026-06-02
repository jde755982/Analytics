import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under a base path so it can live at starpal.ai/analytics. Must match
// the backend BASE_PATH. Override with VITE_BASE_PATH if you change it.
const base = (process.env.VITE_BASE_PATH ?? "/analytics/").replace(/\/?$/, "/");

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  // Read the shared env at the project root (.env). Only VITE_* vars are exposed
  // to the browser, so ANTHROPIC_API_KEY / JWT_SECRET in the same file stay
  // server-side.
  envDir: "..",
});
