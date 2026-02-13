const { normalizeIndex } = require("../utils/math");

const runSpin = ({ trackLen, startIndex, direction, markerCount, steps }) => {
  const safeTrackLen = Math.max(trackLen, 1);
  const offset = Math.floor(safeTrackLen / markerCount);
  const finalSlots = [];

  for (let i = 0; i < markerCount; i += 1) {
    const base = startIndex + i * offset;
    const final = base + direction * steps;
    finalSlots.push(normalizeIndex(final, safeTrackLen));
  }

  return {
    startIndex: normalizeIndex(startIndex, safeTrackLen),
    direction,
    markerCount,
    offset,
    steps,
    finalSlots
  };
};

module.exports = {
  runSpin
};
