# The Last District

*The world fell. Your survival begins here.*

A survival game for Squeek holders. Your Squeeks are Survivors: dig shelters, stack Survivors inside, and qualify for a supply drop every three days. Winners are picked by a draw anyone can re-check.

Community-built, not an official Squeekchain product. Runs against the Squeekchain deployment on **Sepolia** (testnet). Rewards in the seed data are clearly labelled **demo** rewards. They have no value.

## What it does

- **Survivors**: reads the Squeeks a wallet holds, in the wallet or deposited in SqueekStaking. Art, traits and level come from `tokenURI` and `level()`. Game numbers are labelled as game stats.
- **Shelters**: one primary Survivor leads each shelter. Beds = 3 + the primary's on-chain level. A player can run up to 5 shelters.
- **Stacking**: drag-and-drop bay (tap-to-place on phones). Each placement re-reads ownership on Sepolia, then writes it in a locked transaction. A database unique index stops one Survivor from being in two shelters.
- **Supply drops**: one drop every 72 hours. The flow is scheduled → open → snapshot → drawn. Rules are published on each drop and locked once it opens. Default rules: at least 3 Survivors, each settled 12 h before the snapshot and still held by the owner. Each counted Survivor is one ticket, and a shelter can win at most once per drop.
- **Fair draw**: commit-reveal plus a future Sepolia block hash (see `/manual#fairness`). The drop page has a **Verify this draw** button that re-runs the same code (`src/shared/fairness.ts`) in the browser.
- **Reward vault and claims**: supports campaigns, reward batches and partners. A non-demo partner campaign can't go live until an admin marks the partner verified. Each reward can be claimed once, within 14 days, and an admin marks it delivered.
- **Profiles, badges, titles, leaderboards and share cards**: progression is cosmetic only and never affects odds. Leaderboards are rebuilt from recorded data. Shelter and winner pages generate OG images.
- **Admin** (`/admin`): drops, rules, rewards, campaigns, partners, distributions, players, shelters and the activity log. Every action is checked on the server and logged.
- **ERC-6551**: each shelter shows the token-bound account address of its primary, taken from the canonical registry `0x000000006551c19487814612e58FE06813775758` with the Tokenbound v3 proxy, both verified as deployed on Sepolia. The game doesn't deploy the account. Shelter state stays off-chain, so playing costs no gas.

## Run locally

Needs Node 20+ and PostgreSQL.

```bash
npm install
createdb last_district && createdb last_district_test
cp .env.example .env   # fill in the values
npx prisma migrate deploy
npm run db:seed        # demo vault + first drop
npm run dev            # http://localhost:3500
```

Tests (wipe `last_district_test`):

```bash
npx vitest run
```

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `SESSION_SECRET` | 32+ random chars. Signs sessions and seals drop seeds |
| `ADMIN_PASSWORD` | Turns on `/admin` password sign-in |
| `ADMIN_WALLETS` | Optional comma-separated wallets that are admins once signed in |
| `CRON_SECRET` | Bearer token for `/api/cron/tick` |
| `NEXT_PUBLIC_SITE_URL` | Public URL, for share cards |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Optional WalletConnect |
| `SEPOLIA_RPC_URLS` | Optional RPCs tried before the public ones |
| `DROP_INTERVAL_HOURS` | Optional, default 72 |
| `DEV_LOGIN`, `DEV_NFT_ALIAS` | Development only, ignored in production. Dev sign-in without a wallet, and "from:to" wallet aliases for testing with real holders' Squeeks |

## Deploy

Any Node host with Postgres works, for example Vercel + Neon. Set the environment variables, run `npx prisma migrate deploy` and `npm run build && npm start`. The scheduler advances drops on page loads, but point a cron at `/api/cron/tick` (`Authorization: Bearer $CRON_SECRET`) every few minutes so snapshots happen on time with no visitors. `npm run tick` does the same from a shell.
