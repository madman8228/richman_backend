class PayoutEngine {
  constructor(config, store, jackpot) {
    this.config = config;
    this.store = store;
    this.jackpot = jackpot;
  }

  getPoolJackpotSlotId() {
    if (!this.config.poolJackpotEnabled) return null;
    const slotType =
      String(this.config.poolJackpotSlot || "big").toLowerCase() === "small"
        ? "small"
        : "big";
    const slotId = Number.parseInt(this.jackpot?.[slotType], 10);
    return Number.isFinite(slotId) ? slotId : null;
  }

  getMultiplier(slotId) {
    const slotMap =
      this.config && this.config.slotMultipliers
        ? this.config.slotMultipliers
        : null;
    const hasPerSlotConfig =
      slotMap && Object.keys(slotMap).length > 0;

    if (hasPerSlotConfig) {
      const key = String(slotId);
      if (Object.prototype.hasOwnProperty.call(slotMap, key)) {
        const mult = Number.parseInt(slotMap[key], 10);
        return Number.isFinite(mult) && mult >= 0 ? mult : 0;
      }
      if (this.config.slotMultipliersStrict !== false) {
        return 0;
      }
    }

    const poolJackpotSlotId = this.getPoolJackpotSlotId();
    if (
      poolJackpotSlotId !== null &&
      slotId === poolJackpotSlotId &&
      !this.config.poolJackpotKeepBaseMult
    ) {
      return 0;
    }

    if (slotId === this.jackpot.big) return this.config.jackpotBigMult;
    if (slotId === this.jackpot.small) return this.config.jackpotSmallMult;
    return this.config.normalMult;
  }

  applyBets(round, winningSlots, reason) {
    const payouts = [];
    const winningSet = new Set(winningSlots);
    for (const bet of round.bets) {
      if (!winningSet.has(bet.slotId)) continue;
      const mult = this.getMultiplier(bet.slotId);
      if (!Number.isFinite(mult) || mult <= 0) continue;
      const delta = bet.amount * mult;
      const finalReason =
        bet.slotId === this.jackpot.big || bet.slotId === this.jackpot.small
          ? "jackpot"
          : reason;
      const actual = this.store.addLedger(bet.userId, delta, finalReason);
      payouts.push({
        userId: bet.userId,
        slotId: bet.slotId,
        amount: bet.amount,
        multiplier: mult,
        delta: actual
      });
    }
    return payouts;
  }
}

module.exports = { PayoutEngine };
