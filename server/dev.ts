/** Local API server for development. Vite proxies /api/* here (see vite.config.ts). */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getHttpDb } from "./db/client.js";
import { loadEnv } from "./env.js";

loadEnv();
const PORT = 3001;
const app = createApp(getHttpDb);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`API listening on http://localhost:${PORT}/api`);
  if (!process.env.DATABASE_URL) console.log("DATABASE_URL is not set; API calls will return 503.");
});
