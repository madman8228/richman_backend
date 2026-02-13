const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const toInt = (val, fallback) => {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (val, fallback) => {
  if (val === undefined) return fallback;
  if (val === "1" || val === "true") return true;
  if (val === "0" || val === "false") return false;
  return fallback;
};

const toFloat = (val, fallback) => {
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (val, fallback, mapper = (v) => v) => {
  if (!val) return fallback;
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(mapper);
};

const toSlots = (val) => {
  if (!val) return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
};

const config = {
  port: toInt(process.env.PORT, 3000),
  appMode: process.env.APP_MODE || "local",
  storeMode: (process.env.STORE_MODE || "file").toLowerCase(),
  storeFilePath: path.resolve(
    process.env.STORE_FILE_PATH || path.join(process.cwd(), "data", "store.json")
  ),
  allowLocalSimulator: toBool(
    process.env.ALLOW_LOCAL_SIMULATOR,
    process.env.APP_MODE !== "production"
  ),
  publicDir: process.env.PUBLIC_DIR || "",
  betWindowSec: toInt(process.env.BET_WINDOW_SEC, 10),
  roundIntervalSec: toInt(process.env.ROUND_INTERVAL_SEC, 15),
  spinDurationSec: toInt(process.env.SPIN_DURATION_SEC, 6),
  settlePauseSec: toInt(process.env.SETTLE_PAUSE_SEC, 3),
  settlementHighlightLimit: toInt(process.env.SETTLEMENT_HIGHLIGHT_LIMIT, 12),
  spinDirectionMode: process.env.SPIN_DIRECTION_MODE || "clockwise",
  gridRows: toInt(process.env.GRID_ROWS, 11),
  gridCols: toInt(process.env.GRID_COLS, 11),
  trackMode: process.env.TRACK_MODE || "perimeter",
  trackCustomPath: process.env.TRACK_CUSTOM_PATH || "",
  markerCounts: toList(process.env.MARKER_COUNTS, [1, 6, 8], (v) =>
    Number.parseInt(v, 10)
  ),
  markerCountWeights: toList(
    process.env.MARKER_COUNT_WEIGHTS,
    [9900, 50, 50],
    (v) => Number.parseInt(v, 10)
  ),
  normalMult: toInt(process.env.NORMAL_MULT, 2),
  jackpotPoolRate: toFloat(process.env.JACKPOT_POOL_RATE, 0.02),
  jackpotSmallMult: toInt(process.env.JACKPOT_SMALL_MULT, 20),
  jackpotBigMult: toInt(process.env.JACKPOT_BIG_MULT, 50),
  jackpotSlots: toSlots(process.env.JACKPOT_SLOTS),
  respinSlots: toSlots(process.env.RESPIN_SLOTS),
  respinMin: toInt(process.env.RESPIN_MIN, 1),
  respinMax: toInt(process.env.RESPIN_MAX, 8),
  respinNoChain: toBool(process.env.RESPIN_NO_CHAIN, true),
  noPointBonusPoints: toInt(process.env.NO_POINT_BONUS_POINTS, 10),
  noPointBonusCooldownMin: toInt(
    process.env.NO_POINT_BONUS_COOLDOWN_MIN,
    60
  ),
  noPointBonusRequireZero: toBool(
    process.env.NO_POINT_BONUS_REQUIRE_ZERO,
    true
  ),
  leaderboardLimit: toInt(process.env.LEADERBOARD_LIMIT, 100),
  pointExpireHours: toInt(process.env.POINT_EXPIRE_HOURS, 24),
  localStartPoints: toInt(process.env.LOCAL_START_POINTS, 100)
};

module.exports = { config };
