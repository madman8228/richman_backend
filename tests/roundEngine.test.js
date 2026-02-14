const test = require("node:test");
const assert = require("node:assert/strict");

const { RoundEngine } = require("../src/round/roundEngine");
const { MemoryStore } = require("../src/store/memoryStore");

const buildTrack = (len = 24) =>
  Array.from({ length: len }, (_, id) => ({
    id,
    r: Math.floor(id / 6),
    c: id % 6
  }));

const buildConfig = (overrides = {}) => ({
  betWindowSec: 10,
  spinDurationSec: 0,
  settlePauseSec: 0,
  settlementHighlightLimit: 12,
  spinDirectionMode: "clockwise",
  markerCounts: [1, 6, 8],
  markerCountWeights: [9900, 50, 50],
  roundModes: ["normal", "train", "king"],
  roundModeWeights: [80, 10, 10],
  normalLuckModeWeights: [55, 20, 25],
  normalMult: 2,
  jackpotSmallMult: 20,
  jackpotBigMult: 50,
  poolJackpotEnabled: true,
  poolJackpotSlot: "big",
  poolJackpotRequireHit: true,
  poolJackpotKeepBaseMult: false,
  respinMin: 1,
  respinMax: 1,
  leaderboardLimit: 100,
  jackpotPoolRate: 0.02,
  pointExpireHours: 24,
  localStartPoints: 100,
  noPointBonusRequireZero: true,
  noPointBonusCooldownMin: 60,
  noPointBonusPoints: 10,
  ...overrides
});

const buildRoundEngine = (configOverrides = {}) => {
  const config = buildConfig(configOverrides);
  const store = new MemoryStore(config);
  const track = buildTrack(24);
  const jackpotSlots = { big: 3, small: 2 };
  const respinSlots = [9, 21];
  const events = [];
  const payoutEngine = {
    applyBets: () => []
  };
  const engine = new RoundEngine({
    config,
    store,
    payoutEngine,
    track,
    jackpotSlots,
    respinSlots,
    broadcaster: (msg) => events.push(msg)
  });
  return { engine, store, events };
};

test("reuse last bet copies prior plan and enforces insufficient-points check", () => {
  const { engine, store } = buildRoundEngine();
  store.createRound({ id: 1, status: "betting", startTime: Date.now(), betDeadline: Date.now() + 10000 });

  const first = engine.placeBet({
    userId: "userA",
    slotId: 5,
    amount: 10,
    sourceMsgId: "msg-1"
  });
  assert.equal(first.ok, true);

  const reuse = engine.placeBet({
    userId: "userA",
    reuseLastBet: true,
    sourceMsgId: "reuse-1"
  });
  assert.equal(reuse.ok, true);
  assert.equal(reuse.reused, true);
  assert.equal(reuse.accepted, 1);
  assert.equal(store.getCurrentRound().bets.length, 2);
  assert.equal(store.getCurrentRound().bets[1].slotId, 5);

  store.addLedger("userA", -85, "drain-to-low");
  const insufficient = engine.placeBet({
    userId: "userA",
    reuseLastBet: true,
    sourceMsgId: "reuse-2"
  });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.reason, "insufficient_points");
});

test("round_spin payload carries backend-selected mode and light mode", () => {
  const { engine, store, events } = buildRoundEngine({
    roundModes: ["train"],
    roundModeWeights: [1]
  });
  store.createRound({ id: 2, status: "betting", startTime: Date.now(), betDeadline: Date.now() + 10000 });
  const round = store.getCurrentRound();
  const addResult = store.addBet(round.id, {
    userId: "userA",
    slotId: 6,
    amount: 10,
    sourceMsgId: "msg-spin"
  });
  assert.equal(addResult.ok, true);

  engine._closeBetting(round.id);
  const spinEvent = events.find((evt) => evt.type === "round_spin");
  assert.ok(spinEvent);
  assert.equal(spinEvent.mode, "train");
  assert.equal(spinEvent.spin.mode, "train");
  assert.equal(spinEvent.spin.lightMode, "train");
});

test("pool jackpot pays pool only when configured slot is hit", () => {
  const { engine, store } = buildRoundEngine({
    poolJackpotEnabled: true,
    poolJackpotSlot: "big",
    poolJackpotRequireHit: true
  });
  const round = {
    bets: [
      { userId: "userA", slotId: 3, amount: 20 },
      { userId: "userB", slotId: 2, amount: 20 }
    ]
  };
  store.jackpotPool = 120;
  const winDelta = new Map();
  const addWinDelta = (userId, delta) => {
    winDelta.set(userId, (winDelta.get(userId) || 0) + delta);
  };

  const miss = engine._settlePoolJackpot(round, addWinDelta, new Set([9]));
  assert.equal(miss.jackpotPoolPaid, 0);
  assert.equal(store.getJackpotPool(), 120);

  const hit = engine._settlePoolJackpot(round, addWinDelta, new Set([3]));
  assert.equal(hit.jackpotPoolPaid, 120);
  assert.equal(hit.jackpotPoolPayouts.length, 1);
  assert.equal(hit.jackpotPoolPayouts[0].userId, "userA");
  assert.equal(hit.jackpotPoolPayouts[0].delta, 120);
  assert.equal(store.getJackpotPool(), 0);
  assert.equal(winDelta.get("userA"), 120);
});

test("pool jackpot feature can be disabled and falls back to legacy pool split", () => {
  const { engine, store } = buildRoundEngine({
    poolJackpotEnabled: false
  });
  const round = {
    bets: [
      { userId: "userA", slotId: 3, amount: 10 },
      { userId: "userB", slotId: 2, amount: 10 }
    ]
  };
  store.jackpotPool = 100;
  const winDelta = new Map();
  const addWinDelta = (userId, delta) => {
    winDelta.set(userId, (winDelta.get(userId) || 0) + delta);
  };

  const result = engine._settlePoolJackpot(round, addWinDelta, new Set());
  assert.equal(result.poolJackpotEnabled, false);
  assert.equal(result.jackpotPoolPaid, 100);
  assert.equal(result.jackpotPoolPayouts.length, 2);
  assert.equal(store.getJackpotPool(), 0);
  assert.equal((winDelta.get("userA") || 0) + (winDelta.get("userB") || 0), 100);
});
