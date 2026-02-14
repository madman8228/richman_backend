const { randInt, pickWeighted, normalizeIndex } = require("../utils/math");
const { runSpin } = require("../spin/spinEngine");
const { pickMarkerCount } = require("../spin/markerSelector");
const {
  ROUND_MODE,
  LIGHT_MODE,
  DEFAULT_ROUND_MODES,
  DEFAULT_ROUND_MODE_WEIGHTS,
  DEFAULT_NORMAL_LUCK_WEIGHTS
} = require("./roundModes");

const RESPIN_MODE = "respin";

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
    this.luckLeftTargets = this._buildLuckTargets("left");
    this.luckRightTargets = this._buildLuckTargets("right");
  }

  start() {
    this._startRound();
  }

  placeBet({ userId, slotId, amount, sourceMsgId, reuseLastBet, betPlan }) {
    const round = this.store.getCurrentRound();
    if (
      !round ||
      (round.status !== "waiting_bets" && round.status !== "betting")
    ) {
      return { ok: false, reason: "bet_closed" };
    }
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return { ok: false, reason: "invalid_user" };
    }

    if (reuseLastBet) {
      return this._placeReuseBet({
        round,
        userId: safeUserId,
        sourceMsgId
      });
    }

    const normalizeResult = this._normalizeBetPlan(
      Array.isArray(betPlan) && betPlan.length
        ? betPlan
        : [{ slotId, amount }]
    );
    if (!normalizeResult.ok) {
      return { ok: false, reason: normalizeResult.reason };
    }

    const totalAmount = normalizeResult.plan.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    const currentPoints = this.store.getUserPoints(safeUserId);
    if (currentPoints < totalAmount) {
      return {
        ok: false,
        reason: "insufficient_points",
        currentPoints,
        requiredPoints: totalAmount
      };
    }

    const applyResult = this._applyBetPlan({
      round,
      userId: safeUserId,
      plan: normalizeResult.plan,
      sourceMsgId
    });
    if (!applyResult.ok) return applyResult;
    this.store.setLastBetPlan(safeUserId, normalizeResult.plan);
    return applyResult;
  }

  _normalizeBetPlan(rawPlan) {
    if (!Array.isArray(rawPlan) || rawPlan.length === 0) {
      return { ok: false, reason: "invalid_bet_plan" };
    }
    const plan = [];
    for (const item of rawPlan) {
      const safeSlot = Number.parseInt(item?.slotId, 10);
      if (
        !Number.isFinite(safeSlot) ||
        safeSlot < 0 ||
        safeSlot >= this.trackLen
      ) {
        return { ok: false, reason: "invalid_slot" };
      }
      const betAmount = Number.parseInt(item?.amount, 10);
      if (!Number.isFinite(betAmount) || betAmount <= 0) {
        return { ok: false, reason: "invalid_amount" };
      }
      plan.push({
        slotId: safeSlot,
        amount: betAmount
      });
    }
    return { ok: true, plan };
  }

  _placeReuseBet({ round, userId, sourceMsgId }) {
    const lastPlan = this.store.getLastBetPlan(userId);
    const normalizeResult = this._normalizeBetPlan(lastPlan);
    if (!normalizeResult.ok || normalizeResult.plan.length === 0) {
      return { ok: false, reason: "no_last_bet" };
    }

    const requiredPoints = normalizeResult.plan.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    const currentPoints = this.store.getUserPoints(userId);
    if (currentPoints < requiredPoints) {
      return {
        ok: false,
        reason: "insufficient_points",
        currentPoints,
        requiredPoints
      };
    }

    const applyResult = this._applyBetPlan({
      round,
      userId,
      plan: normalizeResult.plan,
      sourceMsgId: sourceMsgId || `${userId}-reuse-${Date.now()}`
    });
    if (!applyResult.ok) return applyResult;
    return {
      ...applyResult,
      reused: true
    };
  }

  _applyBetPlan({ round, userId, plan, sourceMsgId }) {
    if (!Array.isArray(plan) || plan.length === 0) {
      return { ok: false, reason: "invalid_bet_plan" };
    }
    if (round.status === "waiting_bets") {
      this._activateBettingWindow(round);
    }

    let accepted = 0;
    let jackpotPool = this.store.getJackpotPool();
    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      const safeSource = sourceMsgId
        ? `${sourceMsgId}-${i}`
        : `${userId}-${Date.now()}-${Math.random()}-${i}`;
      const bet = {
        userId,
        slotId: item.slotId,
        amount: item.amount,
        sourceMsgId: safeSource
      };
      const addResult = this.store.addBet(round.id, bet);
      if (!addResult.ok) {
        if (accepted > 0) continue;
        return addResult;
      }
      this.store.addLedger(userId, -item.amount, "bet");
      jackpotPool = this.store.addJackpotContribution(item.amount);
      accepted += 1;

      this.broadcaster({
        type: "bet_accepted",
        roundId: round.id,
        userId,
        slotId: item.slotId,
        amount: item.amount,
        jackpotPool
      });
    }

    if (accepted <= 0) {
      return { ok: false, reason: "duplicate" };
    }
    return {
      ok: true,
      accepted,
      jackpotPool
    };
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

    const mode = this._pickRoundMode();
    const markerCount =
      mode === ROUND_MODE.NORMAL
        ? pickMarkerCount(
            this.config.markerCounts,
            this.config.markerCountWeights
          )
        : 1;
    const spin = this._buildMainSpin(mode, markerCount);
    const respins = [];

    const respinTriggered = spin.finalSlots.some((s) =>
      this.respinSlots.includes(s)
    );
    if (respinTriggered) {
      const count = randInt(this.config.respinMin, this.config.respinMax);
      for (let i = 0; i < count; i += 1) {
        respins.push(this._buildStandardRespin());
      }
    }

    if (mode === ROUND_MODE.KING) {
      respins.push(this._buildLuckSpin(ROUND_MODE.LUCK_RIGHT));
    } else if (mode === ROUND_MODE.NORMAL) {
      const luckMode = this._pickNormalLuckMode();
      if (luckMode === ROUND_MODE.LUCK_LEFT || luckMode === ROUND_MODE.LUCK_RIGHT) {
        respins.push(this._buildLuckSpin(luckMode));
      }
    }

    round.spin = spin;
    round.mode = mode;
    round.markerCount = markerCount;
    round.respins = respins;

    this.broadcaster({
      type: "round_spin",
      roundId: round.id,
      mode,
      spin,
      respins,
      markerCount
    });

    setTimeout(
      () => this._settleRound(round.id),
      this.config.spinDurationSec * 1000
    );
  }

  _pickDirection() {
    return this.config.spinDirectionMode === "counter" ? -1 : 1;
  }

  _safeWeightedPick(items, weights, fallback) {
    if (!Array.isArray(items) || items.length === 0) return fallback;
    if (!Array.isArray(weights) || weights.length !== items.length) {
      return items[0];
    }
    const safeWeights = weights.map((w) =>
      Number.isFinite(w) && w > 0 ? w : 0
    );
    const total = safeWeights.reduce((acc, w) => acc + w, 0);
    if (total <= 0) return items[0];
    return pickWeighted(items, safeWeights);
  }

  _pickRoundMode() {
    const validModes = new Set(Object.values(ROUND_MODE));
    const configuredModes = Array.isArray(this.config.roundModes)
      ? this.config.roundModes
          .map((mode) => String(mode || "").trim().toLowerCase())
          .filter((mode) => validModes.has(mode))
      : [];
    const modes =
      configuredModes.length > 0 ? configuredModes : DEFAULT_ROUND_MODES;
    const configuredWeights = Array.isArray(this.config.roundModeWeights)
      ? this.config.roundModeWeights
      : [];
    const weights =
      configuredWeights.length === modes.length
        ? configuredWeights
        : modes.map((_, idx) => DEFAULT_ROUND_MODE_WEIGHTS[idx] || 1);
    return this._safeWeightedPick(modes, weights, ROUND_MODE.NORMAL);
  }

  _pickNormalLuckMode() {
    const items = ["none", ROUND_MODE.LUCK_LEFT, ROUND_MODE.LUCK_RIGHT];
    const configuredWeights = Array.isArray(this.config.normalLuckModeWeights)
      ? this.config.normalLuckModeWeights
      : [];
    const weights =
      configuredWeights.length === items.length
        ? configuredWeights
        : DEFAULT_NORMAL_LUCK_WEIGHTS;
    return this._safeWeightedPick(items, weights, "none");
  }

  _randomStartIndex() {
    return randInt(0, Math.max(this.trackLen - 1, 0));
  }

  _randomSpin({
    markerCount,
    loopsMin = 2,
    loopsMax = 4,
    mode = ROUND_MODE.NORMAL,
    lightMode = LIGHT_MODE.NORMAL,
    intervalScale = 1,
    extraMeta = {}
  }) {
    const startIndex = this._randomStartIndex();
    const loops = randInt(loopsMin, loopsMax);
    const steps = this.trackLen * loops + randInt(0, Math.max(this.trackLen - 1, 0));
    const direction = this._pickDirection();
    const spin = runSpin({
      trackLen: this.trackLen,
      startIndex,
      direction,
      markerCount,
      steps
    });
    return {
      ...spin,
      mode,
      lightMode,
      intervalScale,
      ...extraMeta
    };
  }

  _targetSpin({
    targetSlot,
    markerCount = 1,
    loopsMin = 2,
    loopsMax = 4,
    mode = ROUND_MODE.NORMAL,
    lightMode = LIGHT_MODE.NORMAL,
    intervalScale = 1,
    extraMeta = {}
  }) {
    const startIndex = this._randomStartIndex();
    const direction = this._pickDirection();
    const loops = randInt(loopsMin, loopsMax);
    const baseSteps =
      direction >= 0
        ? normalizeIndex(targetSlot - startIndex, this.trackLen)
        : normalizeIndex(startIndex - targetSlot, this.trackLen);
    const steps = this.trackLen * loops + baseSteps;
    const spin = runSpin({
      trackLen: this.trackLen,
      startIndex,
      direction,
      markerCount,
      steps
    });
    return {
      ...spin,
      mode,
      lightMode,
      intervalScale,
      ...extraMeta
    };
  }

  _pickKingTarget() {
    return this._safeWeightedPick(
      [this.jackpotSlots.small, this.jackpotSlots.big],
      [40, 60],
      this.jackpotSlots.big
    );
  }

  _buildLuckTargets(side) {
    if (this.trackLen === 24) {
      const idxs =
        side === "left" ? [0, 1, 6, 12, 13, 18] : [7, 15, 19];
      return idxs.filter((idx) => idx >= 0 && idx < this.trackLen);
    }
    if (!Array.isArray(this.track) || this.track.length === 0) return [0];
    const maxCol = this.track.reduce((max, pos) => Math.max(max, pos.c), 0);
    const candidates = this.track
      .filter((pos) => (side === "left" ? pos.c === 0 : pos.c === maxCol))
      .map((pos) => pos.id);
    return candidates.length > 0 ? candidates : this.track.map((pos) => pos.id);
  }

  _pickLuckTarget(mode) {
    const source =
      mode === ROUND_MODE.LUCK_LEFT
        ? this.luckLeftTargets
        : this.luckRightTargets;
    if (!Array.isArray(source) || source.length === 0) return this._randomStartIndex();
    return source[randInt(0, source.length - 1)];
  }

  _buildMainSpin(mode, markerCount) {
    if (mode === ROUND_MODE.TRAIN) {
      return this._randomSpin({
        markerCount: 1,
        loopsMin: 3,
        loopsMax: 5,
        mode,
        lightMode: LIGHT_MODE.TRAIN,
        intervalScale: 0.5,
        extraMeta: { trainLength: 6 }
      });
    }
    if (mode === ROUND_MODE.KING) {
      return this._targetSpin({
        targetSlot: this._pickKingTarget(),
        markerCount: 1,
        loopsMin: 3,
        loopsMax: 4,
        mode,
        lightMode: LIGHT_MODE.SHINING,
        intervalScale: 0.72,
        extraMeta: { shiningCycles: 10 }
      });
    }
    return this._randomSpin({
      markerCount,
      loopsMin: 2,
      loopsMax: 4,
      mode: ROUND_MODE.NORMAL,
      lightMode: LIGHT_MODE.NORMAL,
      intervalScale: 1
    });
  }

  _buildStandardRespin() {
    return this._randomSpin({
      markerCount: 1,
      loopsMin: 1,
      loopsMax: 2,
      mode: RESPIN_MODE,
      lightMode: LIGHT_MODE.NORMAL,
      intervalScale: 0.85
    });
  }

  _buildLuckSpin(mode) {
    return this._targetSpin({
      targetSlot: this._pickLuckTarget(mode),
      markerCount: 1,
      loopsMin: 1,
      loopsMax: 2,
      mode,
      lightMode: LIGHT_MODE.SHINING,
      intervalScale: 0.68,
      extraMeta: { shiningCycles: 6 }
    });
  }

  _resolvePoolJackpotSlotId() {
    const slotType =
      String(this.config.poolJackpotSlot || "big").toLowerCase() === "small"
        ? "small"
        : "big";
    const slotId = Number.parseInt(this.jackpotSlots?.[slotType], 10);
    return Number.isFinite(slotId) ? slotId : -1;
  }

  _collectWinningSlots(round) {
    const set = new Set();
    if (Array.isArray(round?.spin?.finalSlots)) {
      round.spin.finalSlots.forEach((slotId) => {
        const safeSlot = Number.parseInt(slotId, 10);
        if (Number.isFinite(safeSlot)) set.add(safeSlot);
      });
    }
    if (Array.isArray(round?.respins)) {
      round.respins.forEach((respin) => {
        if (!Array.isArray(respin?.finalSlots)) return;
        respin.finalSlots.forEach((slotId) => {
          const safeSlot = Number.parseInt(slotId, 10);
          if (Number.isFinite(safeSlot)) set.add(safeSlot);
        });
      });
    }
    return set;
  }

  _distributeJackpotPool({ winners, addWinDelta, reason }) {
    const jackpotPoolPayouts = [];
    let jackpotPoolPaid = 0;
    if (!Array.isArray(winners) || winners.length === 0) {
      return { jackpotPoolPayouts, jackpotPoolPaid };
    }
    const pool = this.store.getJackpotPool();
    if (!Number.isFinite(pool) || pool <= 0) {
      return { jackpotPoolPayouts, jackpotPoolPaid };
    }
    const totalBet = winners.reduce((acc, bet) => acc + bet.amount, 0);
    if (!Number.isFinite(totalBet) || totalBet <= 0) {
      return { jackpotPoolPayouts, jackpotPoolPaid };
    }

    let remainder = pool;
    winners.forEach((bet, idx) => {
      const share =
        idx === winners.length - 1
          ? remainder
          : Math.floor((pool * bet.amount) / totalBet);
      remainder -= share;
      if (share <= 0) return;
      this.store.addLedger(bet.userId, share, reason || "jackpot_pool");
      jackpotPoolPaid += share;
      jackpotPoolPayouts.push({
        userId: bet.userId,
        delta: share
      });
      addWinDelta(bet.userId, share);
    });

    if (jackpotPoolPaid > 0) {
      this.store.resetJackpotPool();
    }
    return { jackpotPoolPayouts, jackpotPoolPaid };
  }

  _settlePoolJackpotLegacy(round, addWinDelta) {
    const winners = round.bets.filter(
      (bet) =>
        bet.slotId === this.jackpotSlots.big ||
        bet.slotId === this.jackpotSlots.small
    );
    const payout = this._distributeJackpotPool({
      winners,
      addWinDelta,
      reason: "jackpot_pool"
    });
    return {
      ...payout,
      poolJackpotEnabled: false,
      poolJackpotSlotId: null,
      poolJackpotHit: winners.length > 0
    };
  }

  _settlePoolJackpotFeature(round, addWinDelta, winningSlotSet) {
    const poolJackpotSlotId = this._resolvePoolJackpotSlotId();
    if (poolJackpotSlotId < 0) {
      return {
        jackpotPoolPayouts: [],
        jackpotPoolPaid: 0,
        poolJackpotEnabled: true,
        poolJackpotSlotId,
        poolJackpotHit: false
      };
    }
    const requireHit = this.config.poolJackpotRequireHit !== false;
    const isHit = winningSlotSet.has(poolJackpotSlotId);
    if (requireHit && !isHit) {
      return {
        jackpotPoolPayouts: [],
        jackpotPoolPaid: 0,
        poolJackpotEnabled: true,
        poolJackpotSlotId,
        poolJackpotHit: false
      };
    }
    const winners = round.bets.filter((bet) => bet.slotId === poolJackpotSlotId);
    const payout = this._distributeJackpotPool({
      winners,
      addWinDelta,
      reason: "pool_jackpot"
    });
    return {
      ...payout,
      poolJackpotEnabled: true,
      poolJackpotSlotId,
      poolJackpotHit: isHit
    };
  }

  _settlePoolJackpot(round, addWinDelta, winningSlotSet) {
    if (this.config.poolJackpotEnabled === false) {
      return this._settlePoolJackpotLegacy(round, addWinDelta);
    }
    return this._settlePoolJackpotFeature(round, addWinDelta, winningSlotSet);
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

    const winningSlotSet = this._collectWinningSlots(round);
    const poolJackpotResult = this._settlePoolJackpot(
      round,
      addWinDelta,
      winningSlotSet
    );

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
      mode: round.mode || ROUND_MODE.NORMAL,
      markerCount: round.markerCount,
      finalSlots: round.spin.finalSlots,
      respins: round.respins,
      payoutsMain,
      payoutsRespins,
      jackpotPoolPayouts: poolJackpotResult.jackpotPoolPayouts,
      jackpotPoolPaid: poolJackpotResult.jackpotPoolPaid,
      poolJackpotEnabled: poolJackpotResult.poolJackpotEnabled,
      poolJackpotSlotId: poolJackpotResult.poolJackpotSlotId,
      poolJackpotHit: poolJackpotResult.poolJackpotHit,
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
