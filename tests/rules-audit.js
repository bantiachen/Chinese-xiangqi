/**
 * 阴阳象棋 · 中国象棋规则一致性审核测试
 * 以「裁判」视角逐条核对官方规则与引擎实现是否一致。
 * 运行： node tests/rules-audit.js
 *
 * 约定：每个测试局面必须同时摆放红帅与黑将（否则引擎按「将帅已被吃」处理，
 *       会过滤掉全部走法）。默认用 setup() 摆在非同一纵线，天然避开白脸将。
 */
const RE = require('../utils/RulesEngine')
const { Game } = require('../utils/game')

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fail++
    failures.push(name + (detail ? '  → ' + detail : ''))
    console.log('  ✗ ' + name + (detail ? '  → ' + detail : ''))
  }
}

let seq = 0
function put(board, x, y, type, color, state) {
  board[y][x] = {
    id: 't' + seq++,
    realType: type,
    pos: { x: x, y: y },
    initialPositionType: type,
    slotSide: y >= 5 ? 'red' : 'black', // 棋位阵营（手工摆盘按半场推定）
    state: state === undefined ? 1 : state,
    color: color,
  }
  return board[y][x]
}

/** 标准空盘 + 双方将帅（不同纵线，天然不照面，且远离测试用格） */
function setup() {
  const b = []
  for (let y = 0; y < 10; y++) b.push(new Array(9).fill(null))
  put(b, 3, 9, 'jiang', 'red')
  put(b, 5, 0, 'jiang', 'black')
  return b
}

function emptyBoard() {
  return setup()
}

function got(board, from) {
  return RE.getLegalTargets(board, from).map((t) => t.x + ',' + t.y)
}

function targetsEq(board, from, expect) {
  const g = got(board, from).sort()
  const w = expect.slice().sort()
  return { same: JSON.stringify(g) === JSON.stringify(w), got: g, want: w }
}

function has(board, from, x, y) {
  return RE.getLegalTargets(board, from).some((t) => t.x === x && t.y === y)
}

console.log('\n══════════ 一、帅 / 将（九宫内一格、白脸将）══════════')
{
  // 将帅同处第 4 纵线，用 (4,3) 的兵隔开，避免初始即照面
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 4, 0, 'jiang', 'black')
  put(b, 4, 3, 'bing', 'red')
  put(b, 4, 8, 'shi', 'red')
  ok('红将九宫内直/横一格；(4,8) 有己方士则不可去', targetsEq(b, { x: 4, y: 9 }, ['3,9', '5,9']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 9 })))
}
{
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 7, 'jiang', 'red')
  put(b, 4, 0, 'jiang', 'black')
  put(b, 4, 3, 'bing', 'red')
  // 将每次只走一格：(4,7) 的合法点只有 (3,7)(5,7)(4,8)；(4,9) 是两格，(4,6) 出宫，均不可
  ok('红将在九宫顶边 (4,7)：只走一格、不出宫', targetsEq(b, { x: 4, y: 7 }, ['3,7', '5,7', '4,8']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 7 })))
  ok('将不可一次走两格（(4,9) 被拒）', !has(b, { x: 4, y: 7 }, 4, 9))
  ok('将不可走出九宫（(4,6) 被拒）', !has(b, { x: 4, y: 7 }, 4, 6))
}
{
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 4, 0, 'jiang', 'black')
  put(b, 4, 5, 'che', 'red') // 唯一隔开将帅的子
  const t = got(b, { x: 4, y: 5 })
  ok('白脸将：横移会造成照面 → 横向走法全被过滤（只剩纵线）', t.length > 0 && t.every((s) => s.indexOf('4,') === 0), 'got=' + JSON.stringify(t))
}

console.log('\n══════════ 二、仕 / 士（九宫斜线一格）══════════')
{
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 4, 0, 'jiang', 'black')
  put(b, 4, 3, 'bing', 'red')
  put(b, 4, 8, 'shi', 'red')
  ok('红士在九宫中心只能斜走四角', targetsEq(b, { x: 4, y: 8 }, ['3,7', '5,7', '3,9', '5,9']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 8 })))

  const b2 = emptyBoard()
  b2[9][3] = null
  b2[0][5] = null
  put(b2, 4, 9, 'jiang', 'red')
  put(b2, 4, 0, 'jiang', 'black')
  put(b2, 4, 3, 'bing', 'red')
  put(b2, 3, 9, 'shi', 'red')
  ok('红士在九宫角 (3,9) 只能到 (4,8)，(2,8) 出宫被拒', targetsEq(b2, { x: 3, y: 9 }, ['4,8']).same, 'got=' + JSON.stringify(got(b2, { x: 3, y: 9 })))
}

console.log('\n══════════ 三、相 / 象（田字、塞象眼、不过河）══════════')
{
  const b = setup()
  put(b, 4, 9, 'xiang', 'red')
  ok('红象走田字两格', targetsEq(b, { x: 4, y: 9 }, ['2,7', '6,7']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 9 })))

  const b2 = setup()
  put(b2, 4, 9, 'xiang', 'red')
  put(b2, 3, 8, 'bing', 'red')
  ok('塞象眼：(3,8) 有子则不能走 (2,7)', targetsEq(b2, { x: 4, y: 9 }, ['6,7']).same, 'got=' + JSON.stringify(got(b2, { x: 4, y: 9 })))

  const b3 = setup()
  put(b3, 2, 5, 'xiang', 'red')
  ok('红象不得过河（y=5 只能回 y≥5）', targetsEq(b3, { x: 2, y: 5 }, ['0,7', '4,7']).same, 'got=' + JSON.stringify(got(b3, { x: 2, y: 5 })))

  const b4 = setup()
  put(b4, 2, 4, 'xiang', 'black')
  ok('黑象不得过河（y=4 只能回 y≤4）', targetsEq(b4, { x: 2, y: 4 }, ['0,2', '4,2']).same, 'got=' + JSON.stringify(got(b4, { x: 2, y: 4 })))
}

