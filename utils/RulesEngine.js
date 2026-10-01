// ===== 阴阳象棋 · 走法校验引擎（小程序版，CommonJS）=====
// 双维度判定：state===0 按 initialPositionType；state===1 按 realType。
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
    const dest = board[ty][tx]
    if (dest && dest.color === p.color) return
    visit(tx, ty)
  }

  switch (t) {
    case 'che':
      visitRayStops(board, from, tryTo, function (x, y, dest) {
        if (dest.color !== p.color) tryTo(x, y)
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
            if (dest.color !== p.color) tryTo(x, y)
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
        if (p.color === 'red' && ty < 5) continue
        if (p.color === 'black' && ty > 4) continue
        tryTo(from.x + e[0], ty)
      }
      return
    case 'shi':
      for (let i = 0; i < 4; i++) {
        const tx = from.x + DIAG[i][0]
        const ty = from.y + DIAG[i][1]
        if (isPalace(tx, ty, p.color)) tryTo(tx, ty)
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
      tryTo(from.x, from.y + forwardDir(p.color))
      if (crossedRiver(from.y, p.color)) {
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

function isLegalAfterMove(board, color, from, to) {
  const u = makeMove(board, from, to)
  const illegal = generalsFacing(board) || isGeneralUnderAttack(board, color)
  unmakeMove(board, from, to, u)
  return !illegal
}

/**
 * 从目标格向外射线 + 马/兵/士/象邻格，判断 byColor 是否攻击该格。
 * 含飞将照面（同线将帅中间无子）。
 */
function isSquareAttackedBy(board, x, y, byColor) {
  for (let i = 0; i < 8; i++) {
    const m = MA[i]
    const sx = x - m.dx
    const sy = y - m.dy
    if (!inBoard(sx, sy)) continue
    const p = board[sy][sx]
    if (!p || p.color !== byColor || effectiveType(p) !== 'ma') continue
    const lx = sx + m.lx
    const ly = sy + m.ly
    if (inBoard(lx, ly) && !board[ly][lx]) return true
  }

  const pawnFromY = y - forwardDir(byColor)
  const pawn = pieceAt(board, x, pawnFromY)
  if (pawn && pawn.color === byColor && effectiveType(pawn) === 'bing') return true
  if (crossedRiver(y, byColor)) {
    const left = pieceAt(board, x - 1, y)
    if (left && left.color === byColor && effectiveType(left) === 'bing') return true
    const right = pieceAt(board, x + 1, y)
    if (right && right.color === byColor && effectiveType(right) === 'bing') return true
  }

  for (let i = 0; i < 4; i++) {
    const tx = x + DIAG[i][0]
    const ty = y + DIAG[i][1]
    const p = pieceAt(board, tx, ty)
    if (p && p.color === byColor && effectiveType(p) === 'shi' && isPalace(x, y, byColor)) return true
  }

  for (let i = 0; i < 4; i++) {
    const e = ELE[i]
    const sx = x - e[0]
    const sy = y - e[1]
    if (!inBoard(sx, sy)) continue
    const p = pieceAt(board, sx, sy)
    if (!p || p.color !== byColor || effectiveType(p) !== 'xiang') continue
    const eyeX = sx + e[0] / 2
    const eyeY = sy + e[1] / 2
    if (!inBoard(eyeX, eyeY) || board[eyeY][eyeX]) continue
    if (byColor === 'red' && y < 5) continue
    if (byColor === 'black' && y > 4) continue
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
        if (q.color === byColor) {
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
      if (!p || p.color !== color) continue
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
      if (!p || p.color !== color) continue
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
  const targets = []
  forEachPseudoMove(board, p, from, function (tx, ty) {
    if (isLegalAfterMove(board, p.color, from, { x: tx, y: ty })) {
      targets.push({ x: tx, y: ty })
    }
  })
  return targets
}

module.exports = {
  inBoard: inBoard,
  pieceAt: pieceAt,
  effectiveType: effectiveType,
  findGeneral: findGeneral,
  generateLegalMoves: generateLegalMoves,
  getLegalTargets: getLegalTargets,
  hasAnyLegalMove: hasAnyLegalMove,
  cloneBoard: cloneBoard,
  applyMoveOnClone: applyMoveOnClone,
  isGeneralUnderAttack: isGeneralUnderAttack,
  // 供 AI 搜索使用：原地落子 / 原地撤销（比 cloneBoard 快一个数量级，语义与走子规则一致）
  makeMove: makeMove,
  unmakeMove: unmakeMove,
}
