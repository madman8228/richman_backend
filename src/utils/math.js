const randInt = (min, max) => {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
};

const pickWeighted = (items, weights) => {
  const total = weights.reduce((acc, w) => acc + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
};

const normalizeIndex = (index, len) => {
  if (len <= 0) return 0;
  const mod = index % len;
  return mod < 0 ? mod + len : mod;
};

module.exports = {
  randInt,
  pickWeighted,
  normalizeIndex
};