console.log('\n══════════ 四、马（日字、蹩马腿）══════════')
{
  const b = setup()
  put(b, 4, 5, 'ma', 'red')
  ok('马走日字八方位（无阻挡 8 个落点）', targetsEq(b, { x: 4, y: 5 }, ['3,3', '5,3', '3,7', '5,7', '2,4', '6,4', '2,6', '6,6']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 5 })))

  const dirs = [
    { leg: [4, 4], blocked: ['3,3', '5,3'], desc: '上腿 (4,4)' },
    { leg: [4, 6], blocked: ['3,7', '5,7'], desc: '下腿 (4,6)' },
    { leg: [3, 5], blocked: ['2,4', '2,6'], desc: '左腿 (3,5)' },
    { leg: [5, 5], blocked: ['6,4', '6,6'], desc: '右腿 (5,5)' },
  ]
  dirs.forEach(function (d) {
    const bb = setup()
    put(bb, 4, 5, 'ma', 'red')
    put(bb, d.leg[0], d.leg[1], 'bing', 'red')
    const all = RE.getLegalTargets(bb, { x: 4, y: 5 })
    const blockedBoth = d.blocked.every(function (s) {
      const xy = s.split(',')
      return !all.some((t) => t.x === +xy[0] && t.y === +xy[1])
    })
    ok('蹩马腿：' + d.desc + ' 有子 → 对应两马步被封（剩 6 个）', blockedBoth && all.length === 6, '剩余=' + all.length)
  })
}

console.log('\n══════════ 五、车（直线、不可穿越）══════════')
{
  const b = setup()
  put(b, 0, 5, 'che', 'red')
  const t = RE.getLegalTargets(b, { x: 0, y: 5 })
  const col = t.filter((p) => p.x === 0).length
  const row = t.filter((p) => p.y === 5).length
  ok('车纵向 9 格 + 横向 8 格 = 17', col === 9 && row === 8, 'col=' + col + ' row=' + row)

  const b2 = setup()
  put(b2, 0, 5, 'che', 'red')
  put(b2, 0, 2, 'bing', 'red')
  put(b2, 3, 5, 'bing', 'black')
  ok('车不可穿越/吃己方子', !has(b2, { x: 0, y: 5 }, 0, 1) && !has(b2, { x: 0, y: 5 }, 0, 2))
  ok('车可吃敌方子但不可越过该子', has(b2, { x: 0, y: 5 }, 3, 5) && !has(b2, { x: 0, y: 5 }, 4, 5))
}

console.log('\n══════════ 六、炮（移动同车、隔一子跳吃）══════════')
{
  const b = setup()
  put(b, 0, 5, 'pao', 'red')
  ok('空盘炮移动同车（17 格）', RE.getLegalTargets(b, { x: 0, y: 5 }).length === 17, 'got=' + RE.getLegalTargets(b, { x: 0, y: 5 }).length)

  const b2 = setup()
  put(b2, 0, 5, 'pao', 'red')
  put(b2, 0, 3, 'bing', 'black') // 炮架
  put(b2, 0, 1, 'bing', 'black') // 目标
  ok('炮隔一子可跳吃', has(b2, { x: 0, y: 5 }, 0, 1))
  ok('炮无炮架时不可吃紧邻子', !has(b2, { x: 0, y: 5 }, 0, 3))
  ok('炮不可越过炮架落空格', !has(b2, { x: 0, y: 5 }, 0, 2))

  const b3 = setup()
  put(b3, 0, 5, 'pao', 'red')
  put(b3, 0, 4, 'bing', 'black')
  put(b3, 0, 3, 'bing', 'black')
  put(b3, 0, 2, 'bing', 'black')
  ok('炮隔两子不可吃（(0,2) 之后还有第二子）', !has(b3, { x: 0, y: 5 }, 0, 2))

  const b4 = setup()
  put(b4, 0, 5, 'pao', 'red')
  put(b4, 0, 3, 'bing', 'red')
  put(b4, 0, 1, 'bing', 'red')
  ok('炮不可吃己方子', !has(b4, { x: 0, y: 5 }, 0, 1))
}

console.log('\n══════════ 七、兵 / 卒（进、过河横走、永不后退）══════════')
{
  const b = setup()
  put(b, 4, 6, 'bing', 'red')
  ok('红兵未过河只能向前一格', targetsEq(b, { x: 4, y: 6 }, ['4,5']).same, 'got=' + JSON.stringify(got(b, { x: 4, y: 6 })))

  const b2 = setup()
  put(b2, 4, 4, 'bing', 'red')
  ok('红兵过河后可向前或左右一格', targetsEq(b2, { x: 4, y: 4 }, ['4,3', '3,4', '5,4']).same, 'got=' + JSON.stringify(got(b2, { x: 4, y: 4 })))
  ok('兵永不后退', !has(b2, { x: 4, y: 4 }, 4, 5))

  // 黑方半场为 y0~y4，河界在 y4/y5 之间 → 黑卒在 (4,3) 尚未过河
  const b3 = setup()
  put(b3, 4, 3, 'bing', 'black')
  ok('黑卒未过河只能向前一格（方向相反）', targetsEq(b3, { x: 4, y: 3 }, ['4,4']).same, 'got=' + JSON.stringify(got(b3, { x: 4, y: 3 })))

  const b4 = setup()
  put(b4, 4, 5, 'bing', 'black')
  ok('黑卒过河后（y=5 已入红方半场）可左右走', targetsEq(b4, { x: 4, y: 5 }, ['4,6', '3,5', '5,5']).same, 'got=' + JSON.stringify(got(b4, { x: 4, y: 5 })))
}

console.log('\n══════════ 八、吃子 ══════════')
{
  const b = setup()
  put(b, 4, 5, 'che', 'red')
  put(b, 4, 3, 'che', 'red')
  ok('走到对方子所在点即吃；不可吃己方子', !has(b, { x: 4, y: 5 }, 4, 3) && has(b, { x: 4, y: 5 }, 4, 4))
}

