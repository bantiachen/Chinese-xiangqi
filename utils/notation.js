// ===== 阴阳象棋 · 标准中国象棋记谱法 =====
// 规则依据（与传统象棋一致，暗棋翻开后同样适用）：
//   · 红方用汉字数字（一~九），黑方用阿拉伯数字（1~9）；
//   · 路数均按「各自视角」从右向左编号：红方一路 = x8，黑方 1 路 = x0；
//   · 平 = 横向走；进/退 = 纵向前进/后退（红方 y 减小为进，黑方 y 增大为进）；
//   · 直行子（车/炮/兵/将）记「进/退 + 步数」；斜行跳跃子（马/相/仕）记「进/退 + 目标路数」；
//   · 同一纵线有同名同色两子时，用「前 / 后」代替路数；三子及以上用「一/二/三…」。

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const ARAB_NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

// 直行棋子：进退记步数（其余记目标路数）
const STRAIGHT_TYPES = { che: true, pao: true, bing: true, jiang: true }

/** 纵线序号（各自视角，从右向左 1..9） */
function fileNumber(color, x) {
  return color === 'red' ? 9 - x : x + 1
}

/** 序号 → 该方使用的数字文字 */
function fileLabel(color, n) {
  const t = color === 'red' ? CN_NUM : ARAB_NUM
  return t[n - 1] || String(n)
}

/**
 * 起子前缀：默认用所在纵线数字；同线有同名同色子时用「前/后」（或多子序号）。
 * 必须在棋子尚未移动前（起点仍在原位）调用。
 */
function fromPrefix(board, color, realType, from) {
  const ys = []
  for (let y = 0; y < 10; y++) {
    const p = board[y][from.x]
    if (p && p.color === color && p.realType === realType) ys.push(y)
  }
  if (ys.length <= 1) return fileLabel(color, fileNumber(color, from.x))

  // 「前」= 更靠近对方：红方 y 更小，黑方 y 更大
  const sorted = ys.slice().sort(function (a, b) {
    return color === 'red' ? a - b : b - a
  })
  const idx = sorted.indexOf(from.y)
  if (ys.length === 2) return idx === 0 ? '前' : '后'
  return fileLabel(color, idx + 1)
}

/**
 * 生成一步棋的中文记谱，如「炮二平五」「马8进7」「前车进一」
 * @param {Array} board 走子「前」的棋盘（起点棋子仍在原位）
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {{color:string,realType:string}} piece 走子方棋子（暗棋请先翻面再取名）
 * @param {string} charOf 棋子中文名（红帅/黑将等）
 */
function moveToChinese(board, from, to, piece, name) {
  const color = piece.color
  const type = piece.realType
  const pre = fromPrefix(board, color, type, from)

  if (from.y === to.y) {
    return pre + name + '平' + fileLabel(color, fileNumber(color, to.x))
  }
  const forward = color === 'red' ? to.y < from.y : to.y > from.y
  const verb = forward ? '进' : '退'
  const n = STRAIGHT_TYPES[type] ? Math.abs(to.y - from.y) : fileNumber(color, to.x)
  return pre + name + verb + fileLabel(color, n)
}

/** 坐标记法（调试/兜底用），如 "(2,8)→(5,8)" */
function coordsText(from, to) {
  return '(' + (from.x + 1) + ',' + (from.y + 1) + ')→(' + (to.x + 1) + ',' + (to.y + 1) + ')'
}

module.exports = { moveToChinese, coordsText, fileNumber, fileLabel, fromPrefix }
