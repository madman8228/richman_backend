const buildSnake = (rows, cols) => {
  const track = [];
  for (let r = 0; r < rows; r += 1) {
    if (r % 2 === 0) {
      for (let c = 0; c < cols; c += 1) track.push({ r, c });
    } else {
      for (let c = cols - 1; c >= 0; c -= 1) track.push({ r, c });
    }
  }
  return track;
};

const buildPerimeter = (rows, cols) => {
  const track = [];
  if (rows === 0 || cols === 0) return track;
  for (let c = 0; c < cols; c += 1) track.push({ r: 0, c });
  for (let r = 1; r < rows; r += 1) track.push({ r, c: cols - 1 });
  if (rows > 1) {
    for (let c = cols - 2; c >= 0; c -= 1)
      track.push({ r: rows - 1, c });
  }
  if (cols > 1) {
    for (let r = rows - 2; r > 0; r -= 1) track.push({ r, c: 0 });
  }
  return track;
};

const buildSpiral = (rows, cols) => {
  const track = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c += 1) track.push({ r: top, c });
    top += 1;
    for (let r = top; r <= bottom; r += 1) track.push({ r, c: right });
    right -= 1;
    if (top <= bottom) {
      for (let c = right; c >= left; c -= 1) track.push({ r: bottom, c });
      bottom -= 1;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r -= 1) track.push({ r, c: left });
      left += 1;
    }
  }
  return track;
};

const buildCustom = (rows, cols, customPath) => {
  if (!customPath) return [];
  const tokens = customPath
    .split(/[;|\\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const track = [];
  for (const token of tokens) {
    if (token.includes(",")) {
      const [rStr, cStr] = token.split(",");
      const r = Number.parseInt(rStr, 10);
      const c = Number.parseInt(cStr, 10);
      if (Number.isFinite(r) && Number.isFinite(c)) track.push({ r, c });
    } else {
      const idx = Number.parseInt(token, 10);
      if (!Number.isFinite(idx)) continue;
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      track.push({ r, c });
    }
  }
  return track.filter(
    (pos) =>
      pos.r >= 0 && pos.r < rows && pos.c >= 0 && pos.c < cols
  );
};

const buildTrack = (rows, cols, mode, customPath) => {
  let raw;
  switch ((mode || "").toLowerCase()) {
    case "perimeter":
      raw = buildPerimeter(rows, cols);
      break;
    case "snake":
      raw = buildSnake(rows, cols);
      break;
    case "custom":
      raw = buildCustom(rows, cols, customPath);
      break;
    case "spiral":
    default:
      raw = buildSpiral(rows, cols);
      break;
  }

  return raw.map((pos, idx) => ({
    id: idx,
    r: pos.r,
    c: pos.c
  }));
};

module.exports = {
  buildTrack
};
