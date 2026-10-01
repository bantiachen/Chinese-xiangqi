/**
 * 阴阳象棋 · AI 机器人（单机模式）
 * ------------------------------------------------------------
 * 【公平性硬约束】（不可破坏）
 *   1. 走法全部来自 RulesEngine.generateLegalMoves —— AI 在盲棋下同样「暗棋按棋位行棋」。
 *   2. 不窥视暗棋真实身份：本次搜索开始时仍是暗子的棋子（按 id 记录到 hiddenIds），
 *      整棵搜索树内一律按名义值 HIDDEN_VALUE 估值，即便它在某条变化中「被翻面」也不
 *      提前读取 realType。AI 的信息量与真人玩家严格一致。
 *   3. 遵守长将判负：连续将军超过 MAX_CONSECUTIVE_CHECKS 次的走法按判负处理（除非是杀棋）。
 *
 * 【搜索】
 *   negamax + alpha-beta
 *   + 置换表（Zobrist 风格哈希，避免重复计算同一局面）
 *   + 杀手着法 / 历史启发（提升剪枝效率 → 同等时间内搜得更深）
 *   + 迭代加深 + 静态搜索（只延伸吃子）+ MVV-LVA 走法排序
 *   + 时间 / 节点双预算，保证手机上不卡死（页面 setTimeout 调用并显示「电脑思考中」）
 *   makeMove/unmakeMove 原地落子撤销，避免逐节点深拷贝。
 *
 * 本模块只读棋盘、只产出走法，绝不修改开局构造，不影响盲棋初始化逻辑。
 */

const RE = require('./RulesEngine')

/** 已翻开（明棋）棋子的子力价值 */
const VALUE = {
  jiang: 6000,
  che: 900,
  pao: 450,
  ma: 400,
  xiang: 200,
  shi: 200,
  bing: 100,
}

/** 暗棋名义估值：看不到真实身份，按「中等子力」保守估计 */
const HIDDEN_VALUE = 300

/** 杀棋分值（用于区分「将死」与一般优势） */
const MATE = 1000000
/** 长将判负阈值，与 utils/game.js 的 MAX_CONSECUTIVE_CHECKS 保持一致 */
const MAX_CONSECUTIVE_CHECKS = 3

/** 默认思考参数（页面可覆盖） */
const DEFAULT_DEPTH = 4
const DEFAULT_TIME_BUDGET = 900 // ms（手机端单步上限）
const DEFAULT_NODE_BUDGET = 120000

/** 置换表容量上限（超出后不再写入，防止内存膨胀） */
const TT_MAX = 20000

// 棋子类型序号（参与局面哈希）
const TYPE_INDEX = { jiang: 0, che: 1, ma: 2, xiang: 3, shi: 4, pao: 5, bing: 6 }

function other(c) {
  return c === 'red' ? 'black' : 'red'
}

/** 明棋子力价值（仅供展示 / 排序参考；搜索内一律走 valueOf） */
function pieceValue(p) {
  return p.state === 1 ? VALUE[p.realType] || 100 : HIDDEN_VALUE
}

/**
 * 搜索内取值：本局搜索开始时是暗子的棋子，全程按名义值，不读 realType。
 * @param {Set<string>} hiddenIds
 */
function valueOf(p, hiddenIds) {
  if (!p) return 0
  if (hiddenIds && hiddenIds.has(p.id)) return HIDDEN_VALUE
  return p.state === 1 ? VALUE[p.realType] || 100 : HIDDEN_VALUE
}

/**
 * 位置奖励（PST）：仅对「开局即明棋」的棋子生效，暗子不计（避免任何身份信息泄漏）。
 * cy = 己方前进格数（0=己方底线），cen = 靠中程度（4=正中）。
 */
