// ===== 阴阳象棋 · 游戏状态管理（小程序版）=====
// 纯类、无平台依赖；对外提供棋盘状态与走子/悔棋/胜负/长将判定。
const { createInitialBoard, createTraditionalBoard } = require('./board')
const { getLegalTargets, findGeneral, isGeneralUnderAttack, hasAnyLegalMove, setVariant, pieceSide } = require('./RulesEngine')
const { charOf } = require('./pieces')
const { moveToChinese, coordsText } = require('./notation')

function other(c) {
  return c === 'red' ? 'black' : 'red'
}

/** 长将判负：同一方连续将军不得超过 3 次，第 4 次将军即判该方负 */
const MAX_CONSECUTIVE_CHECKS = 3

class Game {
  constructor(mode) {
    this.moves = [] // 棋谱（供 trimCaptured 等展示逻辑使用，不参与规则判定）
    // mode: 'blind' 阴阳象棋（洗牌 + 0/1 状态）；'normal' 传统象棋（全明棋）
    this.mode = mode === 'normal' ? 'normal' : 'blind'
    this.reset()
  }

  // 切换模式（不传则保持当前模式）
  setMode(mode) {
    this.mode = mode === 'normal' ? 'normal' : 'blind'
    this.reset()
  }

  reset() {
    // 规则变体注入（引擎模块级开关，同一时刻只跑一局）：
    //   blind  → 暗棋开局（30 枚全场随机撒位，红黑混住）+ 象可过河 / 士可出九宫
    //   normal → 传统开局（全明棋）+ 官方规则（象不过河 / 士不出九宫）
    setVariant(this.mode === 'normal' ? 'standard' : 'blind')
    // 盲棋开局：全局随机（洗牌 + 将帅明棋 + 其余暗棋，见 createInitialBoard）
    // 传统象棋：全明棋（createTraditionalBoard，与盲棋开局彼此独立）
    this.board = this.mode === 'normal' ? createTraditionalBoard() : createInitialBoard()
    this.currentTurn = 'red'
    this.selected = null
    this.legalTargets = []
    this.winner = null
    this.inCheck = false
    this.message = '红方先行'
    this.moveCount = 0
    this.history = []
    this.moves = []
    // 连续将军计数（长将判负）：仅统计「该方自己走出的连续将军」
    this.checkStreak = { red: 0, black: 0 }
  }

  pieceAtPos(p) {
    return this.board[p.y] ? this.board[p.y][p.x] : null
  }

  select(p) {
    if (this.winner) return
    const piece = this.pieceAtPos(p)
    // 归属判定：明棋看真实颜色；暗棋看棋位阵营（红黑双方只能操作自己这半场棋位上的暗子）
    if (piece && pieceSide(piece, p.y) === this.currentTurn) {
      this.selected = p
      this.legalTargets = getLegalTargets(this.board, p)
    }
  }

  handleClick(p) {
    if (this.winner) return
    if (this.selected && this.legalTargets.some(function (t) { return t.x === p.x && t.y === p.y })) {
      this.doMove(this.selected, p)
      return
    }
    this.select(p)
  }

  doMove(from, to) {
    const piece = this.board[from.y][from.x]
    // 先校验起点有子，再压入历史：否则会写入一条「空走」快照，导致首次悔棋看起来无效
    if (!piece) return
    this.history.push(this.snapshotState())
    const flipped = piece.state === 0
    const captured = this.board[to.y][to.x] !== null

    // 记谱必须在移动前计算（起点棋子仍在原位，才能判断「前 / 后」）
    const name = charOf(piece.color, piece.realType)
    let text
    try {
      text = moveToChinese(this.board, from, to, piece, name)
    } catch (e) {
      text = name + ' ' + coordsText(from, to)
    }
    if (flipped) text += '（翻）'

    this.board[to.y][to.x] = piece
    this.board[from.y][from.x] = null
    piece.pos = { x: to.x, y: to.y }
    if (flipped) piece.state = 1 // 暗棋走动即翻面
    this.currentTurn = other(this.currentTurn)
    this.selected = null
    this.legalTargets = []
    this.moveCount++
    // 棋谱记录（trimCaptured 依赖其 captured / side 字段，不参与规则判定）
    this.moves.push({
      no: this.moveCount,
      side: pieceSide(piece, from.y) === 'red' ? '红' : '黑', // 操作方（暗子按棋位归属）
      text: text,
      raw: coordsText(from, to),
      captured: captured,
      flipped: flipped
    })
    this.checkEnd()
  }

  snapshotState() {
    return {
      board: this.board.map(function (row) {
        return row.map(function (p) {
          return p ? { id: p.id, realType: p.realType, pos: { x: p.pos.x, y: p.pos.y }, initialPositionType: p.initialPositionType, slotSide: p.slotSide, state: p.state, color: p.color } : null
        })
      }),
      turn: this.currentTurn,
      winner: this.winner,
      inCheck: this.inCheck,
      message: this.message,
      moveCount: this.moveCount,
      checkStreak: { red: this.checkStreak.red, black: this.checkStreak.black }
    }
  }

  checkEnd() {
    const opp = this.currentTurn // 轮到走棋的一方
    const mover = other(opp) // 刚刚走完的一方
    this.inCheck = false

    // 1) 将帅被吃
    if (!findGeneral(this.board, opp)) {
      this.winner = mover
      this.message = (this.winner === 'red' ? '红' : '黑') + '方胜（吃掉将帅）'
      return
    }

    const checked = isGeneralUnderAttack(this.board, opp)

    // 2) 连续将军计数（长将判负）：走子方是否造成将军
    if (checked) this.checkStreak[mover] += 1
    else this.checkStreak[mover] = 0

    // 3) 将死 / 困毙：轮走方无任何合法着法
    if (!hasAnyLegalMove(this.board, opp)) {
      this.winner = mover
      this.inCheck = checked
      this.message = (this.winner === 'red' ? '红' : '黑') + '方胜（' + (checked ? '将死' : '困毙') + '）'
      return
    }

    // 4) 长将判负：连续将军超过 3 次
    if (this.checkStreak[mover] > MAX_CONSECUTIVE_CHECKS) {
      this.winner = opp
      this.inCheck = checked
      this.message = (mover === 'red' ? '红' : '黑') + '方长将判负（连续将军已超过 ' + MAX_CONSECUTIVE_CHECKS + ' 次）'
      return
    }

    this.inCheck = checked
    const streak = this.checkStreak[mover]
    if (checked) {
      this.message =
        (opp === 'red' ? '红' : '黑') +
        '方被将军！' +
        (streak >= MAX_CONSECUTIVE_CHECKS
          ? '（' + (mover === 'red' ? '红' : '黑') + '方已连续将军 ' + streak + ' 次，再将军判负）'
          : '')
    } else {
      this.message = (opp === 'red' ? '红' : '黑') + '方行棋'
    }
  }

  undo() {
    if (this.history.length === 0) return
    const s = this.history.pop()
    this.board = s.board
    this.currentTurn = s.turn
    this.winner = s.winner
    this.inCheck = !!s.inCheck
    this.message = s.message
    this.moveCount = s.moveCount
    this.checkStreak = s.checkStreak ? { red: s.checkStreak.red, black: s.checkStreak.black } : { red: 0, black: 0 }
    this.selected = null
    this.legalTargets = []
    if (this.moves.length) this.moves.pop()
  }
}

module.exports = { Game: Game }