console.log('\n══════════ 九、被将军必须应将（送将过滤）══════════')
{
  // 红兵 (4,7) 垫在黑车 (4,0) 与红帅 (4,9) 之间，离开即送将
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 3, 0, 'jiang', 'black')
  put(b, 4, 0, 'che', 'black')
  put(b, 4, 7, 'bing', 'red')
  const t = got(b, { x: 4, y: 7 })
  ok('垫将的兵不得离开纵线（走开即送将）', t.length > 0 && t.every((s) => s.indexOf('4,') === 0), 'got=' + JSON.stringify(t))
}
{
  const b = emptyBoard()
  b[9][3] = null
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 3, 0, 'jiang', 'black')
  put(b, 4, 5, 'che', 'black')
  const jg = got(b, { x: 4, y: 9 })
  ok('被车将军时不可停留在同一纵线', jg.length > 0 && jg.every((s) => +s.split(',')[0] !== 4), 'got=' + JSON.stringify(jg))
  ok('被车将军时可横向避将', jg.some((s) => s === '5,9'), 'got=' + JSON.stringify(jg))
}

console.log('\n══════════ 十、将死 / 困毙 ══════════')
{
  // 困毙：黑将 (4,0) 未被将军，(3,0)(5,0)(4,1) 全被控制
  const b = setup()
  b[0][5] = null
  put(b, 4, 0, 'jiang', 'black')
  put(b, 3, 5, 'che', 'red') // 控 (3,0)
  put(b, 5, 5, 'che', 'red') // 控 (5,0)
  put(b, 6, 2, 'ma', 'red') // 控 (4,1)
  const inChk = RE.isGeneralUnderAttack(b, 'black')
  const legal = RE.generateLegalMoves(b, 'black')
  ok('困毙：未被将军但无合法着法', inChk === false && legal.length === 0, 'inCheck=' + inChk + ' legal=' + legal.length + ' ' + JSON.stringify(legal.map((m) => m.to.x + ',' + m.to.y)))
}
{
  // 将死：黑将 (4,0) 被红车 (4,3) 将军，三处逃点全封
  const b = setup()
  b[0][5] = null
  put(b, 4, 0, 'jiang', 'black')
  put(b, 4, 3, 'che', 'red')
  put(b, 2, 2, 'ma', 'red') // 控 (3,0) 与 (4,1)
  put(b, 6, 2, 'ma', 'red') // 控 (5,0)
  const inChk = RE.isGeneralUnderAttack(b, 'black')
  const legal = RE.generateLegalMoves(b, 'black')
  ok('将死：被将军且无合法着法', inChk === true && legal.length === 0, 'inCheck=' + inChk + ' legal=' + legal.length)
}

console.log('\n══════════ 十一、开局合法着法数（基准 44）══════════')
{
  const g = new Game('normal')
  const red = RE.generateLegalMoves(g.board, 'red').length
  const black = RE.generateLegalMoves(g.board, 'black').length
  ok('传统开局红方 44 着（车4 马4 炮24 象4 士2 将1 兵5）', red === 44, 'got=' + red)
  ok('传统开局黑方 44 着（对称）', black === 44, 'got=' + black)
}

console.log('\n══════════ 十二、暗棋双维度（暗=棋位 / 明=真实身份）══════════')
{
  const b = setup()
  const hidden = put(b, 4, 5, 'che', 'red', 0)
  hidden.initialPositionType = 'ma' // 棋位是马
  const t = RE.getLegalTargets(b, { x: 4, y: 5 })
  const allMa = t.every(function (p) {
    const dx = Math.abs(p.x - 4)
    const dy = Math.abs(p.y - 5)
    return (dx === 1 && dy === 2) || (dx === 2 && dy === 1)
  })
  ok('暗棋（真实=车，棋位=马）只走马步', allMa && t.length === 8, 'got=' + JSON.stringify(got(b, { x: 4, y: 5 })))

  hidden.state = 1
  const t2 = RE.getLegalTargets(b, { x: 4, y: 5 })
  const straight = t2.some((p) => p.x === 4 && p.y !== 5) || t2.some((p) => p.y === 5 && p.x !== 4)
  ok('翻开后改按真实身份（车）走直线', straight, '落点数=' + t2.length)
}
{
  const b = emptyBoard()
  b[9][3] = null // 移除默认红帅，改用 (4,9)
  b[0][5] = null
  put(b, 4, 9, 'jiang', 'red')
  put(b, 3, 0, 'jiang', 'black')
  const h1 = put(b, 4, 0, 'bing', 'black', 0)
  h1.initialPositionType = 'che' // 棋位=车
  ok('暗棋（棋位=车）按车的方式构成将军', RE.isGeneralUnderAttack(b, 'red') === true)

  const b2 = emptyBoard()
  b2[9][3] = null
  b2[0][5] = null
  put(b2, 4, 9, 'jiang', 'red')
  put(b2, 3, 0, 'jiang', 'black')
  const h2 = put(b2, 4, 0, 'che', 'black', 0)
  h2.initialPositionType = 'bing' // 棋位=兵
  ok('暗棋（棋位=兵、真实=车）不产生直线将军（不窥视身份）', RE.isGeneralUnderAttack(b2, 'red') === false)
}

console.log('\n══════════ 十三、胜负 / 悔棋 / 记谱 ══════════')
{
  const g = new Game('normal')
  const n = g.board.reduce((s, row) => s + row.filter(Boolean).length, 0)
  ok('传统模式开局 32 子', n === 32, 'got=' + n)
  const mv = RE.generateLegalMoves(g.board, 'red')[0]
  g.doMove(mv.from, mv.to)
  ok('走子后回合切换为黑方', g.currentTurn === 'black')
  ok('棋谱记录 1 条', g.moves.length === 1, 'got=' + g.moves.length)
  console.log('    记谱样例：' + g.moves[0].side + ' ' + g.moves[0].text + '   （坐标 ' + g.moves[0].raw + '）')
  g.undo()
  ok('悔棋后回到红方且棋谱清空', g.currentTurn === 'red' && g.moves.length === 0)

  const gb = new Game('blind')
  let cnt = 0
  let dark = 0
  let kings = 0
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = gb.board[y][x]
      if (!p) continue
      cnt++
      if (p.state === 0) dark++
      if (p.realType === 'jiang') kings++
    }
  }
  ok('盲棋开局 32 子 / 30 暗 / 2 将帅明棋', cnt === 32 && dark === 30 && kings === 2, cnt + '/' + dark + '/' + kings)
}

