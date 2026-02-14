const ROUND_MODE = {
  NORMAL: "normal",
  TRAIN: "train",
  KING: "king",
  LUCK_LEFT: "luck_left",
  LUCK_RIGHT: "luck_right"
};

const LIGHT_MODE = {
  NORMAL: "normal",
  SHINING: "shining",
  TRAIN: "train"
};

const DEFAULT_ROUND_MODES = [
  ROUND_MODE.NORMAL,
  ROUND_MODE.TRAIN,
  ROUND_MODE.KING
];

const DEFAULT_ROUND_MODE_WEIGHTS = [80, 10, 10];
const DEFAULT_NORMAL_LUCK_WEIGHTS = [55, 20, 25]; // none, left, right

module.exports = {
  ROUND_MODE,
  LIGHT_MODE,
  DEFAULT_ROUND_MODES,
  DEFAULT_ROUND_MODE_WEIGHTS,
  DEFAULT_NORMAL_LUCK_WEIGHTS
};
