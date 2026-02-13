const { randInt } = require("../utils/math");
const { runSpin } = require("../spin/spinEngine");
const { pickMarkerCount } = require("../spin/markerSelector");

class RoundEngine {
  constructor({
    config,
    store,
    payoutEngine,
    track,
    jackpotSlots,
    respinSlots,
    broadcaster
  }) {
    this.config = config;
    this.store = store;
    this.payoutEngine = payoutEngine;
    this.track = track;
    this.trackLen = track.length;
    this.jackpotSlots = jackpotSlots;
    this.respinSlots = respinSlots;
    this.broadcaster = broadcaster;
    this.roundId = 0;
    this.closeBetTimer = null;
    this.nextRoundTimer = null;
  }

  start() {
    this._startRound();
  }

  placeBet({ userId, slotId, amount, sourceMsgId }) {
    const round = this.store.getCurrentRound();
    if (
      !round ||
      (round.status !== "waiting_bets" && round.status !== "betting")
    ) {
      return { ok: false, reason: "bet_closed" };
    }
    const safeSlot = Number.parseInt(slotId, 10);
    if (!Number.isFinite(safeSlot) || safeSlot < 0 || safeSlot >= this.trackLen) {
      return { ok: false, reason: "invalid_slot" };
    }
    const betAmount = Number.parseInt(amount, 10);
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    const currentPoints = this.store.getUserPoints(userId);
    if (currentPoints < betAmount) {
      return { ok: false, reason: "insufficient_points" };
    }

    const bet = {
      userId,
      slotId: safeSlot,
      amount: betAmount,
      sourceMsgId: sourceMsgId || `${userId}-${Date.now()}-${Math.random()}`
    };
    const result = this.store.addBet(round.id, bet);
    if (!result.ok) return result;
    this.store.addLedger(userId, -betAmount, "bet");
    const jackpotPool = this.store.addJackpotContribution(betAmount);

    if (round.status === "waiting_bets") {
      this._activateBettingWindow(round);
    }

    this.broadcaster({
      type: "bet_accepted",
      roundId: round.id,
      userId,
      slotId: safeSlot,
      amount: betAmount,
      jackpotPool
    });
    return { ok: true };
  }

  _startRound() {
    if (this.closeBetTimer) {
      clearTimeout(this.closeBetTimer);
      this.closeBetTimer = null;
    }
    if (this.nextRoundTimer) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }

