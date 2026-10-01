// ===== 阴阳象棋 · 棋盘初始化与洗牌（小程序版，CommonJS）=====
// 纯函数、无平台依赖；本文件是开局构造的唯一定义。
//
// 暗棋开局 = 「全局随机」：
//   · 将帅恒为明棋，留在各自九宫底线中央；
//   · 其余 30 枚（红 15 + 黑 15）合成一个身份池整体洗牌后，随机落到全盘 30 个棋位上，
//     红子可以出现在黑方半场、黑子也可以出现在红方半场（不再「红的在红方、黑的在黑方」）。

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

const PIECE_COUNTS = {
  che: 2,
  ma: 2,
  xiang: 2,
  shi: 2,
  pao: 2,
  bing: 5
}

// 传统底线（除将帅外）各棋位的初始类型顺序：车马象士(将)士象马车
const BACK_ORDER = ['che', 'ma', 'xiang', 'shi', 'jiang', 'shi', 'xiang', 'ma', 'che']

const COLORS = ['red', 'black']

function nonGeneralSlots(color) {
  const slots = []
  const backRow = color === 'red' ? 9 : 0
  const paoRow = color === 'red' ? 7 : 2
  const bingRow = color === 'red' ? 6 : 3

  for (let x = 0; x < 9; x++) {
    if (x === 4) continue
    slots.push({ pos: { x: x, y: backRow }, slotType: BACK_ORDER[x] })
  }
  slots.push({ pos: { x: 1, y: paoRow }, slotType: 'pao' })
  slots.push({ pos: { x: 7, y: paoRow }, slotType: 'pao' })
  for (const x of [0, 2, 4, 6, 8]) {
    slots.push({ pos: { x: x, y: bingRow }, slotType: 'bing' })
  }
  return slots
}

/** 全盘 30 个暗棋棋位（红黑两侧合并，不再区分阵营） */
function darkSlots() {
  return nonGeneralSlots('red').concat(nonGeneralSlots('black'))
}

/** 全盘 30 枚暗棋身份（红 15 + 黑 15）合成的身份池，颜色已随身份打乱 */
function darkPiecePool() {
  const pool = []
  COLORS.forEach(function (color) {
    Object.keys(PIECE_COUNTS).forEach(function (t) {
      for (let i = 0; i < PIECE_COUNTS[t]; i++) pool.push({ color: color, realType: t })
    })
  })
  return pool
}

/**
 * 生成暗棋开局（全局随机）：
 *   1) 将帅恒为明棋（state=1），固定在九宫底线中央 (4,9) / (4,0)；
 *   2) 30 个棋位与 30 枚身份各自洗牌后一一对应 —— 位置随机、颜色随机、身份随机；
 *   3) 每枚暗棋的 initialPositionType 记录「所落棋位」的类型，暗棋阶段即按该棋位走法行棋；
 *   4) 由于红黑混住，走法需放宽阵营限制（象可过河、士可出九宫），见 utils/RulesEngine.js 变体开关。
 */
function createInitialBoard() {
  const board = []
  for (let y = 0; y < 10; y++) board.push(new Array(9).fill(null))
  let id = 0

  // 将帅：明棋 + 固定落点
  COLORS.forEach(function (color) {
    const gy = color === 'red' ? 9 : 0
    board[gy][4] = {
      id: 'g' + id++,
      realType: 'jiang',
      pos: { x: 4, y: gy },
      initialPositionType: 'jiang',
      state: 1,
      color: color
    }
  })

  // 暗棋：身份池整体洗牌 → 随机落到全盘 30 个棋位
  const pool = shuffle(darkPiecePool())
  const slots = shuffle(darkSlots())
  slots.forEach(function (slot, idx) {
    const def = pool[idx]
    board[slot.pos.y][slot.pos.x] = {
      id: 'p' + id++,
      realType: def.realType,
      pos: { x: slot.pos.x, y: slot.pos.y },
      initialPositionType: slot.slotType,
      // 棋位阵营 = 该棋位属于哪一方（决定翻面前归谁操作、按谁的方向走）
      slotSide: slot.pos.y >= 5 ? 'red' : 'black',
      state: 0,
      color: def.color
    }
  })
  return board
}

// ===== 传统象棋棋盘（另一模式，与盲棋开局完全独立）=====
// 全部棋子为明棋（state = 1），真实身份即所在棋位类型，无任何洗牌。
// 注意：本函数不参与、也不影响 createInitialBoard() 的盲棋开局逻辑。
function createTraditionalBoard() {
  const board = []
  for (let y = 0; y < 10; y++) board.push(new Array(9).fill(null))
  let id = 0

  for (const color of ['red', 'black']) {
    const gy = color === 'red' ? 9 : 0
    board[gy][4] = {
      id: 'g' + id++,
      realType: 'jiang',
      pos: { x: 4, y: gy },
      initialPositionType: 'jiang',
      state: 1,
      color: color
    }
    nonGeneralSlots(color).forEach(function (slot) {
      board[slot.pos.y][slot.pos.x] = {
        id: 'p' + id++,
        realType: slot.slotType,
        pos: { x: slot.pos.x, y: slot.pos.y },
        initialPositionType: slot.slotType,
        state: 1,
        color: color
      }
    })
  }
  return board
}

module.exports = { createInitialBoard, createTraditionalBoard }
