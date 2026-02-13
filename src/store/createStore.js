const { MemoryStore } = require("./memoryStore");
const { FileStore } = require("./fileStore");

const createStore = (config) => {
  const mode = String(config.storeMode || "file").toLowerCase();
  if (mode === "memory") return new MemoryStore(config);
  if (mode === "file") {
    return new FileStore(config, { filePath: config.storeFilePath });
  }
  throw new Error(`Unsupported STORE_MODE: ${mode}`);
};

module.exports = {
  createStore
};

