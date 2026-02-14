const dotenv = require("dotenv");
const path = require("path");
const {
  DEFAULT_ROUND_MODES,
  DEFAULT_ROUND_MODE_WEIGHTS,
  DEFAULT_NORMAL_LUCK_WEIGHTS
} = require("./round/roundModes");

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

const toTextLines = (val, fallback) => {
  if (!val) return fallback;
  const lines = String(val)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : fallback;
};

const toSlotMultiplierMap = (val) => {
  if (!val) return {};
  const tokens = String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return {};

  const hasPairSyntax = tokens.some((token) => token.includes(":"));
  const map = {};

  if (hasPairSyntax) {
    tokens.forEach((token) => {
      const [slotRaw, multRaw] = token.split(":");
      const slotId = Number.parseInt(String(slotRaw || "").trim(), 10);
      const mult = Number.parseInt(String(multRaw || "").trim(), 10);
      if (!Number.isFinite(slotId) || slotId < 0) return;
      if (!Number.isFinite(mult) || mult < 0) return;
      map[slotId] = mult;
    });
    return map;
  }

  tokens.forEach((token, idx) => {
    const mult = Number.parseInt(token, 10);
    if (!Number.isFinite(mult) || mult < 0) return;
    map[idx] = mult;
  });
  return map;
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
  gridRows: toInt(process.env.GRID_ROWS, 7),
  gridCols: toInt(process.env.GRID_COLS, 7),
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
  roundModes: toList(
    process.env.ROUND_MODE_NAMES,
    DEFAULT_ROUND_MODES,
    (v) => String(v || "").trim().toLowerCase()
  ),
  roundModeWeights: toList(
    process.env.ROUND_MODE_WEIGHTS,
    DEFAULT_ROUND_MODE_WEIGHTS,
    (v) => Math.max(0, Number.parseInt(v, 10) || 0)
  ),
  normalLuckModeWeights: toList(
    process.env.NORMAL_LUCK_MODE_WEIGHTS,
    DEFAULT_NORMAL_LUCK_WEIGHTS,
    (v) => Math.max(0, Number.parseInt(v, 10) || 0)
  ),
  normalMult: toInt(process.env.NORMAL_MULT, 2),
  jackpotPoolRate: toFloat(process.env.JACKPOT_POOL_RATE, 0.02),
  jackpotSmallMult: toInt(process.env.JACKPOT_SMALL_MULT, 20),
  jackpotBigMult: toInt(process.env.JACKPOT_BIG_MULT, 50),
  poolJackpotEnabled: toBool(process.env.POOL_JACKPOT_ENABLED, true),
  poolJackpotSlot:
    String(process.env.POOL_JACKPOT_SLOT || "big")
      .trim()
      .toLowerCase() === "small"
      ? "small"
      : "big",
  poolJackpotRequireHit: toBool(process.env.POOL_JACKPOT_REQUIRE_HIT, true),
  poolJackpotKeepBaseMult: toBool(
    process.env.POOL_JACKPOT_KEEP_BASE_MULT,
    false
  ),
  jackpotSlots: toSlots(process.env.JACKPOT_SLOTS),
  respinSlots: toSlots(process.env.RESPIN_SLOTS),
  slotMultipliers: toSlotMultiplierMap(process.env.SLOT_MULTIPLIERS),
  slotMultipliersStrict: toBool(process.env.SLOT_MULTIPLIERS_STRICT, true),
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
  localStartPoints: toInt(process.env.LOCAL_START_POINTS, 100),
  quickBetGuideEnabled: toBool(process.env.QUICK_BET_GUIDE_ENABLED, true),
  quickBetGuideTitle:
    String(process.env.QUICK_BET_GUIDE_TITLE || "").trim() || "弹幕快捷押注",
  quickBetGuideExamples: toTextLines(process.env.QUICK_BET_GUIDE_EXAMPLES, [
    "1,2,4 @20 = 1/2/4 各押 20 分",
    "1-6 @100 = 1 到 6 各押 100 分",
    "0 = 复用上次押注"
  ])
};

module.exports = { config };
