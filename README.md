# RichMan Backend

Backend service for the live rectangle runner game.

## Stack
- Node.js + Express
- WebSocket (`ws`)
- Local in-memory store (MongoDB/Redis pending)

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

## APIs
- `GET /api/state`
- `GET /api/round/current`
- `GET /api/round/result/latest`
- `GET /api/leaderboard`
- `POST /api/sim/bet`
- `POST /api/sim/bulk`

## Notes
- Current version is a prototype.
- Use `.env.example` as the baseline config.
