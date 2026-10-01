// ===== 阴阳象棋 · 走法校验引擎（小程序版，CommonJS）=====
// 双维度判定：state===0 按 initialPositionType（棋位）；state===1 按 realType（真实身份）。
// 暗棋不判红黑（核心）：未翻开的暗子只按棋位走法判定，落点是否是「自己人」不参与判断 ——
//   牌背朝上时双方都看不到阵营，只要走法能到就该能走能吃（见 sameColorBlocked）。
// 性能：按棋种子力生成候选（不再 90 格穷举）+ 走子试探还原 + 将帅格射线检测将军。

function inBoard(x, y) {
  return x >= 0 && x <= 8 && y >= 0 && y <= 9
}

function pieceAt(board, x, y) {
  if (!inBoard(x, y)) return null
  return board[y][x]
}

function effectiveType(p) {
  return p.state === 0 ? p.initialPositionType : p.realType
}

/**
 * 落点是否因「同方」而不可去 —— 【暗棋不判红黑：按棋位职责判定】
 * 暗子（state=0）在规则上等同于「该棋位在明棋布局里的那枚子」：
 *   走子方归属 = pieceSide(p, from.y)（暗子=棋位阵营、明棋=真实颜色）
 *   落点归属   = 暗子取**棋位阵营**（不是它看不见的真实颜色）、明棋取真实颜色
 * 于是「红方炮位上的暗子」就是红方的炮：
 *   · 能吃掉对面的暗子（对方棋位）与对方明棋 —— 无论那枚暗子的真实颜色是红是黑；
 *   · 吃不了自己这半场棋位上的暗子，也吃不了自己的明棋 —— 与明棋模式规则完全一致。
 * 判定的全部输入（棋位类型 + 棋位归属 + 明棋颜色）都是双方可见信息，没有偷看隐藏颜色。
 */
function sameColorBlocked(p, from, dest, destY) {
  if (!dest) return false
  const destSide = dest.state === 0 ? pieceSide(dest, destY) : dest.color
  return destSide === pieceSide(p, from.y)
}

function isPalace(x, y, color) {
  if (x < 3 || x > 5) return false
  return color === 'red' ? y >= 7 && y <= 9 : y >= 0 && y <= 2
}

function forwardDir(color) {
  return color === 'red' ? -1 : 1
}

function crossedRiver(y, color) {
  return color === 'red' ? y <= 4 : y >= 5
}

/**
 * 棋子的「行棋归属」—— 决定谁能操作它、它与谁为敌、它按谁的方向走。
 *   · 明棋（state=1）：真实颜色（翻面之后按明棋规则继续操作）。
 *   · 暗棋（state=0）：**所属棋位的阵营**（开局写入 slotSide），与它看不见的真实颜色无关。
 * 也就是说「暗棋的初始状态 = 该位置明棋棋子的职责」：位置决定它归谁、走什么、能打谁。
 * 兜底：手工构造的棋盘若没有 slotSide，则按所在半场判定（暗子未移动过必在初始棋位）。
 */
function pieceSide(p, y) {
  if (p.state !== 0) return p.color
  if (p.slotSide) return p.slotSide
  return y >= 5 ? 'red' : 'black'
}

/* ------------------------------------------------------------------
 * 棋局变体（由对局 utils/game.js 在 reset()/setMode() 时注入）
 *   'standard' 传统象棋：象不得过河、士不得出九宫（官方规则）
 *   'blind'    阴阳象棋（暗棋）：30 枚暗棋全场随机落位（红黑混住），
 *              因此暗棋阶段与翻面之后的明棋都不再受阵营限制 ——
 *              象可以过河、士可以走出九宫；将帅仍限九宫（胜负判定依赖它）。
 * 说明：同一时刻只跑一局（小程序单页面单实例），故用模块级开关；
 *       AI（utils/ai.js）走同一套引擎函数，自动继承当前变体。
 * ------------------------------------------------------------------ */
let variant = 'standard'

function setVariant(v) {
  variant = v === 'blind' ? 'blind' : 'standard'
}

function getVariant() {
  return variant
}

/** 是否暗棋变体（放宽河界 / 九宫限制） */
function campFree() {
  return variant === 'blind'
}