function pstBonus(p, x, y) {
  const cy = p.color === 'red' ? 9 - y : y
  const cen = 4 - Math.abs(x - 4)
  switch (p.realType) {
    case 'bing': {
      const crossed = p.color === 'red' ? y <= 4 : y >= 5
      return crossed ? 40 + cen * 6 : cy * 5
    }
    case 'ma':
      return cen * 3 + (cy >= 4 ? 10 : 0)
    case 'che':
      return (cy >= 5 ? 14 : 0) + cen * 2
    case 'pao':
      return (cy >= 3 && cy <= 6 ? 10 : 0) + cen * 2
    case 'xiang':
    case 'shi':
      return cy <= 2 ? 6 : 0
    case 'jiang':
      return cy <= 1 ? 2 : -10
    default:
      return 0
  }
}

/** 静态评估：站在 forColor 视角，分值越高越有利 */
function evaluate(board, forColor, hiddenIds) {
  let score = 0
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      if (!p) continue
      let v = valueOf(p, hiddenIds)
      if (p.state === 1 && !(hiddenIds && hiddenIds.has(p.id))) v += pstBonus(p, x, y)
      score += p.color === forColor ? v : -v
    }
  }
  const opp = other(forColor)
  // 将军态势：己方被将军扣分、对方被将军加分
  if (RE.isGeneralUnderAttack(board, forColor)) score -= 80
  if (RE.isGeneralUnderAttack(board, opp)) score += 80
  return score
}

/** 局面哈希（供置换表使用）：棋子布局 + 明暗状态 + 走子方 */
function hashBoard(board, color) {
  let h = 0
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      if (!p) continue
      const t = TYPE_INDEX[p.realType] || 0
      const code = (y * 9 + x) * 32 + (p.color === 'red' ? 0 : 1) * 16 + t * 2 + (p.state === 1 ? 1 : 0)
      h = ((h << 5) - h + code) | 0
    }
  }
  return (color === 'red' ? h : ~h) | 0
}

function moveKey(m) {
  return (m.from.y * 9 + m.from.x) * 81 + (m.to.y * 9 + m.to.x)
}

function sameMove(a, b) {
  return !!a && !!b && a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y
}

/**
 * 走法排序：置换表着法 → 吃子（MVV-LVA）→ 杀手着法 → 历史启发
 */
function orderMoves(board, moves, ctx, ply, ttMove) {
  const killers = ctx.killers[ply] || []
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const victim = board[m.to.y][m.to.x]
    const attacker = board[m.from.y][m.from.x]
    let s = 0
    if (ttMove && sameMove(m, ttMove)) s = 1e9
    else if (victim) s = 1e6 + valueOf(victim, ctx.hiddenIds) * 16 - valueOf(attacker, ctx.hiddenIds)
    else if (sameMove(m, killers[0])) s = 9e5
    else if (sameMove(m, killers[1])) s = 8e5
    else s = ctx.history[moveKey(m)] || 0
    m._s = s
  }
  moves.sort(function (a, b) {
    return b._s - a._s
  })
  return moves
}

/** 静态搜索：深度耗尽后只延伸「吃子」，避免地平线效应（能白吃却算成均势） */
function quiesce(board, color, alpha, beta, ply, ctx, qd) {
  if (qd === undefined) qd = 4
  if (ctx.aborted || Date.now() > ctx.deadline || ctx.nodes > ctx.nodeBudget) {
    ctx.aborted = true
    return evaluate(board, color, ctx.hiddenIds)
  }
  ctx.nodes++

  const stand = evaluate(board, color, ctx.hiddenIds)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  if (qd <= 0) return alpha

  const moves = RE.generateLegalMoves(board, color)
  const caps = []
  for (let i = 0; i < moves.length; i++) {
    if (board[moves[i].to.y][moves[i].to.x]) caps.push(moves[i])
  }
  if (!caps.length) return alpha
  orderMoves(board, caps, ctx, ply, null)

  const opp = other(color)
  for (let i = 0; i < caps.length; i++) {
    const m = caps[i]
    const u = RE.makeMove(board, m.from, m.to)
    const s = -quiesce(board, opp, -beta, -alpha, ply + 1, ctx, qd - 1)
    RE.unmakeMove(board, m.from, m.to, u)
    if (s >= beta) return beta
    if (s > alpha) alpha = s
  }
  return alpha
}