console.log('\n══════════ 十四、长将判负（连续将军不得超过 3 次）══════════')
{
  const g = new Game('normal')
  let guard = 0
  let maxStreak = 0
  while (!g.winner && guard++ < 60) {
    const moves = RE.generateLegalMoves(g.board, g.currentTurn)
    if (!moves.length) break
    const nb = RE.cloneBoard(g.board) // 每步都从真实局面克隆，避免试探盘累积失真
    let checking = null
    for (const m of moves) {
      const u = { moving: nb[m.from.y][m.from.x], captured: nb[m.to.y][m.to.x] }
      nb[m.to.y][m.to.x] = u.moving
      nb[m.from.y][m.from.x] = null
      u.moving.pos = { x: m.to.x, y: m.to.y }
      if (RE.isGeneralUnderAttack(nb, g.currentTurn === 'red' ? 'black' : 'red')) {
        checking = m
        break
      }
      nb[m.from.y][m.from.x] = u.moving
      nb[m.to.y][m.to.x] = u.captured
      u.moving.pos = { x: m.from.x, y: m.from.y }
    }
    const pick = checking || moves[0]
    g.doMove(pick.from, pick.to)
    maxStreak = Math.max(maxStreak, g.checkStreak.red, g.checkStreak.black)
  }
  ok('存在长将判负机制（连续将军 > 3 判负）', typeof g.checkStreak === 'object' && g.winner !== null, 'winner=' + g.winner)
  ok('判负原因为长将', /长将判负/.test(g.message), 'message=' + g.message)
  ok('连续将军计数上限被触发（曾达到 4）', maxStreak >= 4, 'maxStreak=' + maxStreak)
  console.log('    模拟对局：胜者=' + g.winner + ' ｜ ' + g.message + ' ｜ 计数=' + JSON.stringify(g.checkStreak))
}
{
  // 悔棋应能回退长将计数
  const g = new Game('normal')
  let guard = 0
  while (!g.winner && guard++ < 60) {
    const moves = RE.generateLegalMoves(g.board, g.currentTurn)
    if (!moves.length) break
    const nb = RE.cloneBoard(g.board)
    let checking = null
    for (const m of moves) {
      const u = { moving: nb[m.from.y][m.from.x], captured: nb[m.to.y][m.to.x] }
      nb[m.to.y][m.to.x] = u.moving
      nb[m.from.y][m.from.x] = null
      u.moving.pos = { x: m.to.x, y: m.to.y }
      if (RE.isGeneralUnderAttack(nb, g.currentTurn === 'red' ? 'black' : 'red')) {
        checking = m
        break
      }
      nb[m.from.y][m.from.x] = u.moving
      nb[m.to.y][m.to.x] = u.captured
      u.moving.pos = { x: m.from.x, y: m.from.y }
    }
    const pick = checking || moves[0]
    g.doMove(pick.from, pick.to)
  }
  const before = JSON.stringify(g.checkStreak)
  g.undo()
  ok('悔棋后长将计数同步回退', JSON.stringify(g.checkStreak) !== before || g.winner === null, 'before=' + before + ' after=' + JSON.stringify(g.checkStreak))
}

