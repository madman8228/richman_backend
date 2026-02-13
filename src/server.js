const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const { config } = require("./config");
const { buildTrack } = require("./track/trackBuilder");
const { pickJackpotSlots, pickRespinSlots } = require("./track/trackUtils");
const { MemoryStore } = require("./store/memoryStore");
const { PayoutEngine } = require("./payout/payoutEngine");
const { RoundEngine } = require("./round/roundEngine");
const { createDanmuSimulator } = require("./sim/danmuSimulator");

const app = express();
app.use(express.json());

const resolvePublicDir = () => {
  const candidates = [
    config.publicDir,
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "..", "RichMan", "public")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const publicDir = resolvePublicDir();
if (publicDir) app.use(express.static(publicDir));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const track = buildTrack(
  config.gridRows,
  config.gridCols,
  config.trackMode,
  config.trackCustomPath
);

const jackpotSlots =
  config.jackpotSlots.length >= 2
    ? { big: config.jackpotSlots[0], small: config.jackpotSlots[1] }
    : pickJackpotSlots(track, config.gridRows, config.gridCols);

const respinSlots =
  config.respinSlots.length >= 2
    ? config.respinSlots.slice(0, 2)
    : pickRespinSlots(track.length, new Set([jackpotSlots.big, jackpotSlots.small]));

const store = new MemoryStore(config);
const payoutEngine = new PayoutEngine(config, store, jackpotSlots);

const broadcast = (payload) => {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
};

const roundEngine = new RoundEngine({
  config,
  store,
  payoutEngine,
  track,
  jackpotSlots,
  respinSlots,
  broadcaster: broadcast
});

const simulator = createDanmuSimulator({
  roundEngine,
  trackLen: track.length
});

wss.on("connection", (ws) => {
  const initPayload = {
    type: "init",
    track,
    rows: config.gridRows,
    cols: config.gridCols,
    jackpotSlots,
    respinSlots,
    jackpotPool: store.getJackpotPool(),
    config: {
      betWindowSec: config.betWindowSec,
      spinDurationSec: config.spinDurationSec,
      normalMult: config.normalMult,
      jackpotSmallMult: config.jackpotSmallMult,
      jackpotBigMult: config.jackpotBigMult
    }
  };
  ws.send(JSON.stringify(initPayload));
});

app.get("/api/state", (req, res) => {
  res.json({
    track,
    rows: config.gridRows,
    cols: config.gridCols,
    jackpotSlots,
    respinSlots,
    jackpotPool: store.getJackpotPool(),
    currentRound: store.getCurrentRound(),
    lastResult: store.getLastResult()
  });
});

app.get("/api/round/current", (req, res) => {
  res.json(store.getCurrentRound());
});

app.get("/api/round/result/latest", (req, res) => {
  res.json(store.getLastResult());
});

app.get("/api/leaderboard", (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || config.leaderboardLimit;
  res.json(store.getLeaderboard(limit));
});

app.post("/api/sim/bet", (req, res) => {
  res.json(simulator.placeOne(req.body));
});

app.post("/api/sim/bulk", (req, res) => {
  res.json(simulator.placeBulk(req.body));
});

server.listen(config.port, () => {
  roundEngine.start();
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});
