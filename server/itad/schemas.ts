/**
 * Runtime schemas for the IsThereAnyDeal API responses we use. Only the fields
 * we read are declared; anything else in the response is ignored. If ITAD
 * changes a shape, parsing fails loudly instead of storing bad data.
 */
import { z } from "zod";

const Price = z.object({
  amount: z.number(),
  amountInt: z.number().int(), // price in cents
  currency: z.string(),
});

const ShopRef = z.object({ id: z.number().int(), name: z.string() });

export const ShopsResponse = z.array(z.object({ id: z.number().int(), title: z.string() }));

export const SearchResponse = z.array(
  z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    type: z.string().nullable(),
    mature: z.boolean().optional(),
  }),
);

export const GameInfoResponse = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  type: z.string().nullable(),
  mature: z.boolean().optional(),
  appid: z.number().int().nullish(),
  releaseDate: z.string().nullish(),
  // Usually { banner600: url, ... }, but an empty list when a game has no images.
  assets: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).nullish(),
  developers: z.array(z.object({ name: z.string() })).nullish(),
  urls: z.object({ game: z.string().optional() }).nullish(),
});

export const HistoryResponse = z.array(
  z.object({
    timestamp: z.string(),
    shop: ShopRef,
    // null when the game stopped being available at the shop
    deal: z.object({ price: Price, regular: Price, cut: z.number() }).nullable(),
  }),
);

export const PricesResponse = z.array(
  z.object({
    id: z.string(),
    deals: z.array(
      z.object({
        shop: ShopRef,
        price: Price,
        regular: Price,
        cut: z.number(),
        url: z.string(),
      }),
    ),
  }),
);

/** Shared by the ranked lists (most popular, most waitlisted, most collected). */
export const PopularResponse = z.array(
  z.object({
    position: z.number(),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    type: z.string().nullish(),
  }),
);

export type GameInfo = z.infer<typeof GameInfoResponse>;
export type HistoryEntry = z.infer<typeof HistoryResponse>[number];
export type PriceEntry = z.infer<typeof PricesResponse>[number];