console.log('\n══════════ 十五、暗棋开局「全场随机」+ 明棋不受河界/九宫限制 ══════════')
{
  // 采集多局暗棋开局，统计「红黑混住」（红子出现在黑方半场 y<=4 / 黑子出现在红方半场 y>=5）
  const boards = []
  let layoutVariety = {}
  let mixedCount = 0
  let redInBlack = 0
  let blackInRed = 0
  for (let n = 0; n < 10; n++) {
    const g = new Game('blind')
    boards.push(g)
    let sig = ''
    let boardMixed = false
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const p = g.board[y][x]
        if (!p) continue
        sig += p.color + ':' + p.realType + '@' + x + ',' + y + '|'
        if (p.realType === 'jiang') continue
        if (p.color === 'red' && y <= 4) {
          redInBlack++
          boardMixed = true
        }
        if (p.color === 'black' && y >= 5) {
          blackInRed++
          boardMixed = true
        }
      }
    }
    layoutVariety[sig] = true
    if (boardMixed) mixedCount++
  }
  const g0 = boards[0].board
  let dark = 0
  let kingsOk = 0
  const occupied = {}
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = g0[y][x]
      if (!p) continue
      occupied[x + ',' + y] = true
      if (p.state === 0) dark++
      if (p.realType === 'jiang' && p.state === 1 && x === 4 && (y === 0 || y === 9)) kingsOk++
    }
  }
  ok('暗棋开局 30 枚暗棋（全部 state=0）', dark === 30, 'got=' + dark)
  ok('将帅仍为明棋且固定在九宫底线中央 (4,0)/(4,9)', kingsOk === 2, 'got=' + kingsOk)
  ok('暗棋落在传统 30 个棋位上（无重叠）', Object.keys(occupied).length === 32, 'got=' + Object.keys(occupied).length)
  ok('红黑混住：红子可出现在黑方半场 / 黑子可出现在红方半场', mixedCount >= 8, 'mixed=' + mixedCount + '/10  红入黑半场=' + redInBlack + ' 黑入红半场=' + blackInRed)
  ok('每局布局随机（10 局至少 8 种不同落子）', Object.keys(layoutVariety).length >= 8, 'got=' + Object.keys(layoutVariety).length)
  console.log('    样例：红子入黑方半场 ' + redInBlack + ' 枚次 ｜ 黑子入红方半场 ' + blackInRed + ' 枚次')
}
{
  // 暗棋模式（blind）：象可过河、士可出九宫；暗棋阶段用棋位走法，同样不受河界 / 九宫限制
  new Game('blind') // 注入 blind 变体
  const b = setup()
  put(b, 2, 4, 'xiang', 'red') // 红相在己方半场，田字目标 (0,2)/(4,2) 在黑方半场
  ok('暗棋模式：红相可过河（含 (0,2)/(4,2) 两处过河点）', targetsEq(b, { x: 2, y: 4 }, ['0,2', '4,2', '0,6', '4,6']).same, 'got=' + JSON.stringify(got(b, { x: 2, y: 4 })))

  const b2 = setup()
  put(b2, 4, 5, 'shi', 'red') // 红仕在九宫之外
  ok('暗棋模式：红仕可走出九宫（斜一格四处）', targetsEq(b2, { x: 4, y: 5 }, ['3,4', '5,4', '3,6', '5,6']).same, 'got=' + JSON.stringify(got(b2, { x: 4, y: 5 })))

  const b3 = setup()
  const hx = put(b3, 2, 3, 'bing', 'red', 0) // 暗棋（真实=兵）落在黑方半场，棋位=象
  hx.initialPositionType = 'xiang'
  ok('暗棋（棋位=象）落在对方半场仍能走田字（不被河界卡死）', RE.getLegalTargets(b3, { x: 2, y: 3 }).length === 4, 'got=' + JSON.stringify(got(b3, { x: 2, y: 3 })))

  const b4 = setup()
  const hs = put(b4, 4, 6, 'che', 'red', 0) // 暗棋（真实=车）棋位=士，落在非九宫棋位
  hs.initialPositionType = 'shi'
  ok('暗棋（棋位=士）落在非九宫棋位仍能斜走（不被九宫卡死）', RE.getLegalTargets(b4, { x: 4, y: 6 }).length === 4, 'got=' + JSON.stringify(got(b4, { x: 4, y: 6 })))
  const b4b = setup()
  const hs2 = put(b4b, 4, 6, 'che', 'black', 0) // 同棋位、真实颜色为黑
  hs2.initialPositionType = 'shi'
  ok('同一棋位的暗子走法与其真实颜色无关（合法性只看看得见的信息）',
    JSON.stringify(got(b4b, { x: 4, y: 6 })) === JSON.stringify(got(b4, { x: 4, y: 6 })), 'got=' + JSON.stringify(got(b4b, { x: 4, y: 6 })))
}
{
  // 传统模式（normal）：官方规则必须保持不变（对照测试）
  new Game('normal')
  const b = setup()
  put(b, 2, 4, 'xiang', 'red')
  ok('传统模式：红相仍不得过河（只剩 (0,6)/(4,6)）', targetsEq(b, { x: 2, y: 4 }, ['0,6', '4,6']).same, 'got=' + JSON.stringify(got(b, { x: 2, y: 4 })))

  const b2 = setup()
  put(b2, 2, 4, 'xiang', 'black')
  ok('传统模式：黑象仍不得过河（只剩 (0,2)/(4,2)）', targetsEq(b2, { x: 2, y: 4 }, ['0,2', '4,2']).same, 'got=' + JSON.stringify(got(b2, { x: 2, y: 4 })))

  const b3 = setup()
  put(b3, 4, 5, 'shi', 'red')
  ok('传统模式：红仕仍不得出九宫（0 个落点）', RE.getLegalTargets(b3, { x: 4, y: 5 }).length === 0, 'got=' + JSON.stringify(got(b3, { x: 4, y: 5 })))
}

console.log('\n══════════ 十六、暗棋背面统一编码（不泄漏红黑）══════════')
{
  const { encodePiece, HIDDEN_CODE } = require('../utils/pieces')
  const g = new Game('blind')
  const codes = {}
  let hiddenTotal = 0
  let coloredHidden = 0
  let revealedWrong = 0
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = g.board[y][x]
      if (!p) continue
      const code = encodePiece(p)
      codes[code] = (codes[code] || 0) + 1
      if (p.state === 0) {
        hiddenTotal++
        if (code !== HIDDEN_CODE) coloredHidden++
      } else {
        // 明子必须是「颜色首字母 + 类型码」，且与真实身份一致
        const expect = (p.color === 'red' ? 'r' : 'b') + { jiang: 'K', che: 'R', ma: 'N', xiang: 'B', shi: 'A', pao: 'C', bing: 'P' }[p.realType]
        if (code !== expect) revealedWrong++
      }
    }
  }
  ok('30 枚暗棋的渲染编码全部为统一中性码 ' + HIDDEN_CODE, hiddenTotal === 30 && coloredHidden === 0, '暗子=' + hiddenTotal + ' 带颜色=' + coloredHidden)
  ok('编码表中不含按颜色区分的背面码（r_ / b_ 已废弃）', !codes.r_ && !codes.b_ && !!codes[HIDDEN_CODE], JSON.stringify(codes))
  ok('明子才上色：将帅编码为 rK / bK', codes.rK === 1 && codes.bK === 1, 'rK=' + codes.rK + ' bK=' + codes.bK)
  ok('明子编码与真实身份完全一致', revealedWrong === 0, '不符=' + revealedWrong)

  // 同色不同阵营的暗棋编码必须一致（否则一眼看穿阵营）
  const redHidden = { id: 'h1', realType: 'che', pos: { x: 0, y: 0 }, initialPositionType: 'che', state: 0, color: 'red' }
  const blackHidden = { id: 'h2', realType: 'che', pos: { x: 0, y: 0 }, initialPositionType: 'che', state: 0, color: 'black' }
  ok('红暗子与黑暗子编码完全相同', encodePiece(redHidden) === encodePiece(blackHidden), encodePiece(redHidden) + ' vs ' + encodePiece(blackHidden))
  ok('翻面后（state=1）才按颜色上色', encodePiece({ color: 'red', realType: 'che', state: 1 }) === 'rR' &&
    encodePiece({ color: 'black', realType: 'che', state: 1 }) === 'bR', '翻面编码异常')
}

