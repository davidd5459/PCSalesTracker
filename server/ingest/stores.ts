import { STORES } from "../../src/config/stores.js";
import type { Queryable } from "../db/client.js";
import { upsertStores } from "../db/writes.js";
import type { ItadClient } from "../itad/client.js";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Confirm each configured store's ITAD shop id against ITAD's live shop list
 * (falling back to a name match), save the stores table, and return
 * ITAD shop id → our store id.
 */
export async function syncStores(
  db: Queryable,
  itad: ItadClient,
  log: (msg: string) => void = console.log,
): Promise<Map<number, string>> {
  const shops = await itad.shops();
  const resolved = STORES.map((store, i) => {
    const expected = store.itad;
    let shop = expected ? shops.find((s) => s.id === expected.shopId) : undefined;
    if (shop && expected && normalize(shop.title) !== normalize(expected.title)) {
      log(`  ! ${store.name}: ITAD shop ${shop.id} is titled "${shop.title}", expected "${expected.title}"`);
    }
    if (!shop) {
      shop = shops.find((s) => normalize(s.title) === normalize(expected?.title ?? store.name));
      if (shop) log(`  ! ${store.name}: matched ITAD shop by name (id ${shop.id}); update src/config/stores.ts`);
      else log(`  ! ${store.name}: no matching ITAD shop found; it will be skipped`);
    }
    return { storeId: store.id, name: store.name, itadShopId: shop?.id ?? null, sortOrder: i };
  });

  await upsertStores(db, resolved);
  return new Map(resolved.filter((s) => s.itadShopId !== null).map((s) => [s.itadShopId!, s.storeId]));
}