const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const ELE = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
]
const MA = [
  { dx: 1, dy: 2, lx: 0, ly: 1 },
  { dx: -1, dy: 2, lx: 0, ly: 1 },
  { dx: 1, dy: -2, lx: 0, ly: -1 },
  { dx: -1, dy: -2, lx: 0, ly: -1 },
  { dx: 2, dy: 1, lx: 1, ly: 0 },
  { dx: 2, dy: -1, lx: 1, ly: 0 },
  { dx: -2, dy: 1, lx: -1, ly: 0 },
  { dx: -2, dy: -1, lx: -1, ly: 0 },
]

function cloneBoard(board) {
  return board.map(function (row) {
    return row.map(function (p) {
      return p
        ? {
            id: p.id,
            realType: p.realType,
            pos: { x: p.pos.x, y: p.pos.y },
            initialPositionType: p.initialPositionType,
            slotSide: p.slotSide,
            state: p.state,
            color: p.color,
          }
        : null
    })
  })
}

function applyMoveOnClone(board, from, to) {
  const p = board[from.y][from.x]
  if (!p) return
  board[to.y][to.x] = p
  board[from.y][from.x] = null
  p.pos = { x: to.x, y: to.y }
  if (p.state === 0) p.state = 1
}

function findGeneral(board, color) {
  const y0 = color === 'red' ? 7 : 0
  const y1 = color === 'red' ? 9 : 2
  for (let y = y0; y <= y1; y++) {
    for (let x = 3; x <= 5; x++) {
      const p = board[y][x]
      if (p && p.color === color && p.realType === 'jiang') return { x: x, y: y }
    }
  }
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      if (p && p.color === color && p.realType === 'jiang') return { x: x, y: y }
    }
  }
  return null
}

function generalsFacing(board) {
  const r = findGeneral(board, 'red')
  const b = findGeneral(board, 'black')
  if (!r || !b) return false
  if (r.x !== b.x) return false
  const step = b.y > r.y ? 1 : -1
  for (let y = r.y + step; y !== b.y; y += step) {
    if (board[y][r.x]) return false
  }
  return true
}

function visitRayStops(board, from, visitEmpty, visitPiece) {
  for (let i = 0; i < 4; i++) {
    const dx = D4[i][0]
    const dy = D4[i][1]
    let x = from.x + dx
    let y = from.y + dy
    while (inBoard(x, y)) {
      const dest = board[y][x]
      if (!dest) {
        if (visitEmpty) visitEmpty(x, y)
      } else {
        if (visitPiece) visitPiece(x, y, dest)
        break
      }
      x += dx
      y += dy
    }
  }
}

/** 按棋种子力枚举伪合法落点（不含送将 / 照面过滤） */
function forEachPseudoMove(board, p, from, visit) {
  const t = effectiveType(p)

  function tryTo(tx, ty) {
    if (!inBoard(tx, ty)) return
    if (sameColorBlocked(p, from, board[ty][tx], ty)) return // 按棋位职责判同方，见 sameColorBlocked
    visit(tx, ty)
  }

  switch (t) {
    case 'che':
      visitRayStops(board, from, tryTo, function (x, y, dest) {
        if (!sameColorBlocked(p, from, dest, y)) tryTo(x, y)
      })
      return
    case 'pao':
      for (let i = 0; i < 4; i++) {
        const dx = D4[i][0]
        const dy = D4[i][1]
        let jumped = false
        let x = from.x + dx
        let y = from.y + dy
        while (inBoard(x, y)) {
          const dest = board[y][x]
          if (!dest) {
            if (!jumped) tryTo(x, y)
          } else if (!jumped) {
            jumped = true
          } else {
            // 炮架之后的第一个子即炮打目标：按棋位职责判同方（暗子的真实颜色不参与）
            if (!sameColorBlocked(p, from, dest, y)) tryTo(x, y)
            break
          }
          x += dx
          y += dy
        }
      }
      return
    case 'ma':
      for (let i = 0; i < 8; i++) {
        const m = MA[i]
        const lx = from.x + m.lx
        const ly = from.y + m.ly
        if (!inBoard(lx, ly) || board[ly][lx]) continue
        tryTo(from.x + m.dx, from.y + m.dy)
      }
      return
    case 'xiang':
      for (let i = 0; i < 4; i++) {
        const e = ELE[i]
        const eyeX = from.x + e[0] / 2
        const eyeY = from.y + e[1] / 2
        if (!inBoard(eyeX, eyeY) || board[eyeY][eyeX]) continue
        const ty = from.y + e[1]
        // 传统规则：象不得过河。暗棋模式红黑混住，象需能过河（否则落在对方半场会被卡死）
        if (!campFree()) {
          if (p.color === 'red' && ty < 5) continue
          if (p.color === 'black' && ty > 4) continue
        }
        tryTo(from.x + e[0], ty)
      }
      return
    case 'shi':
      for (let i = 0; i < 4; i++) {
        const tx = from.x + DIAG[i][0]
        const ty = from.y + DIAG[i][1]
        // 传统规则：士不得出九宫。暗棋模式下士可走出九宫（斜一格，全场可行）
        if (campFree() || isPalace(tx, ty, p.color)) tryTo(tx, ty)
      }
      return
    case 'jiang':
      for (let i = 0; i < 4; i++) {
        const tx = from.x + D4[i][0]
        const ty = from.y + D4[i][1]
        if (isPalace(tx, ty, p.color)) tryTo(tx, ty)
      }
      return
    case 'bing': {
      // 方向按「行棋归属」：暗子=棋位阵营、明棋=真实颜色（见 pieceSide）
      const side = pieceSide(p, from.y)
      tryTo(from.x, from.y + forwardDir(side))
      if (crossedRiver(from.y, side)) {
        tryTo(from.x - 1, from.y)
        tryTo(from.x + 1, from.y)
      }
      return
    }
    default:
      return
  }
}

