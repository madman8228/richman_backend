const path = require("path");
const fs = require("fs");

const { config } = require("../src/config");
const { FileStore } = require("../src/store/fileStore");

const readArg = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return "";
  return process.argv[idx + 1];
};

const hasFlag = (flag) => process.argv.includes(flag);

const rawUsers = readArg("--users");
const users = Array.from(
  new Set(
    rawUsers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )
);

const seedPoints = Number.parseInt(readArg("--points"), 10) || 100;
const filePath = path.resolve(readArg("--file") || config.storeFilePath);
const reset = hasFlag("--reset");

if (seedPoints <= 0) {
  // eslint-disable-next-line no-console
  console.error("[init-store] --points must be > 0");
  process.exit(1);
}

if (users.length === 0) {
  // eslint-disable-next-line no-console
  console.error("[init-store] missing --users, example: --users userA,userB");
  process.exit(1);
}

if (reset && fs.existsSync(filePath)) {
  fs.unlinkSync(filePath);
}

const storeConfig = {
  ...config,
  storeMode: "file",
  storeFilePath: filePath,
  localStartPoints: 0
};

const store = new FileStore(storeConfig, { filePath });
users.forEach((userId) => {
  store.addLedger(userId, seedPoints, "seed_init");
});

const seeded = users.map((userId) => ({
  userId,
  points: store.getUserPoints(userId)
}));

// eslint-disable-next-line no-console
console.log(`[init-store] file: ${filePath}`);
// eslint-disable-next-line no-console
console.log(`[init-store] seeded users: ${users.length}`);
// eslint-disable-next-line no-console
console.log(JSON.stringify(seeded, null, 2));

