# RichMan Backend

Backend service for the live rectangle runner game.

## Stack
- Node.js + Express
- WebSocket (`ws`)
- Store mode: `file` (default, persistent) or `memory`

## Quick Start
1. `npm install`
2. `cp .env.example .env`
3. `npm run start`
4. Open `http://localhost:3000`

## Main Files
- `src/server.js`
- `src/config.js`
- `src/round/roundEngine.js`
- `src/payout/payoutEngine.js`
- `src/spin/spinEngine.js`
- `src/track/trackBuilder.js`
- `src/store/memoryStore.js`
- `src/store/fileStore.js`
- `src/store/createStore.js`
- `scripts/sim-danmu-stream.js`
- `scripts/init-store.js`

## Store Configuration
- `STORE_MODE=file` (default)
- `STORE_FILE_PATH=./data/store.json`
- `SETTLE_PAUSE_SEC=3` (settlement display duration before next round)
- `SETTLEMENT_HIGHLIGHT_LIMIT=12` (max users in settlement popup payload)

If you want fully volatile runtime data for local debugging, set:
```bash
STORE_MODE=memory
```

## Store Init Script
Seed users into file store:
```bash
npm run init:store -- --users userA,userB --points 100 --reset
```

Optional args:
- `--file ./data/store.json` custom snapshot location
- `--reset` remove existing snapshot before seeding

## APIs
- `GET /api/state`
- `GET /api/round/current`
- `GET /api/round/result/latest`
- `GET /api/leaderboard?limit=100`
- Local-only (enabled by `ALLOW_LOCAL_SIMULATOR=1`):
- `POST /api/sim/bet`
- `POST /api/sim/bulk`
- `POST /api/sim/fund`

## Round Flow
1. Server enters `waiting_bets` (no spin if no valid bet yet).
2. First accepted bet switches to `betting` and starts countdown.
3. Countdown ends and spin/settlement run as usual.
4. Settlement payload includes `settlementHighlights`.
5. After `SETTLE_PAUSE_SEC`, next round returns to `waiting_bets`.

## Stream Simulator (Separate Process)
Start backend first, then start simulator script:
```bash
npm run sim:stream
```

Optional simulator tuning via env vars:
```bash
SIM_BASE_URL=http://127.0.0.1:3000 \
SIM_TICK_MS=280 \
SIM_COUNT_PER_TICK=18 \
SIM_AMOUNT_MIN=20 \
SIM_AMOUNT_MAX=700 \
npm run sim:stream
```

Stop simulator:
```bash
Ctrl + C
```

## Test
```bash
npm test
```

## Notes
- Current version is a prototype.
- Use `.env.example` as the baseline config.
- For production, set `ALLOW_LOCAL_SIMULATOR=0` to disable simulation endpoints.
