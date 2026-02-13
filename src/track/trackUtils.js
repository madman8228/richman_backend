const distanceSq = (a, b) => {
  const dr = a.r - b.r;
  const dc = a.c - b.c;
  return dr * dr + dc * dc;
};

const pickJackpotSlots = (track, rows, cols) => {
  if (!track.length) return { big: 0, small: 1 };
  const center = { r: (rows - 1) / 2, c: (cols - 1) / 2 };
  const sorted = [...track].sort(
    (p1, p2) => distanceSq(p1, center) - distanceSq(p2, center)
  );
  const big = sorted[0]?.id ?? 0;
  const small = sorted[1]?.id ?? sorted[0]?.id ?? 0;
  return { big, small };
};

const pickRespinSlots = (trackLen, excludeSet, count = 2) => {
  const slots = [];
  if (trackLen === 0) return slots;
  while (slots.length < count) {
    const candidate = Math.floor(Math.random() * trackLen);
    if (excludeSet.has(candidate)) continue;
    if (slots.includes(candidate)) continue;
    slots.push(candidate);
  }
  return slots;
};

module.exports = {
  pickJackpotSlots,
  pickRespinSlots
};
