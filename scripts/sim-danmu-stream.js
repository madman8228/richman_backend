/* eslint-disable no-console */
const BASE_URL = process.env.SIM_BASE_URL || "http://127.0.0.1:3000";
const TICK_MS = Number.parseInt(process.env.SIM_TICK_MS, 10) || 280;
const COUNT_PER_TICK = Number.parseInt(process.env.SIM_COUNT_PER_TICK, 10) || 18;
const AMOUNT_MIN = Number.parseInt(process.env.SIM_AMOUNT_MIN, 10) || 20;
const AMOUNT_MAX = Number.parseInt(process.env.SIM_AMOUNT_MAX, 10) || 700;
const PREMIUM_RATE = Number.parseFloat(process.env.SIM_PREMIUM_RATE) || 0.28;
const MID_RATE = Number.parseFloat(process.env.SIM_MID_RATE) || 0.4;
const USER_POOL_SIZE = Number.parseInt(process.env.SIM_USER_POOL_SIZE, 10) || 180;
const WALLET_FLOOR = Number.parseInt(process.env.SIM_WALLET_FLOOR, 10) || 1200;
const STATUS_LOG_MS = Number.parseInt(process.env.SIM_STATUS_LOG_MS, 10) || 2000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randInt = (min, max) =>
  Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);

const safeAmountMin = Math.max(1, AMOUNT_MIN);
const safeAmountMax = Math.max(safeAmountMin, AMOUNT_MAX);
const safePremiumRate = clamp(PREMIUM_RATE, 0, 1);
const safeMidRate = clamp(MID_RATE, 0, 1);
const safeUserPoolSize = clamp(USER_POOL_SIZE, 10, 5000);
const safeWalletFloor = Math.max(safeAmountMax, WALLET_FLOOR);

const users = Array.from({ length: safeUserPoolSize }, (_, i) => `sim_user_${i + 1}`);
const stats = {
  startedAt: Date.now(),
  attempted: 0,
  accepted: 0,
  rejected: 0,
  rejectedReasons: {}
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postJson = async (path, body) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  let payload = {};
  try {
    payload = await res.json();
  } catch (err) {
    payload = {};
  }
  if (!res.ok) {
    const msg = payload?.reason || payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload;
};

const getJson = async (path) => {
  const res = await fetch(`${BASE_URL}${path}`);
  let payload = {};
  try {
    payload = await res.json();
  } catch (err) {
    payload = {};
  }
  if (!res.ok) {
    const msg = payload?.reason || payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload;
};

const chooseAmount = () => {
  const roll = Math.random();
  const tier500Min = Math.max(safeAmountMin, 500);
  const tier250Min = Math.max(safeAmountMin, 250);
  const tier250Max = Math.min(safeAmountMax, 499);
  const tier50Min = Math.max(safeAmountMin, 50);
  const tier50Max = Math.min(safeAmountMax, 249);

  if (roll < safePremiumRate && safeAmountMax >= tier500Min) {
    return randInt(tier500Min, safeAmountMax);
  }
  if (roll < safePremiumRate + safeMidRate && tier250Max >= tier250Min) {
    return randInt(tier250Min, tier250Max);
  }
  if (tier50Max >= tier50Min) {
    return randInt(tier50Min, tier50Max);
  }
  return randInt(safeAmountMin, safeAmountMax);
};

const formatSeconds = (ms) => (ms / 1000).toFixed(1);

let tickTimer = null;
let logTimer = null;
let stopped = false;
let isTickRunning = false;
let trackLen = 40;

const tick = async () => {
  if (isTickRunning || stopped) return;
  isTickRunning = true;
  try {
    for (let i = 0; i < COUNT_PER_TICK; i += 1) {
      const userId = users[randInt(0, users.length - 1)];
      const amount = chooseAmount();
      const slotId = randInt(0, Math.max(0, trackLen - 1));

      try {
        await postJson("/api/sim/fund", {
          userId,
          points: safeWalletFloor,
          mode: "set_floor"
        });
      } catch (err) {
        stats.rejected += 1;
        stats.rejectedReasons.fund_failed =
          (stats.rejectedReasons.fund_failed || 0) + 1;
        continue;
      }

      stats.attempted += 1;
      try {
        const result = await postJson("/api/sim/bet", {
          userId,
          slotId,
          amount,
          sourceMsgId: `sim-stream-${Date.now()}-${i}-${randInt(1, 99999)}`
        });
        if (result?.ok) {
          stats.accepted += 1;
        } else {
          stats.rejected += 1;
          const reason = result?.reason || "rejected";
          stats.rejectedReasons[reason] = (stats.rejectedReasons[reason] || 0) + 1;
        }
      } catch (err) {
        stats.rejected += 1;
        const reason = String(err.message || "request_failed");
        stats.rejectedReasons[reason] = (stats.rejectedReasons[reason] || 0) + 1;
      }
    }
  } finally {
    isTickRunning = false;
  }
};

const printStatus = () => {
  const elapsed = Date.now() - stats.startedAt;
  console.log(
    `[sim-stream] uptime=${formatSeconds(elapsed)}s attempted=${stats.attempted} accepted=${stats.accepted} rejected=${stats.rejected}`
  );
};

const stop = async (reason = "stopped") => {
  if (stopped) return;
  stopped = true;
  if (tickTimer) clearInterval(tickTimer);
  if (logTimer) clearInterval(logTimer);
  while (isTickRunning) {
    // Wait for current tick loop to finish.
    // This avoids leaving partial request batches on shutdown.
    await sleep(40);
  }
  printStatus();
  console.log(`[sim-stream] ${reason}`);
  process.exit(0);
};

const bootstrap = async () => {
  try {
    // Validate local simulator endpoints are enabled.
    const state = await getJson("/api/state");
    trackLen = Array.isArray(state?.track) ? state.track.length : 40;
    await postJson("/api/sim/fund", { userId: users[0], points: safeWalletFloor, mode: "set_floor" });
  } catch (err) {
    console.error(
      "[sim-stream] startup failed. Ensure backend is running and ALLOW_LOCAL_SIMULATOR=1."
    );
    console.error(`[sim-stream] detail: ${err.message}`);
    process.exit(1);
  }

  console.log(`[sim-stream] target=${BASE_URL}`);
  console.log(
    `[sim-stream] tickMs=${TICK_MS} countPerTick=${COUNT_PER_TICK} amount=[${safeAmountMin},${safeAmountMax}] users=${safeUserPoolSize}`
  );

  tickTimer = setInterval(() => {
    void tick();
  }, TICK_MS);
  logTimer = setInterval(printStatus, STATUS_LOG_MS);
  void tick();
};

process.on("SIGINT", () => {
  void stop("received SIGINT");
});
process.on("SIGTERM", () => {
  void stop("received SIGTERM");
});

void bootstrap();
