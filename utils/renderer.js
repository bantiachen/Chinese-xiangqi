/**
 * 阴阳象棋 · Canvas 2D 渲染器（小程序 CommonJS 版，改编自 v0zip 楚汉象棋）
 * ------------------------------------------------------------
 * 适配要点（不改变盲棋规则，仅扩展表现层）：
 *   - 棋盘字符串编码：明子 'rK'/'bC'...；暗子（背面）'r_'/'b_'
 *   - drawPieceTo 新增暗子背面绘制（纯色圆盘 + 中心纹样，无字）
 *   - 新增 revealPiece / spawnRevealParticles：暗→明翻面时的金光迸发
 *   - 性能策略沿用：棋盘缓存离屏 Canvas、棋子预渲染精灵图、静止自停 rAF
 */

/* ------------------------------ 常量与编码 ------------------------------ */
const ROWS = 10
const COLS = 9

// 棋子文字映射（含暗子背面空串）统一来自 utils/pieces.js，此处不再重复定义
const { PIECE_TEXT } = require('./pieces')

function findKing(board, side) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === side + 'K') return { r, c }
    }
  }
  return null
}

/* ------------------------------ 主题配色 ------------------------------ */
const THEMES = {
  dark: {
    wood: ['#3d2819', '#2d1c11', '#1e130b'],
    grain: [255, 214, 150],
    grainAlpha: 0.055,
    knot: 'rgba(0,0,0,0.22)',
    vignette: 'rgba(0,0,0,0.6)',
    line: 'rgba(214,178,112,0.6)',
    frame: 'rgba(214,178,112,0.88)',
    river: 'rgba(214,178,112,0.5)',
    riverBand: 'rgba(0,0,0,0.16)',
    bevelLight: 'rgba(255,230,180,0.10)',
  },
  light: {
    wood: ['#dcb47c', '#c99a60', '#ad7d47'],
    grain: [96, 52, 20],
    grainAlpha: 0.075,
    knot: 'rgba(90,50,20,0.16)',
    vignette: 'rgba(70,35,10,0.32)',
    line: 'rgba(72,38,14,0.72)',
    frame: 'rgba(72,38,14,0.9)',
    river: 'rgba(72,38,14,0.55)',
    riverBand: 'rgba(255,240,210,0.14)',
    bevelLight: 'rgba(255,248,230,0.35)',
  },
}

/* ------------------------------ 棋子配色 ------------------------------ */
const PIECE_STYLE = {
  r: {
    body: ['#e5543c', '#b8281b', '#7a130c'],
    rim: ['#fbe6ac', '#c99a3e', '#8a6420', '#f3d184'],
    text: ['#fff1c9', '#f1cd7a', '#c99a3e'],
    particle: ['#e5543c', '#f3d184', '#ffb27a', '#b8281b'],
  },
  b: {
    body: ['#4a4b52', '#22232a', '#0b0b0f'],
    rim: ['#ffffff', '#b9bec6', '#6d727a', '#e8ebef'],
    text: ['#ffffff', '#dfe3e8', '#9aa0a8'],
    particle: ['#2a2b31', '#dfe3e8', '#9aa0a8', '#ffffff'],
  },
}

const GOLD = '240,200,110'
const CHECK_RED = '255,70,60'

/* ------------------------------ 工具函数 ------------------------------ */
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** 椭圆路径：部分环境下 canvas 2d 未实现 ellipse()，回退为「缩放 + 圆弧」 */
function ellipsePath(g, x, y, rx, ry) {
  if (typeof g.ellipse === 'function') {
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    return
  }
  const safeRy = Math.max(ry, 0.001)
  g.save()
  g.translate(x, y)
  g.scale(rx / safeRy, 1)
  g.arc(0, 0, safeRy, 0, Math.PI * 2)
  g.restore()
}

/**
 * 运行时探测离屏画布是否可用。
 * 仅靠 try/catch 不够：某些环境下 drawImage(离屏画布) 会**静默失效**（不抛错但画不上去），
 * 因此这里做「画红块 → drawImage 到主画布 → getImageData 回读」的真实像素校验。
 * @returns {boolean} true 表示可安全使用离屏画布缓存与棋子精灵图
 */
