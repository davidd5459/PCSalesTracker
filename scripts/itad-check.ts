/**
 * npm run itad:check: verify the ITAD API key and every endpoint we use,
 * without touching the database. Run this first after adding ITAD_API_KEY.
 */
import { STORES } from "../src/config/stores.js";
import { loadEnv, requireEnv } from "../server/env.js";
import { HISTORY_SINCE } from "../server/ingest/importGame.js";
import { ItadClient } from "../server/itad/client.js";
import { mapGameInfo, mapHistory } from "../server/itad/mapping.js";

loadEnv();
const itad = new ItadClient(requireEnv("ITAD_API_KEY"));
let failures = 0;

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    console.log(`✔ ${name}`);
    return result;
  } catch (err) {
    failures++;
    console.log(`✘ ${name}\n  ${(err as Error).message.replaceAll("\n", "\n  ")}`);
    return undefined;
  }
}

const shops = await step("shops list", () => itad.shops());
const storeIdByShop = new Map<number, string>();
if (shops) {
  for (const store of STORES) {
    const byId = shops.find((s) => s.id === store.itad?.shopId);
    if (byId) storeIdByShop.set(byId.id, store.id);
    console.log(`    ${store.name.padEnd(18)} → ${byId ? `${byId.id} "${byId.title}"` : "NOT FOUND by id"}`);
  }
}

const results = await step("search \"hades\"", () => itad.search("hades", 5));
const hades = results?.find((g) => g.type === "game") ?? results?.[0];
if (hades) console.log(`    found: ${hades.title} (${hades.id})`);

if (hades) {
  const info = await step("game info", () => itad.info(hades.id));
  if (info) console.log(`    mapped: ${JSON.stringify(mapGameInfo(info))}`);

  const history = await step("price history", () =>
    itad.history(hades.id, { shops: [...storeIdByShop.keys()], since: HISTORY_SINCE }),
  );
  if (history) {
    const byStore = mapHistory(history, storeIdByShop);
    const oldest = history.map((h) => h.timestamp).sort()[0];
    console.log(`    ${history.length} entries, oldest ${oldest ?? "n/a"}`);
    for (const [storeId, points] of byStore) console.log(`    ${storeId.padEnd(10)} ${points.length} price changes`);
  }

  const prices = await step("current prices", () => itad.prices([hades.id], [...storeIdByShop.keys()]));
  if (prices) console.log(`    ${prices[0]?.deals.length ?? 0} current deals with store links`);
}

const popular = await step("most popular list", () => itad.mostPopular(0, 5));
if (popular) console.log(`    top: ${popular.map((g) => g.title).join(", ")}`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
