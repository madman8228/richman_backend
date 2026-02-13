const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { FileStore } = require("../src/store/fileStore");

const buildConfig = (overrides = {}) => ({
  localStartPoints: 100,
  pointExpireHours: 24,
  jackpotPoolRate: 0.02,
  noPointBonusRequireZero: true,
  noPointBonusCooldownMin: 60,
  noPointBonusPoints: 10,
  ...overrides
});

test("FileStore persists points, jackpot pool, and last result across restart", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "richman-store-"));
  const filePath = path.join(dir, "store.json");
  const config = buildConfig();

  const storeA = new FileStore(config, { filePath });
  assert.equal(storeA.getUserPoints("userA"), 100);
  assert.equal(storeA.addLedger("userA", 50, "win"), 50);
  assert.equal(storeA.addJackpotContribution(250), 5);
  storeA.setLastResult({ roundId: 99, settledAt: 1234567890 });

  const storeB = new FileStore(config, { filePath });
  assert.equal(storeB.getUserPoints("userA"), 150);
  assert.equal(storeB.getJackpotPool(), 5);
  assert.deepEqual(storeB.getLastResult(), {
    roundId: 99,
    settledAt: 1234567890
  });
});

test("FileStore snapshots dedupe set and restores it to Set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "richman-round-"));
  const filePath = path.join(dir, "store.json");
  const config = buildConfig();

  const storeA = new FileStore(config, { filePath });
  storeA.createRound({ id: 1, status: "betting", startTime: 1, betDeadline: 2 });
  assert.deepEqual(
    storeA.addBet(1, {
      userId: "userA",
      slotId: 2,
      amount: 10,
      sourceMsgId: "msg-1"
    }),
    { ok: true }
  );

  const storeB = new FileStore(config, { filePath });
  const round = storeB.getCurrentRound();
  assert.ok(round);
  assert.equal(round.id, 1);
  assert.equal(round.dedupe instanceof Set, true);
  assert.equal(round.dedupe.has("msg-1"), true);
});

