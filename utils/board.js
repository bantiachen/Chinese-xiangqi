// ===== 阴阳象棋 · 棋盘初始化与洗牌（小程序版，CommonJS）=====
// 纯函数、无平台依赖；本文件是开局构造的唯一定义（洗牌规则不可改动）。

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

// 生成初始棋盘：将帅恒明棋；其余暗棋并在同色阵营内洗牌分配真实身份
function createInitialBoard() {
  const board = []
  for (let y = 0; y < 10; y++) board.push(new Array(9).fill(null))
  let id = 0

  for (const color of ['red', 'black']) {
    const gy = color === 'red' ? 9 : 0
    const general = {
      id: 'g' + id++,
      realType: 'jiang',
      pos: { x: 4, y: gy },
      initialPositionType: 'jiang',
      state: 1,
      color: color
    }
    board[gy][4] = general

    const pool = []
    Object.keys(PIECE_COUNTS).forEach(function (t) {
      for (let i = 0; i < PIECE_COUNTS[t]; i++) pool.push(t)
    })
    shuffle(pool)

    const slots = nonGeneralSlots(color)
    slots.forEach(function (slot, idx) {
      const piece = {
        id: 'p' + id++,
        realType: pool[idx],
        pos: { x: slot.pos.x, y: slot.pos.y },
        initialPositionType: slot.slotType,
        state: 0,
        color: color
      }
      board[slot.pos.y][slot.pos.x] = piece
    })
  }
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
