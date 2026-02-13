const { pickWeighted } = require("../utils/math");

const pickMarkerCount = (counts, weights) => {
  if (!counts.length) return 1;
  if (!weights.length || weights.length !== counts.length) return counts[0];
  return pickWeighted(counts, weights);
};

module.exports = {
  pickMarkerCount
};