console.log('\n══════════ 十七、暗棋 = 该棋位在明棋布局里的那枚子（只判棋位、不判隐藏颜色）══════════')
{
  new Game('blind') // 注入 blind 变体
  // ① 红方炮位上的暗子（真身未知）隔一子吃掉「黑方半场棋位」上的暗子：
  //    敌我只看棋位归属，不看那枚暗子的真实颜色 —— 真身是红也照吃（这就是原先被误挡的场景）
  const b = setup() // 红帅(3,9) / 黑将(5,0)，天然不照面
  const pao = put(b, 1, 7, 'che', 'red', 0) // 红方炮位（y=7），真身=车（未知）
  pao.initialPositionType = 'pao'
  put(b, 1, 5, 'bing', 'red', 0) // 炮架（红方半场棋位上的暗子）
  const tgt = put(b, 1, 3, 'ma', 'red', 0) // 目标：黑方卒位上的暗子，真实颜色为「红」
  const t17 = got(b, { x: 1, y: 7 })
  ok('红方炮位暗子可隔子吃掉黑方半场的暗子（目标真身是红也照吃）', t17.indexOf('1,3') >= 0, 'got=' + JSON.stringify(t17))
  ok('炮架本身不可直接吃（隔子规则仍生效）', t17.indexOf('1,5') < 0, 'got=' + JSON.stringify(t17))
  ok('该吃法确实进入合法着法表', RE.generateLegalMoves(b, 'red').some(function (m) {
    return m.from.x === 1 && m.from.y === 7 && m.to.x === 1 && m.to.y === 3
  }))

  // ② 同方（都属红方棋位）不能吃：目标换成红方半场棋位上的暗子（真身是黑也不行）
  const b2 = setup()
  const pao2 = put(b2, 1, 7, 'che', 'black', 0)
  pao2.initialPositionType = 'pao'
  put(b2, 1, 5, 'bing', 'black', 0) // 炮架
  put(b2, 1, 6, 'che', 'black', 1) // 挡在红方半场的同方明棋…（用 ① 的棋盘另测）
  const b3 = setup()
  const pao3 = put(b3, 1, 7, 'che', 'black', 0)
  pao3.initialPositionType = 'pao'
  put(b3, 1, 5, 'bing', 'red', 0) // 炮架（红方半场）
  put(b3, 1, 6, 'bing', 'black', 0) // 红方半场的暗子（真身是黑）→ 与炮位同属红方，不可吃
  ok('红方半场棋位上的暗子与炮位同方 → 不可吃（真身是黑也不行）', got(b3, { x: 1, y: 7 }).indexOf('1,6') < 0, 'got=' + JSON.stringify(got(b3, { x: 1, y: 7 })))
  tgt.color = 'black' // ① 里那枚目标的真实颜色改成黑，结论不变（照吃）
  ok('目标真实颜色换成黑，结论不变（照吃）', got(b, { x: 1, y: 7 }).indexOf('1,3') >= 0, 'got=' + JSON.stringify(got(b, { x: 1, y: 7 })))

  // ③ 明棋才按真实颜色：炮位暗子吃不了己方明棋、能吃对方明棋
  const b4 = setup()
  const pao4 = put(b4, 1, 7, 'che', 'red', 0)
  pao4.initialPositionType = 'pao'
  put(b4, 1, 5, 'bing', 'red') // 明棋炮架
  const tgt4 = put(b4, 1, 3, 'ma', 'red') // 明棋（红，同方）
  const t47 = got(b4, { x: 1, y: 7 })
  ok('已翻开的同方明棋不可吃', t47.indexOf('1,3') < 0, 'got=' + JSON.stringify(t47))
  tgt4.color = 'black'
  ok('已翻开的对方明棋可吃', got(b4, { x: 1, y: 7 }).indexOf('1,3') >= 0, 'got=' + JSON.stringify(got(b4, { x: 1, y: 7 })))

  // ④ 暗子（棋位=车）直线吃「黑方半场棋位」上的暗子（真身是红也吃）
  const b5 = setup()
  const che = put(b5, 0, 9, 'bing', 'black', 0) // 红方底线车位（y=9），真身=兵
  che.initialPositionType = 'che'
  put(b5, 0, 3, 'xiang', 'red', 0) // 黑方卒位上的暗子（真身是红）→ 对方棋位，可吃
  const t5 = got(b5, { x: 0, y: 9 })
  ok('暗子（棋位=车）直线可吃「黑方半场棋位」上的暗子（真身是红也吃）', t5.indexOf('0,3') >= 0, 'got=' + JSON.stringify(t5))

  // ⑤ 暗子（棋位=车）吃不了「同方棋位」上的暗子（真身是黑也不行）
  const b5b = setup()
  const che2 = put(b5b, 8, 9, 'pao', 'red', 0) // 红方底线车位，真身=炮
  che2.initialPositionType = 'che'
  put(b5b, 8, 6, 'ma', 'black', 0) // 红方兵位上的暗子（真身是黑）→ 同方棋位
  const t5b = got(b5b, { x: 8, y: 9 })
  ok('暗子（棋位=车）吃不了同方棋位上的暗子（真身是黑也不行）', t5b.indexOf('8,6') < 0 && t5b.indexOf('8,8') >= 0, 'got=' + JSON.stringify(t5b))

  // ⑤ 暗子（棋位=马）走法仍由棋位决定：占位子无论红黑都只是「占位」
  const b6 = setup()
  const ma = put(b6, 4, 5, 'che', 'red', 0)
  ma.initialPositionType = 'ma'
  put(b6, 4, 4, 'bing', 'red', 0) // 同方暗子占住向下马腿
  const t6 = got(b6, { x: 4, y: 5 })
  ok('暗子（棋位=马）被占马腿后少两个落点', t6.length === 6 && t6.indexOf('3,3') < 0 && t6.indexOf('5,3') < 0, 'got=' + JSON.stringify(t6))
  ok('未蹩腿方向的马步照常可走', t6.indexOf('5,7') >= 0 && t6.indexOf('2,4') >= 0, 'got=' + JSON.stringify(t6))

  // ⑥ 传统模式（全明棋）行为不变：炮不可吃同色明棋
  new Game('normal')
  const b7 = setup()
  put(b7, 1, 7, 'pao', 'red')
  put(b7, 1, 5, 'bing', 'red')
  put(b7, 1, 3, 'ma', 'red')
  ok('传统模式：炮不可吃「同色」明棋（官方规则未变）', got(b7, { x: 1, y: 7 }).indexOf('1,3') < 0, 'got=' + JSON.stringify(got(b7, { x: 1, y: 7 })))
}