/** negamax + alpha-beta + 置换表（返回站在 color 视角的分值） */
function negamax(board, color, depth, alpha, beta, ply, ctx) {
  if (ctx.aborted || Date.now() > ctx.deadline || ctx.nodes > ctx.nodeBudget) {
    ctx.aborted = true
    return evaluate(board, color, ctx.hiddenIds)
  }
  ctx.nodes++

  const alphaOrig = alpha
  const key = hashBoard(board, color)
  const tt = ctx.tt.get(key)
  let ttMove = null
  if (tt) {
    ttMove = tt.bestMove
    // 杀棋分值不跨深度复用（避免杀棋距离失真）
    if (tt.depth >= depth && Math.abs(tt.score) < MATE - 10000) {
      if (tt.flag === 0) return tt.score
      if (tt.flag === 1 && tt.score > alpha) alpha = tt.score
      else if (tt.flag === 2 && tt.score < beta) beta = tt.score
      if (alpha >= beta) return tt.score
    }
  }

  const moves = RE.generateLegalMoves(board, color)
  if (!moves.length) return -MATE + ply // 将死 / 困毙：轮走方负
  if (depth <= 0) return quiesce(board, color, alpha, beta, ply, ctx)

  orderMoves(board, moves, ctx, ply, ttMove)
  const opp = other(color)
  let best = -Infinity
  let bestMove = null

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const u = RE.makeMove(board, m.from, m.to)
    const gives = RE.isGeneralUnderAttack(board, opp)

    // 长将：连续将军超上限 → 该走法按判负处理（但若本步即成杀，仍按杀棋计）
    const prev = ctx.streak[color]
    ctx.streak[color] = gives ? prev + 1 : 0
    let s = -negamax(board, opp, depth - 1, -beta, -alpha, ply + 1, ctx)
    if (gives && ctx.streak[color] > MAX_CONSECUTIVE_CHECKS && s < MATE - 10000) s = -MATE + ply
    ctx.streak[color] = prev

    RE.unmakeMove(board, m.from, m.to, u)
    if (s > best) {
      best = s
      bestMove = m
    }
    if (best > alpha) alpha = best
    if (alpha >= beta) {
      // 产生剪枝的非吃子着法记为杀手着法
      if (!board[m.to.y][m.to.x]) {
        const k = ctx.killers[ply] || (ctx.killers[ply] = [])
        if (!sameMove(k[0], m)) {
          k[1] = k[0]
          k[0] = { from: { x: m.from.x, y: m.from.y }, to: { x: m.to.x, y: m.to.y } }
        }
        const mk = moveKey(m)
        ctx.history[mk] = (ctx.history[mk] || 0) + depth * depth
      }
      break
    }
  }

  if (ctx.tt.size < TT_MAX && Math.abs(best) < MATE - 10000) {
    const flag = best <= alphaOrig ? 2 : best >= beta ? 1 : 0
    ctx.tt.set(key, {
      depth: depth,
      score: best,
      flag: flag,
      bestMove: bestMove ? { from: { x: bestMove.from.x, y: bestMove.from.y }, to: { x: bestMove.to.x, y: bestMove.to.y } } : null,
    })
  }
  return best
}

/**
 * 选择一步走法
 * @param {Array} board 当前棋盘（10 x 9）
 * @param {string} aiColor AI 执子颜色（页面固定为 black）
 * @param {number} [depth] 最大搜索深度（默认 4；1 最弱，4~5 更强但更慢）
 * @param {Object} [opts] { timeBudget, nodeBudget, checkStreak:{red,black}, prevMove:{from,to} }
 * @returns {{from:{x,y}, to:{x,y}}|null}
 */