function makeMove(board, from, to) {
  const moving = board[from.y][from.x]
  const captured = board[to.y][to.x]
  const ox = moving.pos.x
  const oy = moving.pos.y
  const os = moving.state
  board[to.y][to.x] = moving
  board[from.y][from.x] = null
  moving.pos.x = to.x
  moving.pos.y = to.y
  if (os === 0) moving.state = 1
  return { moving: moving, captured: captured, ox: ox, oy: oy, os: os }
}

function unmakeMove(board, from, to, u) {
  board[from.y][from.x] = u.moving
  board[to.y][to.x] = u.captured
  u.moving.pos.x = u.ox
  u.moving.pos.y = u.oy
  u.moving.state = u.os
}

/**
 * 走这一步之后是否合法（不含送将 / 照面）。
 * 判定基准 = **公开信息世界**：刚走出的暗子在评估期间仍按「棋位职责」看待
 * （这一步之前它的真身无人知晓），其余暗子本来就按棋位职责判定。
 * 因此「走法是否合法」完全由双方看得见的信息决定；
 * 翻面后真身带来的意外（自己将军 / 被吃 / 将死）交由 checkEnd 按明棋规则裁决 —— 该吃吃。
 */
function isLegalAfterMove(board, side, from, to) {
  const moving = board[from.y][from.x]
  const blind = !!moving && moving.state === 0 && campFree()
  const u = makeMove(board, from, to)
  if (blind) moving.state = 0 // 翻面不改变「合法性」的判定基准（仍按棋位职责）
  const illegal = generalsFacing(board) || isGeneralUnderAttack(board, side)
  if (blind) moving.state = 1
  unmakeMove(board, from, to, u)
  return !illegal
}

/**
 * 从目标格向外射线 + 马/兵/士/象邻格，判断「归属为 byColor 的棋子」是否攻击该格。
 * 归属用 pieceSide：暗子按棋位阵营（红黑双方只能操作自己这半场棋位上的暗子），明棋按真实颜色。
 * 含飞将照面（同线将帅中间无子）。
 */