console.log('\n══════════ 十八、兵/卒：暗子方向按棋位阵营（与颜色无关）══════════')
{
  new Game('blind')
  // 同一棋位上的暗子，无论真实颜色如何，走法必须完全一致（否则方向会泄漏阵营）
  const bRed = setup()
  put(bRed, 4, 6, 'che', 'red', 0) // 红方兵位上的暗子（真红）
  bRed[6][4].initialPositionType = 'bing'
  const bBlk = setup()
  put(bBlk, 4, 6, 'che', 'black', 0) // 红方兵位上的暗子（真黑）
  bBlk[6][4].initialPositionType = 'bing'
  ok('红方兵位暗子：真红 / 真黑 落点完全相同（都向前过河方向走）',
    JSON.stringify(got(bRed, { x: 4, y: 6 })) === JSON.stringify(got(bBlk, { x: 4, y: 6 })) &&
    JSON.stringify(got(bRed, { x: 4, y: 6 })) === JSON.stringify(['4,5']),
    'red=' + JSON.stringify(got(bRed, { x: 4, y: 6 })) + ' black=' + JSON.stringify(got(bBlk, { x: 4, y: 6 })))

  const bRed2 = setup()
  put(bRed2, 4, 3, 'che', 'red', 0) // 黑方卒位上的暗子（真红）
  bRed2[3][4].initialPositionType = 'bing'
  const bBlk2 = setup()
  put(bBlk2, 4, 3, 'che', 'black', 0) // 黑方卒位上的暗子（真黑）
  bBlk2[3][4].initialPositionType = 'bing'
  ok('黑方卒位暗子：真红 / 真黑 落点完全相同（都按卒位向红方走）',
    JSON.stringify(got(bRed2, { x: 4, y: 3 })) === JSON.stringify(got(bBlk2, { x: 4, y: 3 })) &&
    JSON.stringify(got(bRed2, { x: 4, y: 3 })) === JSON.stringify(['4,4']),
    'red=' + JSON.stringify(got(bRed2, { x: 4, y: 3 })) + ' black=' + JSON.stringify(got(bBlk2, { x: 4, y: 3 })))

  // 翻面之后才按真实颜色（用户规则：第一次行棋后变明棋，之后照明棋规则）
  const bMing = setup()
  put(bMing, 4, 6, 'bing', 'black') // 明棋黑卒在红方兵位：向下走，且已过河可横走
  ok('翻面后按真实颜色：黑卒在 y=6 向下走 + 已过河可横走',
    JSON.stringify(got(bMing, { x: 4, y: 6 })) === JSON.stringify(['4,7', '3,6', '5,6']), 'got=' + JSON.stringify(got(bMing, { x: 4, y: 6 })))
  const bMing2 = setup()
  put(bMing2, 4, 6, 'bing', 'red')
  ok('翻面后按真实颜色：红兵在兵位向上走', JSON.stringify(got(bMing2, { x: 4, y: 6 })) === JSON.stringify(['4,5']), 'got=' + JSON.stringify(got(bMing2, { x: 4, y: 6 })))

  // 将军判定与归属一致：红方兵位上的暗子（哪怕真实颜色是黑）按棋位就是「红兵方向」
  const bChk = setup()
  bChk[0][5] = null // 移走默认黑将，改摆到 (4,5)
  put(bChk, 3, 9, 'jiang', 'red')
  put(bChk, 4, 5, 'jiang', 'black')
  const atk = put(bChk, 4, 6, 'che', 'black', 0) // 红方兵位上的暗子（真实颜色为黑）
  atk.initialPositionType = 'bing'
  ok('红方兵位暗子按棋位归属红方 → 按红兵方向将军（与其真实颜色无关）', RE.isGeneralUnderAttack(bChk, 'black') === true)

  const bChk2 = setup()
  bChk2[9][3] = null
  bChk2[0][5] = null
  put(bChk2, 4, 4, 'jiang', 'red') // 红帅（测试用摆位）
  put(bChk2, 3, 0, 'jiang', 'black')
  const atk2 = put(bChk2, 4, 3, 'che', 'red', 0) // 黑方卒位上的暗子（真实颜色为红）
  atk2.initialPositionType = 'bing'
  ok('黑方卒位暗子按棋位归属黑方 → 按黑卒方向将军红帅（与其真实颜色无关）', RE.isGeneralUnderAttack(bChk2, 'red') === true)

  // 明棋按真实颜色（对照）：真红兵放在卒位不会向下攻击
  const bChk3 = setup()
  bChk3[9][3] = null
  bChk3[0][5] = null
  put(bChk3, 4, 4, 'jiang', 'red')
  put(bChk3, 3, 0, 'jiang', 'black')
  put(bChk3, 4, 3, 'bing', 'red') // 明棋红兵在卒位
  ok('明棋红兵在卒位不会向下攻击（走法按真实颜色）', RE.isGeneralUnderAttack(bChk3, 'red') === false)
}

