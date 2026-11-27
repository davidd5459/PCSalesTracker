# PCSalesTracker

Price history for PC games across Steam, GOG, Epic, Humble, Fanatical and Green Man Gaming, plus an estimate of when each game will next go on sale.

Live site: [PCSalesTracker](https://pcsalestracker.vercel.app/)

## Features

- Shows every recorded price change for a game, going back up to 10 years
- Predicts the next sale (date, usual discount and price) based on previous sale history
- Lists upcoming sales and current discounts on the home page
- Has around 1000 games stored, and can fetch price data for games that aren't

## How it works

Prices come from the IsThereAnyDeal API. The database only stores a row when a price changes, so ten years of history for about 1,000 games comes to around 445k rows.

For each sale season (Winter, Summer, Black Friday and so on) it checks whether the game was discounted in each of the last four years and by how much, then picks the soonest season the game usually joins.

A GitHub Actions job runs once a day. It fetches current prices in batches and only pulls full history for games whose price changed.

The catalog is capped at 4,000 games to stay inside Neon's free tier. Popular games are imported up front and always kept. Games added through search are removed least recently viewed first once the imported game cap is reached.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind, Recharts
- API: Hono, deployed on Vercel
- Database: Postgres on Neon
- Tests: Vitest, with PGlite as an in-memory Postgres


## Credits

Price data from [IsThereAnyDeal](https://isthereanydeal.com). Not affiliated with IsThereAnyDeal or any of the stores.

## License

MIT
