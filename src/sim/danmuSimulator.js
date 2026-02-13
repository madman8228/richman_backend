const { randInt } = require("../utils/math");

const createDanmuSimulator = ({ roundEngine, trackLen }) => {
  const placeOne = (body) => {
    const { userId, slotId, amount, sourceMsgId } = body || {};
    const resolvedUserId = userId || `u${randInt(1000, 999999)}`;
    const resolvedSlot =
      Number.isFinite(Number.parseInt(slotId, 10))
        ? Number.parseInt(slotId, 10)
        : randInt(0, Math.max(trackLen - 1, 0));
    const resolvedAmount = Number.parseInt(amount, 10) || randInt(1, 10);

    return roundEngine.placeBet({
      userId: resolvedUserId,
      slotId: resolvedSlot,
      amount: resolvedAmount,
      sourceMsgId: sourceMsgId || `${resolvedUserId}-${Date.now()}`
    });
  };

  const placeBulk = (body) => {
    const { count, amountMin, amountMax } = body || {};
    const n = Number.parseInt(count, 10) || 100;
    const min = Number.parseInt(amountMin, 10) || 1;
    const max = Number.parseInt(amountMax, 10) || 10;
    let accepted = 0;
    for (let i = 0; i < n; i += 1) {
      const result = roundEngine.placeBet({
        userId: `u${randInt(1000, 999999)}`,
        slotId: randInt(0, Math.max(trackLen - 1, 0)),
        amount: randInt(min, max),
        sourceMsgId: `sim-${Date.now()}-${i}`
      });
      if (result.ok) accepted += 1;
    }
    return { ok: true, accepted };
  };

  return { placeOne, placeBulk };
};

module.exports = { createDanmuSimulator };