console.log('\n══════════ 十九、归属按棋位：红黑各自只能操作自己这半场棋位上的暗子 ══════════')
{
  const colsOf = function (moves) {
    const set = {}
    moves.forEach(function (m) { set[m.from.x + ',' + m.from.y] = 1 })
    return Object.keys(set)
  }
  // 合法性只看看得见的信息（棋位职责）：开局双方各 16 个可动起点，全部落在各自半场
  const g = new Game('blind')
  const redFrom = colsOf(RE.generateLegalMoves(g.board, 'red'))
  const blackFrom = colsOf(RE.generateLegalMoves(g.board, 'black'))
  ok('开局红方可动起点 16 个且全在红方半场（15 个红方棋位 + 红帅）',
    redFrom.length === 16 && redFrom.every(function (s) { return Number(s.split(',')[1]) >= 5 }), redFrom.join(' '))
  ok('开局黑方可动起点 16 个且全在黑方半场（15 个黑方棋位 + 黑将）',
    blackFrom.length === 16 && blackFrom.every(function (s) { return Number(s.split(',')[1]) <= 4 }), blackFrom.join(' '))
  ok('双方可动起点互不重叠（归属互斥）', RE.hasAnyLegalMove(g.board, 'red') && RE.hasAnyLegalMove(g.board, 'black') &&
    redFrom.every(function (s) { return blackFrom.indexOf(s) < 0 }))

  // 归属只看棋位、不看真实颜色：找一枚「位于红方半场棋位、真实颜色却是黑」的暗子
  {
    const g3 = new Game('blind')
    let probe = null
    for (let y = 5; y < 10 && !probe; y++) {
      for (let x = 0; x < 9; x++) {
        const p = g3.board[y][x]
        if (p && p.state === 0 && p.color === 'black') { probe = { x: x, y: y }; break }
      }
    }
    let redCanPick = false
    let blackCanPick = false
    if (probe) {
      g3.currentTurn = 'red'
      g3.select(probe)
      redCanPick = !!g3.selected
      g3.selected = null
      g3.currentTurn = 'black'
      g3.select(probe)
      blackCanPick = !!g3.selected
    }
    ok('红方半场棋位上的暗子（真实颜色为黑）仍归红方操作，黑方选不中',
      !!probe && redCanPick && !blackCanPick, 'probe=' + JSON.stringify(probe) + ' red=' + redCanPick + ' black=' + blackCanPick)
  }

  // 选子路径：点对方半场的暗子选不中，点自己半场的能选中
  const g2 = new Game('blind')
  g2.select({ x: 0, y: 0 }) // 黑方底线棋位
  const missBlack = g2.selected
  g2.select({ x: 0, y: 9 }) // 红方底线棋位
  const hitRed = g2.selected
  ok('红方点黑方半场的暗子选不中，点自己半场的能选中', missBlack === null && !!hitRed,
    'black=' + JSON.stringify(missBlack) + ' red=' + JSON.stringify(hitRed))

  // 真实颜色不影响归属：红方炮位上的暗子（真黑）归红方；翻面后才按其颜色归黑方
  const b = setup()
  const h = put(b, 1, 7, 'che', 'black', 0)
  h.initialPositionType = 'pao'
  const hSideDark = RE.pieceSide(h, 7)
  h.state = 1
  const hSideLight = RE.pieceSide(h, 7)
  ok('红方棋位上的暗子（真实颜色为黑）归属红方', hSideDark === 'red', 'got=' + hSideDark)
  ok('翻成明棋后才按真实颜色归属（真黑 → 黑方，即使站在红方半场）', hSideLight === 'black', 'got=' + hSideLight)
  ok('明棋归属与所在位置无关（只看颜色）', RE.pieceSide({ state: 1, color: 'red' }, 0) === 'red' && RE.pieceSide({ state: 1, color: 'black' }, 9) === 'black')
}

console.log('\n══════════ 二十、翻面之后的意外按明棋规则裁决（不预拦，该吃吃）══════════')
{
  new Game('blind')
  // 红方兵位上的暗子，真身其实是黑车：按棋位职责走一步（红兵向前）完全合法
  const b = []
  for (let y = 0; y < 10; y++) b.push(new Array(9).fill(null))
  put(b, 4, 9, 'jiang', 'red') // 红帅
  put(b, 5, 0, 'jiang', 'black') // 黑将（不同纵线，不照面）
  const dark = put(b, 4, 6, 'che', 'black', 0)
  dark.initialPositionType = 'bing' // 棋位=红方兵位
  ok('暗子按棋位职责的走法不再被真身预拦（可以走）',
    RE.getLegalTargets(b, { x: 4, y: 6 }).some(function (t) { return t.x === 4 && t.y === 5 }), 'got=' + JSON.stringify(got(b, { x: 4, y: 6 })))

  const g = new Game('blind')
  g.board = b // 使用手工摆盘
  g.currentTurn = 'red'
  g.doMove({ x: 4, y: 6 }, { x: 4, y: 5 }) // 红方走这枚暗子 → 翻出黑车
  ok('翻出来的暗子若是对方重子，就会把己方帅暴露出来（运气使然，不预拦）',
    RE.isGeneralUnderAttack(g.board, 'red') === true, 'inCheck(red)=' + RE.isGeneralUnderAttack(g.board, 'red'))

  const cap = RE.generateLegalMoves(g.board, 'black').filter(function (m) { return m.to.x === 4 && m.to.y === 9 })
  ok('黑方按明棋规则可以吃掉暴露的帅（该吃吃）', cap.length > 0, 'cap=' + cap.length)
  g.doMove(cap[0].from, cap[0].to)
  ok('胜负按明棋规则判定：黑方胜（吃掉将帅）', g.winner === 'black' && /吃掉将帅/.test(g.message), 'winner=' + g.winner + ' msg=' + g.message)
}

console.log('\n════════════════════════════════════')
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) {
  console.log('\n失败明细：')
  failures.forEach(function (f) {
    console.log('  - ' + f)
  })
  process.exit(1)
} else {
  console.log('全部规则一致性检查通过 ✅')
}
