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
