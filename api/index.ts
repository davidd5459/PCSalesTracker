/**
 * Vercel serverless entry point. vercel.json routes every /api/* request here,
 * and the Hono app handles routing from there.
 */
import { createApp } from "../server/app.js";
import { getHttpDb } from "../server/db/client.js";

const app = createApp(getHttpDb);

export const GET = (request: Request) => app.fetch(request);
