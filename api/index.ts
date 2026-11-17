/**
 * Vercel serverless entry point. vercel.json routes every /api/* request here,
 * and the Hono app handles routing from there.
 */
import { createApp } from "../server/app.js";
import { getHttpDb, withPoolDb } from "../server/db/client.js";
import { getItadClient } from "../server/itad/client.js";

const app = createApp({ getDb: getHttpDb, withWriteDb: withPoolDb, getItad: getItadClient });

export const GET = (request: Request) => app.fetch(request);
export const POST = (request: Request) => app.fetch(request);
