/**
 * 阴阳象棋 · 主页面逻辑
 * ------------------------------------------------------------
 * 职责划分（表现层复用 v0zip 楚汉象棋，规则层沿用本项目盲棋逻辑）：
 *   utils/board.js       盲棋开局（洗牌 + 0/1 状态） —— 不变
 *   utils/RulesEngine.js  双维度走法校验（暗棋按棋位 / 明棋按真实身份） —— 不变
 *   utils/game.js        对局状态（翻面、回合、悔棋、胜负） —— 不变
 *   utils/renderer.js    Canvas 渲染与动画（改编自 v0zip，新增暗子背面+翻面金光）
 *   本文件              交互、动画编排、音频、计时、设置、UI 同步
 *
 * 高频对象（this.game / this.renderer）不放入 data，避免无意义 setData 开销。
 */

const { Game } = require('../../utils/game')
const { createRenderer, computeBoardHeight, canUseOffscreenCanvas } = require('../../utils/renderer')
const { chooseMove } = require('../../utils/ai')
const { encodePiece, charOf } = require('../../utils/pieces')
const audio = require('../../utils/audio')

// 人机模式下：玩家执红，电脑执黑
const AI_COLOR = 'black'

const app = getApp()
const BOARD_SIDE_MARGIN = 12

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    menuRight: 96, // 右上角按钮右边缘距屏幕右侧的距离（按微信胶囊位置动态计算）
    boardWidth: 351,
    boardHeight: 400,
    safeBottom: 12,

    theme: 'dark',

    // 棋局模式：blind = 阴阳象棋（洗牌 + 0/1 状态）；normal = 传统象棋（全明棋）
    // modeIcon 显示的是「点击后将要切换到的模式」图标：⬤ 太阳 → 传统象棋；⬤ 月亮 → 阴阳象棋
    mode: 'blind',
    modeIcon: 'sun',
    modeName: '阴阳象棋',

    // 对战模式：two = 双人对弈（默认，行为与现在完全一致）；one = 人机对战（你执红，电脑执黑）
    playerMode: 'two',
    playerModeLabel: '双人',
    playerModeText: '双人对战',
    // 人机模式下显示「当前该谁走」；双人模式为空（不显示）
    currentPlayerText: '',
    redName: '红方',
    blackName: '黑方',

    turn: 'red',
    turnText: '红方走棋',
    round: 1,
    redTime: '00:00',
    blackTime: '00:00',
    capturedByRed: [],
    capturedByBlack: [],
    tipText: '红方先行，点击棋子开始对弈',
    thinking: false,
    checkAnim: false,
    checkBannerText: '将 军',
    gameOver: false,
    winner: 'red',
    resultDesc: '',

    flipped: false,
    showMoves: true,
    vibrate: true,
    sfxOn: true,
    bgmOn: true,
    settingsVisible: false,
    settingsOpen: false,
    sheetAnimation: null,

  },

  /* ============================ 生命周期 ============================ */
  onLoad() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const statusBarHeight = win.statusBarHeight || 20
    const navHeight = menu ? (menu.top - statusBarHeight) * 2 + menu.height + statusBarHeight : statusBarHeight + 44
    // 右上角「双人/人机」按钮：按用户要求贴屏幕最右侧（注意：真机上该区域与微信系统胶囊重叠）
    const menuRight = 8
    const boardWidth = Math.min(win.windowWidth - BOARD_SIDE_MARGIN * 2, 520)
    const safeBottom = win.safeArea ? Math.max(12, win.screenHeight - win.safeArea.bottom) : 12

    this.game = new Game(this.data.mode) // 'blind' 阴阳象棋（默认）
    this.selected = null
    this.lastMove = null
    this.busy = false
    this.times = { r: 0, b: 0 }
    this.capturedLog = { r: [], b: [] }
    this.capId = 0
    this.bgmStarted = false
    this.lastWasFlip = false
    this.lastWasCapture = false
    // 定时器句柄：统一由 clearTimers() 清理，避免重置棋局 / 退出页面后回调仍然触发
    this.checkTimer = null
    this.overTimer = null
    this.aiTimer = null
    this.sheetTimer = null

    // 音效 / BGM 开关是模块级状态（utils/audio），离开页面再回来时不能想当然地当作「开」
    const audioState = audio.getState()
    this.setData({
      statusBarHeight,
      navHeight,
      menuRight,
      boardWidth,
      boardHeight: computeBoardHeight(boardWidth),
      safeBottom,
      theme: this.data.mode === 'blind' ? 'dark' : 'light', // 阴阳联动：暗棋(阴)=夜色，明棋(阳)=暖昼
      sfxOn: audioState.sfxOn,
      bgmOn: audioState.bgmOn,
    })
    this.applyBackground()
    this.syncUI()
  },

  onReady() {
    this.initCanvas()
    this.startTimer()
    // 进入页面即尝试播放背景音乐（少数机型需用户手势，onBoardTouch 会再兜底一次）
    this.tryStartBgm()
  },

  /** 启动 / 续播背景音乐（幂等，可重复调用） */
  tryStartBgm() {
    if (!audio.getState().bgmOn) return
    this.bgmStarted = true
    audio.startBgm()
  },

  onShow() {
    if (this.renderer && !this.timer) this.startTimer()
    // 从后台回到前台：继续播放背景音乐（实例存在则续播，不存在则重新起播）
    this.tryStartBgm()
  },

  onHide() {
    this.stopTimer()
    // 切到后台暂停 BGM，避免退出小程序后音乐仍在播放
    audio.pauseBgm()
  },

  onUnload() {
    this.clearTimers()
    this.stopTimer()
    audio.stopBgm()
    if (this.renderer) this.renderer.destroy()
  },

  /** 清理所有挂起定时器（将军提示 / 结算弹窗 / AI 思考 / 设置面板收起） */
  clearTimers() {
    clearTimeout(this.checkTimer)
    clearTimeout(this.overTimer)
    clearTimeout(this.aiTimer)
    clearTimeout(this.sheetTimer)
    this.checkTimer = null
    this.overTimer = null
    this.aiTimer = null
    this.sheetTimer = null
  },

  onShareAppMessage() {
    return {
      title: '阴阳象棋 · 中国象棋暗棋变体',
      path: '/pages/index/index',
    }
  },

  /* ============================ Canvas 初始化 ============================ */
  initCanvas(isRetry) {
    wx.createSelectorQuery()
      .in(this)
      .select('#board')
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node
        if (!node) {
          if (!isRetry) {
            console.warn('[board] 未取到 canvas 节点，150ms 后重试')
            setTimeout(() => this.initCanvas(true), 150)
            return
          }
          console.error('[board] 无法获取 canvas 节点，棋盘无法渲染')
          return
        }
        const ctx = node.getContext('2d')
        if (!ctx) {
          console.error('[board] getContext("2d") 返回空，棋盘无法渲染')
          return
        }
        const width = res[0].width || this.data.boardWidth
        const height = res[0].height || this.data.boardHeight
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const dpr = info.pixelRatio || 2
        node.width = Math.round(width * dpr)
        node.height = Math.round(height * dpr)

        // 离屏画布用于缓存棋盘与棋子精灵图，但个别环境 drawImage(离屏画布) 会失效，
        // 因此先做一次真实像素探测：不通过就退回「直接绘制」，保证画面一定可见。
        const factory = this.makeOffscreenFactory()
        const useOffscreen = canUseOffscreenCanvas(factory, ctx)
        console.log(
          '[board] canvas ' + width + 'x' + height + ' dpr=' + dpr +
          ' 离屏缓存=' + (useOffscreen ? '启用' : '停用（改直接绘制）')
        )

        this.renderer = createRenderer({
          ctx,
          width,
          height,
          dpr,
          fontFamily: app.globalData.fontFamily,
          createCanvas: useOffscreen ? factory : null,
          raf: (cb) => (node.requestAnimationFrame ? node.requestAnimationFrame(cb) : setTimeout(cb, 16)),
          caf: (id) => {
            if (node.cancelAnimationFrame) node.cancelAnimationFrame(id)
            else clearTimeout(id)
          },
        })
        this.syncRenderer()
        if (app.onFontReady) app.onFontReady((family) => this.renderer && this.renderer.setFont(family))
      })
  },

  /** 离屏画布工厂：基础库不支持时返回 null */
  makeOffscreenFactory() {
    if (typeof wx.createOffscreenCanvas !== 'function') return null
    return (w, h) =>
      wx.createOffscreenCanvas({
        type: '2d',
        width: Math.max(1, Math.round(w)),
        height: Math.max(1, Math.round(h)),
      })
  },

  /** 棋盘视图：转为渲染器使用的字符串棋盘（明子 rK / 暗子 r_） */
  viewBoard() {
    const b = this.game.board
    const vb = []
    for (let y = 0; y < 10; y++) {
      const row = []
      for (let x = 0; x < 9; x++) row.push(encodePiece(b[y][x]))
      vb.push(row)
    }
    return vb
  },

  checkSide() {
    if (!this.game || this.game.winner || !this.game.inCheck) return null
    return this.game.currentTurn === 'red' ? 'r' : 'b'
  },

  syncRenderer() {
    if (!this.renderer) return
    this.renderer.setState({
      board: this.viewBoard(),
      selected: this.game.selected ? { r: this.game.selected.y, c: this.game.selected.x } : null,
      moves: this.data.showMoves ? this.game.legalTargets.map((t) => ({ tr: t.y, tc: t.x })) : [],
      lastMove: this.lastMove,
      checkSide: this.checkSide(),
      flipped: this.data.flipped,
      theme: this.data.theme,
    })
  },

  syncUI(extra) {
    const g = this.game
    const isBlind = this.data.mode !== 'normal'
    const single = this.data.playerMode === 'one'
    const redName = single ? '你' : '红方'
    const blackName = single ? '电脑' : '黑方'
    const sideName = (c) => (single ? (c === 'red' ? '你' : '电脑') : c === 'red' ? '红方' : '黑方')
    const firstTip = isBlind ? '红方先行，点击暗棋即翻面' : '红方先行，点击棋子开始对弈'
    let tipText
    if (g.winner) tipText = sideName(g.winner) + '胜'
    else if (this.data.thinking) tipText = '电脑思考中…'
    else if (this.checkSide()) tipText = sideName(g.currentTurn) + '被将军，请应将'
    else tipText = g.moveCount ? '轮到' + sideName(g.currentTurn) + '走棋' : firstTip

    // 人机模式：明确点出「当前该谁走」；双人模式保持原样（不显示）
    let currentPlayerText = ''
    if (single && !g.winner) {
      currentPlayerText = '当前行棋：' + (g.currentTurn === 'red' ? '你（红）' : '电脑（黑）')
    }

    const capturedByRed = this.capturedLog.r.map((m) => ({ id: m.id, text: m.text, side: m.side }))
    const capturedByBlack = this.capturedLog.b.map((m) => ({ id: m.id, text: m.text, side: m.side }))

    this.setData(
      Object.assign(
        {
          turn: g.currentTurn,
          turnText: g.currentTurn === 'red' ? (single ? '你走棋' : '红方走棋') : (single ? '电脑走棋' : '黑方走棋'),
          round: Math.floor(g.moveCount / 2) + 1,
          capturedByRed,
          capturedByBlack,
          redName,
          blackName,
          tipText,
          currentPlayerText,
          playerModeText: single ? '单人模式' : '双人对战',
        },
        extra || {}
      )
    )
  },

  /* ============================ 计时器 ============================ */
  startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => {
      if (this.game.winner || !this.game.moveCount) return
      const side = this.game.currentTurn === 'red' ? 'r' : 'b'
      this.times[side] += 1
      const fmt = (s) => (Math.floor(s / 60) < 10 ? '0' : '') + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60)
      this.setData({ [side === 'r' ? 'redTime' : 'blackTime']: fmt(this.times[side]) })
    }, 1000)
  },

  stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  /* ============================ 棋盘交互 ============================ */
  onBoardTouch(e) {
    if (!this.renderer) {
      // 极端情况下首次初始化失败，这里再补一次
      this.initCanvas(true)
      return
    }
    if (this.busy || this.game.winner) return
    // 人机模式：电脑回合不接受落子（等待 AI 应招）
    if (this.data.playerMode === 'one' && this.game.currentTurn === AI_COLOR) return
    this.tryStartBgm()

    const t = e.touches[0]
    const pos = this.renderer.hitTest(t.x, t.y)
    if (!pos) return
    const px = pos.c // 列
    const py = pos.r // 行

    const sel = this.game.selected
    const isMove = sel && this.game.legalTargets.some((tt) => tt.x === px && tt.y === py)

    if (isMove) {
      this.performMove({ x: sel.x, y: sel.y }, { x: px, y: py })
      return
    }

    // 再次点击已选中的棋子 → 取消选中
    if (sel && sel.x === px && sel.y === py) {
      this.game.selected = null
      this.game.legalTargets = []
      audio.playClick()
      this.syncRenderer()
      return
    }

    // 否则：选中己方棋子 / 点空白或对方棋子取消
    this.game.handleClick({ x: px, y: py })
    audio.playClick()
    this.syncRenderer()
  },

  /**
   * 统一执行一步棋（玩家与电脑共用）：吃子记录 → 渲染动画 → 音效 → 落子后处理
   * @param {{x:number,y:number}} from 起点（x=列, y=行）
   * @param {{x:number,y:number}} to 终点
   */
  performMove(from, to) {
    const moving = this.game.board[from.y][from.x]
    const capturedPiece = this.game.board[to.y][to.x]
    const wasFlip = !!(moving && moving.state === 0)
    const wasCapture = !!capturedPiece
    const before = this.game.moveCount

    this.lastWasFlip = wasFlip
    this.lastWasCapture = wasCapture
    this.busy = true

    this.game.doMove(from, to)
    if (this.game.moveCount <= before) {
      // 走法不合法（理论不会发生），兜底解锁输入
      this.busy = false
      return
    }

    const move = { fr: from.y, fc: from.x, tr: to.y, tc: to.x }
    this.lastMove = move

    if (wasCapture) {
      const cap = capturedPiece
      const side = cap.color === 'red' ? 'r' : 'b'
      this.capturedLog[side].push({ id: this.capId++, text: charOf(cap.color, cap.realType), side })
    }
    const pieceStr = encodePiece(moving) // 翻面后 moving.state 已为 1，编码为明子
    const capStr = capturedPiece ? encodePiece(capturedPiece) : null

    if (this.renderer) {
      this.renderer.setState({ board: this.viewBoard(), selected: null, moves: [], lastMove: move })
      this.renderer.animateMove(move, pieceStr, capStr, () => this.afterLand())
    } else {
      // 渲染器未就绪（如 canvas 初始化失败）时跳过动画，直接进入落子后处理
      this.afterLand()
    }
    this.syncUI()
    // 行进音效即时反馈
    if (wasFlip) audio.playFlip()
    else audio.playMove()
  },

  afterLand() {
    this.busy = false
    const g = this.game
    this.syncRenderer()

    if (g.winner) {
      audio.playWin()
      if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
      this.overTimer = setTimeout(() => {
        this.setData({
          gameOver: true,
          winner: g.winner,
          resultDesc: g.message + ' · 共 ' + (Math.floor(g.moveCount / 2) + 1) + ' 回合',
        })
      }, 700)
      return
    }

    if (g.inCheck) {
      if (this.renderer) this.renderer.shake()
      audio.playCheck()
      this.haptic('heavy')
      this.playCheckBanner(g.currentTurn)
    } else if (this.lastWasCapture) {
      audio.playCapture()
      if (this.data.vibrate && wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
    }

    if (this.lastWasFlip && this.lastMove && this.renderer) {
      this.renderer.revealPiece(this.lastMove.tr, this.lastMove.tc)
    }

    // 人机模式：轮到电脑则自动应招
    this.maybeAiMove()
  },

  /** 人机模式：轮到电脑时延迟一步思考（期间显示「电脑思考中」并锁定输入） */
  maybeAiMove() {
    if (this.data.playerMode !== 'one' || this.game.winner) return
    if (this.game.currentTurn !== AI_COLOR) return
    this.setData({ thinking: true })
    this.busy = true
    // 延迟到落子动画与音效完全结束后再进入 AI 计算，避免搜索阻塞线程打断观感
    this.aiTimer = setTimeout(() => {
      try {
        this.aiMove()
      } catch (e) {
        console.error('[AI] 思考出错', e)
        this.busy = false
        this.setData({ thinking: false })
      }
    }, 320)
  },

  /** 电脑落子：AI 选步 → 走同一套 performMove 流程（动画 / 翻面 / 音效与玩家一致） */
  aiMove() {
    // 深度 4 + 550ms 时间预算：迭代加深保证有可行解即返回；预算收紧以减少搜索对主线程的阻塞（落子卡顿主因）
    const move = chooseMove(this.game.board, AI_COLOR, 4, {
      timeBudget: 550,
      nodeBudget: 60000,
      checkStreak: this.game.checkStreak, // 让 AI 也遵守「长将判负」
      prevMove: this.prevAiMove || null, // 避免原地来回挪子
    })
    this.setData({ thinking: false })
    if (!move) {
      this.busy = false
      return
    }
    this.prevAiMove = { from: { x: move.from.x, y: move.from.y }, to: { x: move.to.x, y: move.to.y } }
    this.performMove({ x: move.from.x, y: move.from.y }, { x: move.to.x, y: move.to.y })
  },

  playCheckBanner(side) {
    const who = this.data.playerMode === 'one'
      ? side === 'red' ? '你被将军' : '电脑被将军'
      : side === 'red' ? '红方被将军' : '黑方被将军'
    clearTimeout(this.checkTimer)
    this.setData({ checkAnim: false, checkBannerText: '将 军' }, () => {
      this.setData({ checkAnim: true, tipText: who + '，请应将' })
      wx.showToast({ title: who, icon: 'none', duration: 1400 })
      this.checkTimer = setTimeout(() => this.setData({ checkAnim: false }), 1400)
    })
  },

  haptic(type) {
    if (!this.data.vibrate || !wx.vibrateShort) return
    wx.vibrateShort({ type: type === 'heavy' ? 'heavy' : type })
  },

  /* ============================ 棋局模式（太阳 / 月亮） ============================ */
  /**
   * 左上角图标：
   *   太阳图标 → 切换到「传统象棋」（全部明棋、传统规则）
   *   月亮图标 → 切换到「阴阳象棋」（暗棋：开局洗牌、走动翻面）
   * 切换只影响开局构造：盲棋开局仍走 createInitialBoard()，逻辑未做任何改动。
   */
  onToggleMode() {
    if (this.busy) return
    const next = this.data.mode === 'blind' ? 'normal' : 'blind'
    const isBlind = next === 'blind'
    const apply = () => {
      // 切模式等于重置棋局：先清掉旧局挂起的 AI 应招 / 结算弹窗，并解除输入锁
      this.clearTimers()
      this.busy = false
      this.game.setMode(next) // 按新模式重置开局
      this.selected = null
      this.lastMove = null
      this.times = { r: 0, b: 0 }
      this.capturedLog = { r: [], b: [] }
      this.capId = 0
      // 风格联动：暗棋（阴）→ 夜色主题；明棋（阳）→ 暖昼主题
      this.setTheme(isBlind ? 'dark' : 'light')
      this.setData(
        {
          mode: next,
          modeIcon: isBlind ? 'sun' : 'moon', // 图标指向「将要切换到的模式」
          modeName: isBlind ? '阴阳象棋' : '传统象棋',
          flipped: false,
          gameOver: false,
          checkAnim: false,
          thinking: false,
        },
        () => {
          this.syncRenderer()
          this.syncUI({ gameOver: false, checkAnim: false, redTime: '00:00', blackTime: '00:00' })
        }
      )
      wx.showToast({ title: isBlind ? '已切到阴阳象棋' : '已切到传统象棋', icon: 'none' })
      this.haptic('light')
    }

    // 每次点击都提醒：切换会重置当前棋局
    wx.showModal({
      title: '切换棋局模式',
      content: isBlind ? '切换为阴阳象棋（暗棋），当前棋局将重置，确定吗？' : '切换为传统象棋（明棋），当前棋局将重置，确定吗？',
      confirmColor: '#c8372d',
      success: (r) => r.confirm && apply(),
    })
  },

  /* ============================ 对战模式（切换入口在「设置」面板内） ============================ */
  /**
   * 切换对战模式：
   *   two = 双人对弈（默认，与本来的行为完全一致，红黑都由人操作）
   *   one = 人机对战（你执红先行，电脑执黑自动应招；电脑同样遵守盲棋规则且不窥视暗子身份）
   * 切换不影响棋局模式（盲棋 / 明棋）与盲棋开局构造。
   */
  onTogglePlayerMode() {
    if (this.busy) return
    const next = this.data.playerMode === 'one' ? 'two' : 'one'
    const single = next === 'one'
    // 每次点击都提醒：切换对战模式会重置当前棋局
    wx.showModal({
      title: '切换对战模式',
      content: single ? '切换为人机对战（你执红，电脑执黑），当前棋局将重置，确定吗？' : '切换为双人对弈，当前棋局将重置，确定吗？',
      confirmColor: '#c8372d',
      success: (r) => {
        if (!r.confirm) return
        this.clearTimers()
        this.busy = false
        this.setData(
          {
            playerMode: next,
            playerModeLabel: single ? '人机' : '双人',
            playerModeText: single ? '单人模式' : '双人对战',
            thinking: false,
          },
          () => {
            this.restart() // 重置棋局并同步 UI
            this.maybeAiMove()
          }
        )
        wx.showToast({ title: single ? '人机对战：你执红，电脑执黑' : '已切换为双人对弈', icon: 'none' })
        this.haptic('light')
      },
    })
  },

  /* ============================ 底部操作 ============================ */
  onUndo() {
    if (this.busy) return
    if (!this.game.history.length) {
      wx.showToast({ title: '尚未落子', icon: 'none' })
      return
    }
    this.game.undo()
    // 人机模式：再退一步，让回合回到玩家（一次完整的「玩家 + 电脑」回合）
    if (this.data.playerMode === 'one' && !this.game.winner && this.game.currentTurn === AI_COLOR && this.game.history.length) {
      this.game.undo()
    }
    this.trimCaptured()
    this.lastMove = null
    this.syncRenderer()
    this.syncUI({ gameOver: false, checkAnim: false })
    this.maybeAiMove()
    this.haptic('light')
  },

  trimCaptured() {
    const total = this.game.moveCount
    let rN = 0
    let bN = 0
    for (let i = 0; i < total; i++) {
      const m = this.game.moves[i]
      if (m && m.captured) {
        if (m.side === '红') bN++
        else rN++
      }
    }
    this.capturedLog.r = this.capturedLog.r.slice(0, rN)
    this.capturedLog.b = this.capturedLog.b.slice(0, bN)
  },

  onToggleSfx() {
    const on = audio.toggleSfx()
    this.setData({ sfxOn: on })
    if (on) audio.playClick()
  },

  onNewGame() {
    if (this.busy) return
    if (!this.game.history.length) {
      this.restart()
      return
    }
    wx.showModal({
      title: '开始新局',
      content: '当前对局将不会保存，确定重新开始吗？',
      confirmColor: '#c8372d',
      success: (res) => res.confirm && this.restart(),
    })
  },

  restart() {
    // 清掉挂起的结算弹窗 / AI 应招，避免旧局回调落到新局上
    this.clearTimers()
    this.busy = false
    this.game.reset()
    this.selected = null
    this.lastMove = null
    this.lastWasFlip = false
    this.lastWasCapture = false
    this.times = { r: 0, b: 0 }
    this.capturedLog = { r: [], b: [] }
    this.capId = 0
    this.syncRenderer()
    this.syncUI({ gameOver: false, checkAnim: false, thinking: false, redTime: '00:00', blackTime: '00:00' })
  },

  onReview() {
    this.setData({ gameOver: false }, () => this.syncRenderer())
  },

  /* ============================ 设置 ============================ */
  onOpenSettings() {
    const anim = wx.createAnimation({ duration: 0 })
    anim.translateY('100%').step()
    this.setData({ settingsVisible: true, sheetAnimation: anim.export() }, () => {
      const open = wx.createAnimation({ duration: 320, timingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' })
      open.translateY(0).step()
      this.setData({ settingsOpen: true, sheetAnimation: open.export() })
    })
  },

  onCloseSettings() {
    const close = wx.createAnimation({ duration: 240, timingFunction: 'ease-in' })
    close.translateY('100%').step()
    this.setData({ settingsOpen: false, sheetAnimation: close.export() })
    this.sheetTimer = setTimeout(() => {
      this.setData({ settingsVisible: false }, () => {
        // 棋盘在设置打开期间被隐藏（原生 canvas 层级高于普通元素），恢复后重绘一次
        this.syncRenderer()
      })
    }, 240)
  },

  noop() {},

  /** 主题切换（棋局模式联动调用：暗棋=夜色，明棋=暖昼） */
  setTheme(theme) {
    this.setData({ theme }, () => {
      this.applyBackground()
      this.syncRenderer()
    })
  },

  applyBackground() {
    const dark = this.data.theme === 'dark'
    if (wx.setBackgroundColor) wx.setBackgroundColor({ backgroundColor: dark ? '#0f0b08' : '#efe5d3' })
  },

  onFlip() {
    this.setData({ flipped: !this.data.flipped }, () => this.syncRenderer())
    this.haptic('light')
  },

  onSwitchShowMoves(e) {
    this.setData({ showMoves: e.detail.value }, () => this.syncRenderer())
  },

  onSwitchVibrate(e) {
    this.setData({ vibrate: e.detail.value })
  },

  onSwitchBgm(e) {
    const on = audio.setBgm(e.detail.value)
    if (on) this.bgmStarted = true // 用户主动开启过，之后 onShow 才有权自动恢复播放
    this.setData({ bgmOn: on })
  },

})