function chooseMove(board, aiColor, depth, opts) {
  opts = opts || {}
  const maxDepth = depth || DEFAULT_DEPTH
  const timeBudget = opts.timeBudget || DEFAULT_TIME_BUDGET
  const nodeBudget = opts.nodeBudget || DEFAULT_NODE_BUDGET
  const opp = other(aiColor)

  const moves = RE.generateLegalMoves(board, aiColor)
  if (!moves.length) return null

  // 记录本局搜索开始时仍是暗子的棋子 id —— 全程不读取它们的 realType
  const hiddenIds = new Set()
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x]
      if (p && p.state === 0) hiddenIds.add(p.id)
    }
  }

  const ctx = {
    nodes: 0,
    nodeBudget: nodeBudget,
    deadline: Date.now() + timeBudget,
    aborted: false,
    hiddenIds: hiddenIds,
    streak: { red: 0, black: 0 },
    tt: new Map(),
    killers: [],
    history: {},
  }
  if (opts.checkStreak) {
    ctx.streak.red = opts.checkStreak.red || 0
    ctx.streak.black = opts.checkStreak.black || 0
  }

  let best = moves[0]
  let bestScore = -Infinity

  // 迭代加深：浅层先出结果，深层在时间允许时替换；超时则沿用上一完整层的答案
  for (let d = 1; d <= maxDepth; d++) {
    let localBest = null
    let localScore = -Infinity

    const key = hashBoard(board, aiColor)
    const ttMove = ctx.tt.get(key) ? ctx.tt.get(key).bestMove : null
    orderMoves(board, moves, ctx, 0, ttMove)

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]
      const u = RE.makeMove(board, m.from, m.to)
      const gives = RE.isGeneralUnderAttack(board, opp)

      const prev = ctx.streak[aiColor]
      ctx.streak[aiColor] = gives ? prev + 1 : 0
      // 根节点一律用「全窗口」精确搜索：
      // 若用 alpha 收窄窗口，劣势着法只会返回一个上界值（数值上等于当前最佳分），
      // 叠加随机扰动后就可能被误当成最佳着法。全窗口保证每个候选都是真实分。
      let s = -negamax(board, opp, d - 1, -Infinity, Infinity, 1, ctx)
      if (gives && ctx.streak[aiColor] > MAX_CONSECUTIVE_CHECKS && s < MATE - 10000) s = -MATE
      ctx.streak[aiColor] = prev

      RE.unmakeMove(board, m.from, m.to, u)

      // 避免原地来回挪子：本步若恰好是自己上一步的「反向撤回」，轻微扣分
      if (
        opts.prevMove &&
        m.from.x === opts.prevMove.to.x &&
        m.from.y === opts.prevMove.to.y &&
        m.to.x === opts.prevMove.from.x &&
        m.to.y === opts.prevMove.from.y
      ) {
        s -= 8
      }
      // 极小随机扰动：同分时避免每局一模一样
      s += Math.random() * 3

      if (s > localScore) {
        localScore = s
        localBest = m
      }
      if (ctx.aborted) break
    }

    if (ctx.aborted && d > 1) break // 本层没搜完 → 采用上一层结果
    if (localBest) {
      best = localBest
      bestScore = localScore
      const idx = moves.indexOf(localBest)
      if (idx > 0) {
        moves.splice(idx, 1)
        moves.unshift(localBest)
      }
    }
    if (bestScore >= MATE - 10000) break // 已算到杀棋，不必再深搜
  }

  return best
}

module.exports = { chooseMove, evaluate, pieceValue, valueOf, hashBoard, MATE, HIDDEN_VALUE }

// 调试用（不影响对局逻辑）：暴露搜索内部函数，便于回归定位
module.exports._debug = { negamax: negamax, quiesce: quiesce, orderMoves: orderMoves }