    this.roundId += 1;
    const now = Date.now();
    const round = {
      id: this.roundId,
      status: "waiting_bets",
      startTime: now,
      betDeadline: 0
    };
    this.store.createRound(round);
    this.broadcaster({
      type: "round_waiting_bets",
      roundId: round.id,
      waitingSince: now
    });
  }

  _activateBettingWindow(round) {
    if (!round || round.status !== "waiting_bets") return;

    const now = Date.now();
    round.status = "betting";
    round.betStartTime = now;
    round.betDeadline = now + this.config.betWindowSec * 1000;
    if (typeof this.store.touchCurrentRound === "function") {
      this.store.touchCurrentRound();
    }

    this.broadcaster({
      type: "round_started",
      roundId: round.id,
      betDeadline: round.betDeadline,
      betWindowSec: this.config.betWindowSec
    });

    if (this.closeBetTimer) clearTimeout(this.closeBetTimer);
    const closeDelayMs = Math.max(0, this.config.betWindowSec * 1000);
    this.closeBetTimer = setTimeout(() => {
      this.closeBetTimer = null;
      this._closeBetting(round.id);
    }, closeDelayMs);
  }

  _closeBetting(roundId) {
    const round = this.store.getCurrentRound();
    if (!round || round.id !== roundId || round.status !== "betting") return;

    if (!Array.isArray(round.bets) || round.bets.length === 0) {
      round.status = "waiting_bets";
      round.betDeadline = 0;
      if (typeof this.store.touchCurrentRound === "function") {
        this.store.touchCurrentRound();
      }
      this.broadcaster({
        type: "round_waiting_bets",
        roundId: round.id,
        waitingSince: Date.now(),
        reason: "no_valid_bet"
      });
      return;
    }

    round.status = "spinning";
    if (typeof this.store.touchCurrentRound === "function") {
      this.store.touchCurrentRound();
    }

    const markerCount = pickMarkerCount(
      this.config.markerCounts,
      this.config.markerCountWeights
    );
    const startIndex = randInt(0, Math.max(this.trackLen - 1, 0));
    const loops = randInt(2, 4);
    const steps = this.trackLen * loops + randInt(0, Math.max(this.trackLen - 1, 0));
    const direction =
      this.config.spinDirectionMode === "counter" ? -1 : 1;

    const spin = runSpin({
      trackLen: this.trackLen,
      startIndex,
      direction,
      markerCount,
      steps
    });

    const respinTriggered = spin.finalSlots.some((s) =>
      this.respinSlots.includes(s)
    );
    const respins = [];
    if (respinTriggered) {
      const count = randInt(this.config.respinMin, this.config.respinMax);
      for (let i = 0; i < count; i += 1) {
        const respinStart = randInt(0, Math.max(this.trackLen - 1, 0));
        const respinSteps =
          this.trackLen + randInt(0, Math.max(this.trackLen - 1, 0));
        const respinSpin = runSpin({
          trackLen: this.trackLen,
          startIndex: respinStart,
          direction,
          markerCount: 1,
          steps: respinSteps
        });
        respins.push(respinSpin);
      }
    }

    round.spin = spin;
    round.markerCount = markerCount;
    round.respins = respins;

    this.broadcaster({
      type: "round_spin",
      roundId: round.id,
      spin,
      respins,
      markerCount
    });

    setTimeout(
      () => this._settleRound(round.id),
      this.config.spinDurationSec * 1000
    );
  }

  _settleRound(roundId) {
    const round = this.store.getCurrentRound();
    if (!round || round.id !== roundId || round.status !== "spinning") return;
    round.status = "settled";
    if (typeof this.store.touchCurrentRound === "function") {
      this.store.touchCurrentRound();
    }

    const participants = new Set(round.bets.map((b) => b.userId));
    const pointsBeforeSettle = new Map();
    participants.forEach((userId) => {
      pointsBeforeSettle.set(userId, this.store.getUserPoints(userId));
    });

    const winDeltaByUser = new Map();
    const addWinDelta = (userId, delta) => {
      if (!userId || !Number.isFinite(delta) || delta <= 0) return;
      winDeltaByUser.set(userId, (winDeltaByUser.get(userId) || 0) + delta);
    };

    const winSlotsMain = round.spin.finalSlots;
    const payoutsMain = this.payoutEngine.applyBets(
      round,
      winSlotsMain,
      "win"
    );
    payoutsMain.forEach((item) => addWinDelta(item.userId, item.delta));

    const payoutsRespins = [];
    for (const respin of round.respins) {
      const payouts = this.payoutEngine.applyBets(
        round,
        respin.finalSlots,
        "respin"
      );
      payoutsRespins.push(...payouts);
      payouts.forEach((item) => addWinDelta(item.userId, item.delta));
    }

    const jackpotWinners = round.bets.filter(
      (bet) =>
        bet.slotId === this.jackpotSlots.big ||
        bet.slotId === this.jackpotSlots.small
    );
    let jackpotPoolPaid = 0;
    const jackpotPoolPayouts = [];
    if (jackpotWinners.length > 0) {
      const pool = this.store.getJackpotPool();
      if (pool > 0) {
        const totalBet = jackpotWinners.reduce(
          (acc, bet) => acc + bet.amount,
          0
        );
        let remainder = pool;
        jackpotWinners.forEach((bet, idx) => {
          const share =
            idx === jackpotWinners.length - 1
              ? remainder
              : Math.floor((pool * bet.amount) / totalBet);
          remainder -= share;
          if (share > 0) {
            this.store.addLedger(bet.userId, share, "jackpot_pool");
            jackpotPoolPaid += share;
            jackpotPoolPayouts.push({
              userId: bet.userId,
              delta: share
            });
            addWinDelta(bet.userId, share);
          }
        });
        this.store.resetJackpotPool();
      }
    }

    for (const userId of participants) {
      this.store.maybeGrantBonus(userId);
    }

    const settlementHighlights = [];
    participants.forEach((userId) => {
      const winPoints = winDeltaByUser.get(userId) || 0;
      if (winPoints <= 0) return;
      settlementHighlights.push({
        userId,
        pointsBefore: pointsBeforeSettle.get(userId) || 0,
        winPoints,
        pointsAfter: this.store.getUserPoints(userId)
      });
    });
    settlementHighlights.sort((a, b) => {
      if (b.winPoints !== a.winPoints) return b.winPoints - a.winPoints;
      if (b.pointsAfter !== a.pointsAfter) return b.pointsAfter - a.pointsAfter;
      return String(a.userId).localeCompare(String(b.userId));
    });
    const maxHighlights = Math.max(
      1,
      Number.parseInt(this.config.settlementHighlightLimit, 10) || 12
    );

    const leaderboard = this.store.getLeaderboard(this.config.leaderboardLimit);
    const result = {
      roundId: round.id,
      markerCount: round.markerCount,
      finalSlots: round.spin.finalSlots,
      respins: round.respins,
      payoutsMain,
      payoutsRespins,
      jackpotPoolPayouts,
      jackpotPoolPaid,
      settlementHighlights: settlementHighlights.slice(0, maxHighlights),
      settledAt: Date.now()
    };
    this.store.setLastResult(result);

    this.broadcaster({
      type: "round_settled",
      roundId: round.id,
      result,
      jackpotPool: this.store.getJackpotPool(),
      leaderboard,
      settlementHighlights: result.settlementHighlights,
      autoNextRoundInSec: this.config.settlePauseSec
    });

    const settlePauseMs = Math.max(0, this.config.settlePauseSec * 1000);
    this.nextRoundTimer = setTimeout(() => {
      this.nextRoundTimer = null;
      this._startRound();
    }, settlePauseMs);
  }
}

module.exports = { RoundEngine };