function canUseOffscreenCanvas(factory, ctx) {
  if (typeof factory !== 'function' || !ctx || typeof ctx.getImageData !== 'function') return false
  try {
    const c = factory(8, 8)
    if (!c) return false
    const g = c.getContext('2d')
    if (!g) return false
    g.fillStyle = '#ff0000'
    g.fillRect(0, 0, 8, 8)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, 8, 8)
    ctx.drawImage(c, 0, 0)
    const data = ctx.getImageData(0, 0, 1, 1).data
    ctx.clearRect(0, 0, 8, 8)
    ctx.restore()

    const ok = data[0] > 200 && data[1] < 80 && data[2] < 80 && data[3] > 200
    if (!ok) console.warn('[renderer] 离屏画布 drawImage 静默失效，改用直接绘制')
    return ok
  } catch (e) {
    console.warn('[renderer] 离屏画布不可用，改用直接绘制：', e && e.message ? e.message : e)
    return false
  }
}

/* ------------------------------ 布局计算 ------------------------------ */
const OUTER_PAD = 8
const MARGIN_RATIO = 0.62

/** 根据宽度计算 Canvas 高度，页面可据此设置 canvas 尺寸 */
function computeBoardHeight(width) {
  const cell = (width - OUTER_PAD * 2) / (8 + MARGIN_RATIO * 2)
  return Math.round(cell * (9 + MARGIN_RATIO * 2) + OUTER_PAD * 2)
}

/**
 * 创建渲染器
 */