function isSquareAttackedBy(board, x, y, byColor) {
  for (let i = 0; i < 8; i++) {
    const m = MA[i]
    const sx = x - m.dx
    const sy = y - m.dy
    if (!inBoard(sx, sy)) continue
    const p = board[sy][sx]
    if (!p || pieceSide(p, sy) !== byColor || effectiveType(p) !== 'ma') continue
    const lx = sx + m.lx
    const ly = sy + m.ly
    if (inBoard(lx, ly) && !board[ly][lx]) return true
  }

  // 兵 / 卒：能走进 (x,y) 的兵 —— 方向/过河与 forEachPseudoMove 完全一致（按 pieceSide）
  for (let i = 0; i < 2; i++) {
    const sy = i === 0 ? y - 1 : y + 1
    const p = pieceAt(board, x, sy)
    if (!p || pieceSide(p, sy) !== byColor || effectiveType(p) !== 'bing') continue
    if (sy + forwardDir(pieceSide(p, sy)) === y) return true
  }
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? x - 1 : x + 1
    const p = pieceAt(board, sx, y)
    if (!p || pieceSide(p, y) !== byColor || effectiveType(p) !== 'bing') continue
    if (crossedRiver(y, pieceSide(p, y))) return true
  }

  for (let i = 0; i < 4; i++) {
    const tx = x + DIAG[i][0]
    const ty = y + DIAG[i][1]
    const p = pieceAt(board, tx, ty)
    // 传统规则：士只能在九宫内发动攻击；暗棋模式下士可走出九宫，攻击范围随之放开
    if (p && pieceSide(p, ty) === byColor && effectiveType(p) === 'shi' && (campFree() || isPalace(x, y, byColor))) return true
  }

  for (let i = 0; i < 4; i++) {
    const e = ELE[i]
    const sx = x - e[0]
    const sy = y - e[1]
    if (!inBoard(sx, sy)) continue
    const p = pieceAt(board, sx, sy)
    if (!p || pieceSide(p, sy) !== byColor || effectiveType(p) !== 'xiang') continue
    const eyeX = sx + e[0] / 2
    const eyeY = sy + e[1] / 2
    if (!inBoard(eyeX, eyeY) || board[eyeY][eyeX]) continue
    // 传统规则：象不得过河（靶格必须在象的己方半场）；暗棋模式下象可过河
    if (!campFree()) {
      if (byColor === 'red' && y < 5) continue
      if (byColor === 'black' && y > 4) continue
    }
    return true
  }

  for (let i = 0; i < 4; i++) {
    const dx = D4[i][0]
    const dy = D4[i][1]
    let seen = 0
    let cx = x + dx
    let cy = y + dy
    while (inBoard(cx, cy)) {
      const q = board[cy][cx]
      if (q) {
        seen++
        if (pieceSide(q, cy) === byColor) {
          const et = effectiveType(q)
          if (seen === 1 && (et === 'che' || et === 'jiang')) return true
          if (seen === 2 && et === 'pao') return true
        }
        if (seen >= 2) break
      }
      cx += dx
      cy += dy
    }
  }
  return false
}

function isGeneralUnderAttack(board, color) {
  const g = findGeneral(board, color)
  if (!g) return true
  const enemy = color === 'red' ? 'black' : 'red'
  return isSquareAttackedBy(board, g.x, g.y, enemy)
}

function generateLegalMoves(board, color) {
  const moves = []
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      // 只枚举「归属本方」的棋子：明棋看颜色；暗棋看棋位阵营（本方半场的棋位）
      if (!p || pieceSide(p, y) !== color) continue
      const from = { x: x, y: y }
      forEachPseudoMove(board, p, from, function (tx, ty) {
        const to = { x: tx, y: ty }
        if (isLegalAfterMove(board, color, from, to)) {
          moves.push({ from: { x: x, y: y }, to: to })
        }
      })
    }
  }
  return moves
}

function hasAnyLegalMove(board, color) {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      if (!p || pieceSide(p, y) !== color) continue
      const from = { x: x, y: y }
      let found = false
      forEachPseudoMove(board, p, from, function (tx, ty) {
        if (found) return
        if (isLegalAfterMove(board, color, from, { x: tx, y: ty })) found = true
      })
      if (found) return true
    }
  }
  return false
}

function getLegalTargets(board, from) {
  const p = pieceAt(board, from.x, from.y)
  if (!p) return []
  const side = pieceSide(p, from.y) // 暗子按棋位归属判断「不能送将」的是哪一方
  const targets = []
  forEachPseudoMove(board, p, from, function (tx, ty) {
    if (isLegalAfterMove(board, side, from, { x: tx, y: ty })) {
      targets.push({ x: tx, y: ty })
    }
  })
  return targets
}

module.exports = {
  inBoard: inBoard,
  pieceAt: pieceAt,
  effectiveType: effectiveType,
  pieceSide: pieceSide,
  findGeneral: findGeneral,
  generateLegalMoves: generateLegalMoves,
  getLegalTargets: getLegalTargets,
  hasAnyLegalMove: hasAnyLegalMove,
  cloneBoard: cloneBoard,
  applyMoveOnClone: applyMoveOnClone,
  isGeneralUnderAttack: isGeneralUnderAttack,
  // 棋局变体：'standard' 传统象棋 / 'blind' 阴阳象棋（暗棋，象可过河、士可出九宫）
  setVariant: setVariant,
  getVariant: getVariant,
  // 供 AI 搜索使用：原地落子 / 原地撤销（比 cloneBoard 快一个数量级，语义与走子规则一致）
  makeMove: makeMove,
  unmakeMove: unmakeMove,
}
