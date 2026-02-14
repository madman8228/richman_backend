const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const { config } = require("./config");
const { buildTrack } = require("./track/trackBuilder");
const { pickJackpotSlots, pickRespinSlots } = require("./track/trackUtils");
const { createStore } = require("./store/createStore");
const { PayoutEngine } = require("./payout/payoutEngine");
const { RoundEngine } = require("./round/roundEngine");

const app = express();
app.use(express.json());

const resolvePublicDir = () => {
  const candidates = [
    config.publicDir,
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "..", "richman", "public"),
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

const store = createStore(config);
const payoutEngine = new PayoutEngine(config, store, jackpotSlots);

const toClientRound = (round) => {
  if (!round) return null;
  return {
    id: round.id,
    status: round.status,
    betDeadline: round.betDeadline || 0
  };
};

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

wss.on("connection", (ws) => {
  const initPayload = {
    type: "init",
    track,
    rows: config.gridRows,
    cols: config.gridCols,
    jackpotSlots,
    respinSlots,
    jackpotPool: store.getJackpotPool(),
    currentRound: toClientRound(store.getCurrentRound()),
    config: {
      betWindowSec: config.betWindowSec,
      spinDurationSec: config.spinDurationSec,
      settlePauseSec: config.settlePauseSec,
      normalMult: config.normalMult,
      jackpotSmallMult: config.jackpotSmallMult,
      jackpotBigMult: config.jackpotBigMult,
      slotMultipliers: config.slotMultipliers,
      slotMultipliersStrict: config.slotMultipliersStrict,
      poolJackpotEnabled: config.poolJackpotEnabled,
      poolJackpotSlot: config.poolJackpotSlot,
      poolJackpotRequireHit: config.poolJackpotRequireHit,
      poolJackpotKeepBaseMult: config.poolJackpotKeepBaseMult,
      quickBetGuideEnabled: config.quickBetGuideEnabled,
      quickBetGuideTitle: config.quickBetGuideTitle,
      quickBetGuideExamples: config.quickBetGuideExamples,
      roundModes: config.roundModes
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

if (config.allowLocalSimulator) {
  const parseBetInput = (body = {}) => {
    const userId = String(body.userId || `u${Math.floor(Math.random() * 1000000)}`);
    const rawSlot = Number.parseInt(body.slotId, 10);
    const slotId = Number.isFinite(rawSlot)
      ? rawSlot
      : Math.floor(Math.random() * track.length);
    const rawAmount = Number.parseInt(body.amount, 10);
    const amount = Number.isFinite(rawAmount) && rawAmount > 0
      ? rawAmount
      : Math.floor(Math.random() * 10) + 1;
    const reuseLastBet =
      body.reuseLastBet === true ||
      body.reuseLastBet === 1 ||
      body.reuseLastBet === "1" ||
      body.reuseLastBet === "true" ||
      body.slotId === "0" ||
      body.command === "reuse_last";
    const betPlan = Array.isArray(body.bets)
      ? body.bets
          .map((item) => ({
            slotId: Number.parseInt(item?.slotId, 10),
            amount: Number.parseInt(item?.amount, 10)
          }))
          .filter(
            (item) =>
              Number.isFinite(item.slotId) &&
              item.slotId >= 0 &&
              Number.isFinite(item.amount) &&
              item.amount > 0
          )
      : undefined;
    return {
      userId,
      slotId,
      amount,
      sourceMsgId: body.sourceMsgId,
      reuseLastBet,
      betPlan
    };
  };

  app.post("/api/sim/bet", (req, res) => {
    res.json(roundEngine.placeBet(parseBetInput(req.body)));
  });

  app.post("/api/sim/bulk", (req, res) => {
    const count = Number.parseInt(req.body?.count, 10) || 100;
    const amountMin = Number.parseInt(req.body?.amountMin, 10) || 1;
    const amountMax = Number.parseInt(req.body?.amountMax, 10) || 10;
    const maxSafe = Math.max(amountMin, amountMax);
    let accepted = 0;

    for (let i = 0; i < count; i += 1) {
      const bet = parseBetInput({
        userId: `u${Math.floor(Math.random() * 1000000)}`,
        slotId: Math.floor(Math.random() * track.length),
        amount:
          amountMin +
          Math.floor(Math.random() * (maxSafe - amountMin + 1)),
        sourceMsgId: `sim-bulk-${Date.now()}-${i}`
      });
      const result = roundEngine.placeBet(bet);
      if (result.ok) accepted += 1;
    }

    res.json({ ok: true, accepted });
  });

  // Local-only helper for stream simulator script to keep wallets testable.
  app.post("/api/sim/fund", (req, res) => {
    const userId = String(req.body?.userId || "").trim();
    const points = Number.parseInt(req.body?.points, 10);
    if (!userId) {
      return res.status(400).json({ ok: false, reason: "invalid_user" });
    }
    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ ok: false, reason: "invalid_points" });
    }

    const mode = String(req.body?.mode || "set_floor");
    const current = store.getUserPoints(userId);
    const delta = mode === "add" ? points : Math.max(0, points - current);
    if (delta <= 0) {
      return res.json({
        ok: true,
        userId,
        points: current,
        actualDelta: 0
      });
    }

    const actualDelta = store.addLedger(userId, delta, "sim_fund");
    return res.json({
      ok: true,
      userId,
      points: store.getUserPoints(userId),
      actualDelta
    });
  });
}

server.listen(config.port, () => {
  roundEngine.start();
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(
    `Store mode: ${config.storeMode}${
      config.storeMode === "file" ? ` (${config.storeFilePath})` : ""
    }`
  );
});



