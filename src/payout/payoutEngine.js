class PayoutEngine {
  constructor(config, store, jackpot) {
    this.config = config;
    this.store = store;
    this.jackpot = jackpot;
  }

  getMultiplier(slotId) {
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
