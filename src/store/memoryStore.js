const { normalizeIndex } = require("../utils/math");

class MemoryStore {
  constructor(config) {
    this.config = config;
    this.users = new Map();
    this.currentRound = null;
    this.lastResult = null;
    this.jackpotPool = 0;
  }

  ensureUser(userId) {
    if (!this.users.has(userId)) {
      const now = Date.now();
      const user = {
        id: userId,
        ledger: [
          {
            delta: this.config.localStartPoints,
            reason: "seed",
            createdAt: now,
            expiresAt: now + this.config.pointExpireHours * 3600 * 1000
          }
        ],
        lastBonusAt: 0
      };
      this.users.set(userId, user);
    }
    return this.users.get(userId);
  }

  getUserPoints(userId) {
    const user = this.ensureUser(userId);
    const now = Date.now();
    user.ledger = user.ledger.filter((e) => e.expiresAt > now);
    return user.ledger.reduce((acc, e) => acc + e.delta, 0);
  }

  addLedger(userId, delta, reason) {
    const user = this.ensureUser(userId);
    const now = Date.now();
    const current = this.getUserPoints(userId);
    let actual = delta;
    if (current + delta < 0) actual = -current;
    user.ledger.push({
      delta: actual,
      reason,
      createdAt: now,
      expiresAt: now + this.config.pointExpireHours * 3600 * 1000
    });
    return actual;
  }

  addJackpotContribution(betAmount) {
    const rate = this.config.jackpotPoolRate || 0;
    if (rate <= 0) return this.jackpotPool;
    const add = Math.floor(betAmount * rate);
    if (add > 0) this.jackpotPool += add;
    return this.jackpotPool;
  }

  getJackpotPool() {
    return this.jackpotPool;
  }

  resetJackpotPool() {
    this.jackpotPool = 0;
  }

  maybeGrantBonus(userId) {
    if (!this.config.noPointBonusRequireZero) return false;
    const user = this.ensureUser(userId);
    const now = Date.now();
    const points = this.getUserPoints(userId);
    if (points !== 0) return false;
    if (now - user.lastBonusAt < this.config.noPointBonusCooldownMin * 60 * 1000)
      return false;
    this.addLedger(userId, this.config.noPointBonusPoints, "bonus");
    user.lastBonusAt = now;
    return true;
  }

  createRound(round) {
    this.currentRound = {
      ...round,
      bets: [],
      dedupe: new Set()
    };
  }

  addBet(roundId, bet) {
    if (!this.currentRound || this.currentRound.id !== roundId)
      return { ok: false, reason: "round_mismatch" };
    if (this.currentRound.dedupe.has(bet.sourceMsgId))
      return { ok: false, reason: "duplicate" };
    this.currentRound.dedupe.add(bet.sourceMsgId);
    this.currentRound.bets.push(bet);
    return { ok: true };
  }

  getCurrentRound() {
    return this.currentRound;
  }

  setLastResult(result) {
    this.lastResult = result;
  }

  getLastResult() {
    return this.lastResult;
  }

  getLeaderboard(limit) {
    const entries = [];
    for (const [id] of this.users.entries()) {
      entries.push({ id, points: this.getUserPoints(id) });
    }
    entries.sort((a, b) => b.points - a.points);
    return entries.slice(0, limit);
  }

  normalizeSlot(slot, trackLen) {
    return normalizeIndex(slot, trackLen);
  }
}

module.exports = { MemoryStore };