function createRenderer(opts) {
  const { ctx, raf, caf } = opts
  // 离屏画布工厂可被运行时降级（见 degradeOffscreen），故用 let
  let createCanvas = opts.createCanvas
  let W = opts.width
  let H = opts.height
  let dpr = opts.dpr || 1
  let fontFamily = opts.fontFamily || '"STKaiti","KaiTi","Kaiti SC",serif'

  let cell = 0
  let R = 0
  let ox = 0
  let oy = 0
  function layout() {
    cell = (W - OUTER_PAD * 2) / (8 + MARGIN_RATIO * 2)
    R = cell * 0.445
    ox = OUTER_PAD + cell * MARGIN_RATIO
    oy = OUTER_PAD + cell * MARGIN_RATIO
  }
  layout()

  let state = {
    board: null,
    selected: null,
    moves: [],
    lastMove: null,
    checkSide: null,
    flipped: false,
    theme: 'dark',
  }

  let boardCache = null
  let boardCacheKey = ''
  const spriteCache = {}

  let moveAnim = null
  let landAnim = null
  let shakeAnim = null
  let particles = []
  let shockwaves = []
  let ghosts = []
  let rafId = null
  let lastTime = 0
  let destroyed = false

  function toScreen(r, c) {
    const vr = state.flipped ? ROWS - 1 - r : r
    const vc = state.flipped ? COLS - 1 - c : c
    return { x: ox + vc * cell, y: oy + vr * cell }
  }

  function hitTest(x, y) {
    let vc = Math.round((x - ox) / cell)
    let vr = Math.round((y - oy) / cell)
    if (vc < 0 || vc >= COLS || vr < 0 || vr >= ROWS) return null
    const cx = ox + vc * cell
    const cy = oy + vr * cell
    if (Math.hypot(x - cx, y - cy) > cell * 0.52) return null
    return state.flipped ? { r: ROWS - 1 - vr, c: COLS - 1 - vc } : { r: vr, c: vc }
  }

  /* ---------------------------- 棋盘绘制 ---------------------------- */
  function drawBoard(g) {
    const t = THEMES[state.theme] || THEMES.dark
    const x0 = OUTER_PAD
    const y0 = OUTER_PAD
    const bw = W - OUTER_PAD * 2
    const bh = H - OUTER_PAD * 2
    const radius = cell * 0.32

    g.save()
    roundRect(g, x0, y0, bw, bh, radius)
    g.clip()

    const base = g.createLinearGradient(x0, y0, x0 + bw * 0.3, y0 + bh)
    base.addColorStop(0, t.wood[0])
    base.addColorStop(0.55, t.wood[1])
    base.addColorStop(1, t.wood[2])
    g.fillStyle = base
    g.fillRect(x0, y0, bw, bh)

    const rand = mulberry32(20240607)
    const [gr, gg, gb] = t.grain
    for (let i = 0; i < 170; i++) {
      const baseY = y0 + rand() * bh
      const amp = 2 + rand() * 7
      const freq = 0.004 + rand() * 0.012
      const phase = rand() * Math.PI * 2
      const alpha = t.grainAlpha * (0.3 + rand() * 1.2)
      g.strokeStyle = `rgba(${gr},${gg},${gb},${alpha.toFixed(3)})`
      g.lineWidth = 0.4 + rand() * 1.2
      g.beginPath()
      for (let x = x0 - 10; x <= x0 + bw + 10; x += 8) {
        const y = baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.25
        if (x === x0 - 10) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    for (let k = 0; k < 3; k++) {
      const kx = x0 + rand() * bw
      const ky = y0 + rand() * bh
      for (let ring = 0; ring < 5; ring++) {
        g.strokeStyle = t.knot
        g.lineWidth = 0.6
        g.beginPath()
        ellipsePath(g, kx, ky, 6 + ring * 5, 2 + ring * 1.6)
        g.stroke()
      }
    }

    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(bw, bh) * 0.25, W / 2, H / 2, Math.max(bw, bh) * 0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, t.vignette)
    g.fillStyle = vg
    g.fillRect(x0, y0, bw, bh)

    const riverTop = oy + 4 * cell
    g.fillStyle = t.riverBand
    g.fillRect(ox, riverTop, 8 * cell, cell)
    g.restore()

    g.save()
    roundRect(g, x0 + 1, y0 + 1, bw - 2, bh - 2, radius)
    g.strokeStyle = t.bevelLight
    g.lineWidth = 1.5
    g.stroke()
    g.restore()

    const gap = cell * 0.16
    g.strokeStyle = t.frame
    g.lineWidth = 2.2
    g.strokeRect(ox - gap, oy - gap, 8 * cell + gap * 2, 9 * cell + gap * 2)

    g.strokeStyle = t.line
    g.lineWidth = 1.1
    g.beginPath()
    for (let r = 0; r < ROWS; r++) {
      g.moveTo(ox, oy + r * cell)
      g.lineTo(ox + 8 * cell, oy + r * cell)
    }
    for (let c = 0; c < COLS; c++) {
      const x = ox + c * cell
      if (c === 0 || c === COLS - 1) {
        g.moveTo(x, oy)
        g.lineTo(x, oy + 9 * cell)
      } else {
        g.moveTo(x, oy)
        g.lineTo(x, oy + 4 * cell)
        g.moveTo(x, oy + 5 * cell)
        g.lineTo(x, oy + 9 * cell)
      }
    }
    ;[0, 7].forEach((r0) => {
      g.moveTo(ox + 3 * cell, oy + r0 * cell)
      g.lineTo(ox + 5 * cell, oy + (r0 + 2) * cell)
      g.moveTo(ox + 5 * cell, oy + r0 * cell)
      g.lineTo(ox + 3 * cell, oy + (r0 + 2) * cell)
    })
    g.stroke()

    const marks = [[2, 1], [2, 7], [7, 1], [7, 7]]
    for (let c = 0; c <= 8; c += 2) marks.push([3, c], [6, c])
    const d = cell * 0.08
    const len = cell * 0.16
    g.lineWidth = 1.1
    g.beginPath()
    marks.forEach(([r, c]) => {
      const x = ox + c * cell
      const y = oy + r * cell
      ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) return
        g.moveTo(x + sx * d, y + sy * (d + len))
        g.lineTo(x + sx * d, y + sy * d)
        g.lineTo(x + sx * (d + len), y + sy * d)
      })
    })
    g.stroke()

    g.fillStyle = t.river
    g.font = `${Math.round(cell * 0.5)}px ${fontFamily}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const ry = oy + 4.5 * cell
    g.fillText('楚  河', ox + 2 * cell, ry)
    g.fillText('汉  界', ox + 6 * cell, ry)
  }

  function ensureBoardCache() {
    const key = `${state.theme}|${W}|${H}|${dpr}|${fontFamily}`
    if (boardCache && boardCacheKey === key) return
    boardCacheKey = key
    if (!createCanvas) {
      boardCache = null
      return
    }
    const c = createCanvas(Math.round(W * dpr), Math.round(H * dpr))
    const g = c.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBoard(g)
    boardCache = c
  }

  /* ---------------------------- 棋子绘制 ---------------------------- */
  function drawPieceTo(g, piece, x, y, rad) {
    const isBack = piece[1] === '_'
    const st = PIECE_STYLE[piece[0]]

    // 投影
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.55)'
    g.shadowBlur = rad * 0.4
    g.shadowOffsetY = rad * 0.2
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fillStyle = st.body[2]
    g.fill()
    g.restore()

    // 主体
    const body = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad)
    body.addColorStop(0, st.body[0])
    body.addColorStop(0.6, st.body[1])
    body.addColorStop(1, st.body[2])
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fillStyle = body
    g.fill()

    // 金属外圈
    const rim = g.createLinearGradient(x - rad, y - rad, x + rad, y + rad)
    rim.addColorStop(0, st.rim[0])
    rim.addColorStop(0.35, st.rim[1])
    rim.addColorStop(0.7, st.rim[2])
    rim.addColorStop(1, st.rim[3])
    g.lineWidth = rad * 0.1
    g.strokeStyle = rim
    g.beginPath()
    g.arc(x, y, rad - rad * 0.05, 0, Math.PI * 2)
    g.stroke()

    if (isBack) {
      // 暗棋背面：内圈刻槽 + 中心纹样（无字）
      g.lineWidth = Math.max(1, rad * 0.04)
      g.strokeStyle = 'rgba(0,0,0,0.4)'
      g.beginPath()
      g.arc(x, y, rad * 0.74, 0, Math.PI * 2)
      g.stroke()
      // 中心小圆点（麻将背面感）
      g.fillStyle = rim
      g.globalAlpha = 0.85
      g.beginPath()
      g.arc(x, y - rad * 0.02, rad * 0.2, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 1
      // 顶部高光
      const gloss = g.createLinearGradient(x, y - rad, x, y + rad * 0.2)
      gloss.addColorStop(0, 'rgba(255,255,255,0.26)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gloss
      g.beginPath()
      ellipsePath(g, x, y - rad * 0.38, rad * 0.68, rad * 0.42)
      g.fill()
      return
    }

    // 内圈雕刻槽
    g.lineWidth = Math.max(1, rad * 0.035)
    g.strokeStyle = 'rgba(0,0,0,0.45)'
    g.beginPath()
    g.arc(x, y + 0.6, rad * 0.76, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = rim
    g.globalAlpha = 0.75
    g.beginPath()
    g.arc(x, y, rad * 0.76, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1

    // 顶部高光
    const gloss = g.createLinearGradient(x, y - rad, x, y + rad * 0.2)
    gloss.addColorStop(0, 'rgba(255,255,255,0.28)')
    gloss.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gloss
    g.beginPath()
    ellipsePath(g, x, y - rad * 0.38, rad * 0.68, rad * 0.42)
    g.fill()

    // 文字浮雕
    const text = PIECE_TEXT[piece]
    const fs = Math.round(rad * 1.08)
    g.font = `bold ${fs}px ${fontFamily}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const ty = y + rad * 0.04
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.fillText(text, x + 0.8, ty + 1.4)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillText(text, x - 0.5, ty - 0.7)
    const tg = g.createLinearGradient(x, y - rad * 0.5, x, y + rad * 0.5)
    tg.addColorStop(0, st.text[0])
    tg.addColorStop(0.5, st.text[1])
    tg.addColorStop(1, st.text[2])
    g.fillStyle = tg
    g.fillText(text, x, ty)
  }

  const SPRITE_PAD = 0.6
  function getSprite(piece) {
    if (!createCanvas) return null
    const key = `${piece}|${R}|${dpr}|${fontFamily}`
    if (spriteCache[piece] && spriteCache[piece].key === key) return spriteCache[piece]
    const size = R * 2 * (1 + SPRITE_PAD)
    const c = createCanvas(Math.ceil(size * dpr), Math.ceil(size * dpr))
    const g = c.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawPieceTo(g, piece, size / 2, size / 2, R)
    spriteCache[piece] = { key, canvas: c, size }
    return spriteCache[piece]
  }

  function drawPiece(piece, x, y, scale = 1, alpha = 1) {
    ctx.save()
    ctx.globalAlpha = alpha
    const sp = getSprite(piece)
    if (sp) {
      const s = sp.size * scale
      ctx.drawImage(sp.canvas, x - s / 2, y - s / 2, s, s)
    } else {
      ctx.translate(x, y)
      ctx.scale(scale, scale)
      drawPieceTo(ctx, piece, 0, 0, R)
    }
    ctx.restore()
  }

  /* ---------------------------- 高亮效果 ---------------------------- */
  function drawSelectGlow(x, y, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 260)
    const glow = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * (1.55 + pulse * 0.15))
    glow.addColorStop(0, `rgba(${GOLD},${0.55 + pulse * 0.2})`)
    glow.addColorStop(1, `rgba(${GOLD},0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, R * 1.8, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(${GOLD},${0.6 + pulse * 0.35})`
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(x, y + 2, R * 1.14, 0, Math.PI * 2)
    ctx.stroke()
  }

  function drawMoveHints(t) {
    const breathe = 0.5 + 0.5 * Math.sin(t / 300)
    state.moves.forEach((m, i) => {
      const { x, y } = toScreen(m.tr, m.tc)
      const target = state.board[m.tr][m.tc]
      const local = 0.5 + 0.5 * Math.sin(t / 300 - i * 0.35)
      if (!target) {
        const rr = cell * (0.1 + local * 0.035)
        const halo = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.6)
        halo.addColorStop(0, `rgba(${GOLD},${0.35 + local * 0.2})`)
        halo.addColorStop(1, `rgba(${GOLD},0)`)
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(x, y, rr * 2.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(${GOLD},${0.7 + local * 0.25})`
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.lineWidth = 2
        ctx.strokeStyle = `rgba(${CHECK_RED},${0.55 + breathe * 0.4})`
        ctx.beginPath()
        ctx.arc(x, y, R * (1.1 + breathe * 0.06), 0, Math.PI * 2)
        ctx.stroke()
        drawCorners(x, y, R * 1.25, `rgba(${GOLD},0.95)`)
      }
    })
  }

  function drawCorners(x, y, half, color) {
    const l = half * 0.42
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.moveTo(x + sx * half, y + sy * (half - l))
      ctx.lineTo(x + sx * half, y + sy * half)
      ctx.lineTo(x + sx * (half - l), y + sy * half)
    })
    ctx.stroke()
  }

  function drawLastMove() {
    const m = state.lastMove
    if (!m) return
    const a = toScreen(m.fr, m.fc)
    ctx.strokeStyle = `rgba(${GOLD},0.45)`
    ctx.lineWidth = 1.4
    if (ctx.setLineDash) ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.arc(a.x, a.y, R * 0.55, 0, Math.PI * 2)
    ctx.stroke()
    if (ctx.setLineDash) ctx.setLineDash([])
    const b = toScreen(m.tr, m.tc)
    drawCorners(b.x, b.y, R * 1.16, `rgba(${GOLD},0.7)`)
  }

  function drawCheckGlow(t) {
    if (!state.checkSide || !state.board) return
    const k = findKing(state.board, state.checkSide)
    if (!k) return
    const { x, y } = toScreen(k.r, k.c)
    const pulse = 0.5 + 0.5 * Math.sin(t / 140)
    const g = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * (2 + pulse * 0.4))
    g.addColorStop(0, `rgba(${CHECK_RED},${0.65 + pulse * 0.3})`)
    g.addColorStop(1, `rgba(${CHECK_RED},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, R * 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  /* ---------------------------- 粒子系统 ---------------------------- */
  function spawnParticles(x, y, colors, count, squareRate) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 170
      particles.push({
        x: x + Math.cos(ang) * R * 0.4,
        y: y + Math.sin(ang) * R * 0.4,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 40,
        life: 0,
        max: 0.5 + Math.random() * 0.6,
        size: 1.2 + Math.random() * 3.2,
        color: colors[i % colors.length],
        square: Math.random() < squareRate,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
      })
    }
  }

  function spawnCaptureParticles(x, y, piece) {
    spawnParticles(x, y, PIECE_STYLE[piece[0]].particle, 46, 0.45)
    shockwaves.push({ x, y, start: Date.now(), dur: 520, color: piece[0] === 'r' ? GOLD : '220,225,232' })
    ghosts.push({ x, y, piece, start: Date.now(), dur: 380 })
  }

  /** 翻面金光：暗→明瞬间迸发 */
  function spawnRevealParticles(x, y) {
    spawnParticles(x, y, [GOLD, '255,235,170', '255,255,255', '200,160,70'], 44, 0.28)
    shockwaves.push({ x, y, start: Date.now(), dur: 640, color: GOLD })
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life += dt
      if (p.life >= p.max) return false
      p.vx *= 0.96
      p.vy = p.vy * 0.96 + 260 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      return true
    })
  }

  function drawParticles(now) {
    ghosts = ghosts.filter((g) => {
      const p = (now - g.start) / g.dur
      if (p >= 1) return false
      drawPiece(g.piece, g.x, g.y, 1 + p * 0.35, 1 - easeOutCubic(p))
      return true
    })
    shockwaves = shockwaves.filter((s) => {
      const p = (now - s.start) / s.dur
      if (p >= 1) return false
      ctx.strokeStyle = `rgba(${s.color},${(1 - p) * 0.8})`
      ctx.lineWidth = 2.5 * (1 - p) + 0.5
      ctx.beginPath()
      ctx.arc(s.x, s.y, R * (0.9 + easeOutCubic(p) * 1.4), 0, Math.PI * 2)
      ctx.stroke()
      return true
    })
    particles.forEach((p) => {
      const k = 1 - p.life / p.max
      ctx.globalAlpha = k
      ctx.fillStyle = p.color
      if (p.square) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }
    })
    ctx.globalAlpha = 1
  }

  /* ---------------------------- 主渲染 ---------------------------- */
  /** 降级：停用离屏画布缓存，改为在画布上直接绘制（保证内容可见） */
  let renderErrorLogged = false
  function degradeOffscreen() {
    if (!createCanvas) return false
    createCanvas = null
    boardCache = null
    boardCacheKey = ''
    Object.keys(spriteCache).forEach((k) => {
      delete spriteCache[k]
    })
    console.warn('[renderer] 已停用离屏画布缓存，改为直接绘制')
    return true
  }

  function render() {
    try {
      renderFrame()
    } catch (e) {
      if (!renderErrorLogged) {
        renderErrorLogged = true
        console.error('[renderer] 渲染异常：', e)
      }
      // 首帧异常时自愈：禁用离屏路径后重绘一次
      if (degradeOffscreen()) invalidate()
    }
  }

  function renderFrame() {
    const now = Date.now()
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016
    lastTime = now

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    let sx = 0
    let sy = 0
    if (shakeAnim) {
      const p = (now - shakeAnim.start) / shakeAnim.dur
      if (p >= 1) shakeAnim = null
      else {
        const amp = shakeAnim.amp * (1 - p)
        sx = Math.sin(p * Math.PI * 14) * amp
        sy = Math.cos(p * Math.PI * 11) * amp * 0.4
      }
    }
    ctx.save()
    ctx.translate(sx, sy)

    ensureBoardCache()
    if (boardCache) ctx.drawImage(boardCache, 0, 0, W, H)
    else drawBoard(ctx)

    if (!state.board) {
      ctx.restore()
      return
    }

    drawLastMove()
    drawCheckGlow(now)
    drawMoveHints(now)

    let movingPos = null
    let movingScale = 1
    if (moveAnim) {
      const p = clamp01((now - moveAnim.start) / moveAnim.dur)
      const a = toScreen(moveAnim.move.fr, moveAnim.move.fc)
      const b = toScreen(moveAnim.move.tr, moveAnim.move.tc)
      const e = easeInOutCubic(p)
      movingPos = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(p * Math.PI) * cell * 0.18 }
      movingScale = 1.08 + Math.sin(p * Math.PI) * 0.06
      if (p >= 1) {
        const m = moveAnim
        moveAnim = null
        movingPos = null
        landAnim = { r: m.move.tr, c: m.move.tc, start: now, dur: 300 }
        if (m.captured) spawnCaptureParticles(b.x, b.y, m.captured)
        if (m.onLand) m.onLand()
      }
    }

    const sel = state.selected
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = state.board[r][c]
        if (!piece) continue
        const { x, y } = toScreen(r, c)
        if (moveAnim && r === moveAnim.move.tr && c === moveAnim.move.tc) {
          if (moveAnim.captured) drawPiece(moveAnim.captured, x, y)
          continue
        }
        if (sel && sel.r === r && sel.c === c) {
          drawSelectGlow(x, y, now)
          drawPiece(piece, x, y - 2, 1.08)
          continue
        }
        let scale = 1
        if (landAnim && landAnim.r === r && landAnim.c === c) {
          const p = (now - landAnim.start) / landAnim.dur
          if (p >= 1) landAnim = null
          else scale = 1 + 0.08 * (1 - p) * Math.cos(p * Math.PI * 2.5)
        }
        drawPiece(piece, x, y, scale)
      }
    }

    if (movingPos && moveAnim) drawPiece(moveAnim.piece, movingPos.x, movingPos.y, movingScale)

    updateParticles(dt)
    drawParticles(now)

    ctx.restore()
  }

  function isAnimating() {
    return !!(
      moveAnim || landAnim || shakeAnim || particles.length || shockwaves.length || ghosts.length ||
      state.selected || state.checkSide
    )
  }

  function loop() {
    if (destroyed) return
    rafId = null
    render()
    if (isAnimating()) {
      try {
        rafId = raf(loop)
      } catch (e) {
        rafId = null
      }
    } else lastTime = 0
  }

  // 关键：setState 后**同步**绘制一帧，不依赖 rAF 是否被正确触发
  // （个别环境 rAF 不回调会导致整块画布空白；动画续帧仍交给 rAF）
  function invalidate() {
    if (destroyed) return
    if (rafId == null) loop()
  }

  return {
    hitTest,
    setState(patch) {
      state = Object.assign({}, state, patch)
      invalidate()
    },
    animateMove(move, piece, captured, onLand) {
      moveAnim = { move, piece, captured, start: Date.now(), dur: 240, onLand }
      invalidate()
    },
    /** 翻面金光：在 (r,c) 处触发金光迸发 + 落子回弹 */
    revealPiece(r, c) {
      landAnim = { r, c, start: Date.now(), dur: 360 }
      const { x, y } = toScreen(r, c)
      spawnRevealParticles(x, y)
      invalidate()
    },
    shake(amp = 7, dur = 560) {
      shakeAnim = { start: Date.now(), dur, amp }
      invalidate()
    },
    setFont(family) {
      fontFamily = family
      invalidate()
    },
    resize(width, height, ratio) {
      W = width
      H = height
      dpr = ratio || dpr
      layout()
      invalidate()
    },
    destroy() {
      destroyed = true
      if (rafId != null && caf) caf(rafId)
    },
  }
}

module.exports = {
  createRenderer,
  computeBoardHeight,
  canUseOffscreenCanvas,
}
