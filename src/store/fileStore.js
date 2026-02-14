const fs = require("fs");
const path = require("path");

const { MemoryStore } = require("./memoryStore");

const SNAPSHOT_VERSION = 1;

class FileStore extends MemoryStore {
  constructor(config, options = {}) {
    super(config);
    this.filePath = options.filePath || config.storeFilePath;
    this._isHydrating = true;
    this._hydrateFromDisk();
    this._isHydrating = false;
    this._persistSnapshot();
  }

  onStateChanged() {
    if (this._isHydrating) return;
    this._persistSnapshot();
  }

  _hydrateFromDisk() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid store snapshot JSON: ${err.message}`);
    }

    if (!parsed || typeof parsed !== "object") return;

    const users = new Map();
    const rawUsers = parsed.users && typeof parsed.users === "object"
      ? parsed.users
      : {};

    Object.entries(rawUsers).forEach(([id, data]) => {
      if (!id) return;
      const ledger = Array.isArray(data?.ledger)
        ? data.ledger
            .filter((entry) => Number.isFinite(entry?.delta))
            .map((entry) => ({
              delta: Number.parseInt(entry.delta, 10),
              reason: String(entry.reason || "unknown"),
              createdAt: Number.parseInt(entry.createdAt, 10) || Date.now(),
              expiresAt:
                Number.parseInt(entry.expiresAt, 10) ||
                Date.now() + this.config.pointExpireHours * 3600 * 1000
            }))
        : [];

      users.set(id, {
        id,
        ledger,
        lastBonusAt: Number.parseInt(data?.lastBonusAt, 10) || 0,
        lastBetPlan: Array.isArray(data?.lastBetPlan)
          ? data.lastBetPlan
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
          : []
      });
    });

    this.users = users;
    this.jackpotPool = Number.parseInt(parsed.jackpotPool, 10) || 0;
    this.lastResult =
      parsed.lastResult && typeof parsed.lastResult === "object"
        ? parsed.lastResult
        : null;
    this.currentRound = this._deserializeRound(parsed.currentRound);
  }

  _deserializeRound(rawRound) {
    if (!rawRound || typeof rawRound !== "object") return null;
    const dedupeList = Array.isArray(rawRound.dedupe) ? rawRound.dedupe : [];
    return {
      ...rawRound,
      bets: Array.isArray(rawRound.bets) ? rawRound.bets : [],
      dedupe: new Set(dedupeList.map((x) => String(x)))
    };
  }

  _serializeRound(round) {
    if (!round) return null;
    return {
      ...round,
      dedupe: Array.from(round.dedupe || [])
    };
  }

  _toSnapshot() {
    const users = {};
    this.users.forEach((user, id) => {
      users[id] = {
        id,
        ledger: user.ledger,
        lastBonusAt: user.lastBonusAt || 0,
        lastBetPlan: Array.isArray(user.lastBetPlan) ? user.lastBetPlan : []
      };
    });

    return {
      version: SNAPSHOT_VERSION,
      updatedAt: Date.now(),
      jackpotPool: this.jackpotPool,
      lastResult: this.lastResult,
      currentRound: this._serializeRound(this.currentRound),
      users
    };
  }

  _persistSnapshot() {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const snapshot = this._toSnapshot();
    const tempFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), "utf8");
    fs.renameSync(tempFile, this.filePath);
  }
}

module.exports = {
  FileStore
};
