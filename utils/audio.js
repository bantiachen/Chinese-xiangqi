// ===== 阴阳象棋 · 小程序音效与背景音乐 =====
// 音效资源借鉴参考工程 Chinese_Chess_miniprogram 的 sounds/（.wav），置于本工程 /audio 目录。
// 小程序不支持 WebAudio，统一使用 wx.createInnerAudioContext 播放本地音频。
// 缺失文件时自动降级为震动反馈，保证逻辑不报错。

let bgmAudio = null
let bgmOn = true
let sfxOn = true
const cache = {} // 复用 InnerAudioContext，避免频繁创建

// 文件名映射（翻面复用轻击声，无专属文件）
const FILE = {
  click: 'audio/click.wav',
  move: 'audio/move.wav',
  flip: 'audio/click.wav',
  capture: 'audio/capture.wav',
  check: 'audio/check.wav',
  win: 'audio/win.wav',
  newgame: 'audio/newgame.wav',
  illegal: 'audio/illegal.wav'
}

function getCtx(name) {
  if (!cache[name]) {
    const a = wx.createInnerAudioContext()
    a.src = FILE[name]
    a.onError(function () {})
    cache[name] = a
  }
  return cache[name]
}

/**
 * 复位到起点后播放。
 * 用 seek(0) 而非 stop()：stop() 之后立刻 play() 在部分机型会掉音（首帧未解码）。
 * 个别环境未实现 seek，则退回 stop() 复位。
 */
function rewind(a) {
  try {
    if (a.seek) a.seek(0)
    else a.stop()
  } catch (e) {
    try {
      a.stop()
    } catch (e2) {}
  }
}

function play(name, vibrate) {
  if (!sfxOn) return
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return
  try {
    const a = getCtx(name)
    rewind(a) // 避免快速连点时音效叠加
    a.play()
  } catch (e) {}
  if (vibrate && wx.vibrateShort) {
    try {
      wx.vibrateShort({ type: 'light' })
    } catch (e) {}
  }
}

function playClick() {
  play('click', true)
}
function playMove() {
  play('move', true)
}
function playFlip() {
  play('flip', true)
}
function playCapture() {
  play('capture', false)
}
function playCheck() {
  play('check', false)
}
function playWin() {
  play('win', false)
  if (wx.vibrateShort) {
    try {
      wx.vibrateShort({ type: 'medium' })
    } catch (e) {}
  }
}
function playNewGame() {
  play('newgame', false)
}
function playIllegal() {
  play('illegal', false)
}

/**
 * 背景音乐：bgm.mp3 需自备（古典），缺失则静默降级。
 * 「一直循环播放」靠三重保障：
 *   1) loop = true（首选）
 *   2) onEnded 兜底：个别机型 / 音频格式下 loop 不生效，播完自动从头再播
 *   3) startBgm 幂等：已创建实例时直接 play()，可安全地在 onShow / 首次触摸时重复调用
 * @returns {boolean} 是否已发起播放
 */
function startBgm() {
  if (!bgmOn) return false
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return false
  // 已存在实例：续播即可（幂等，重复调用不会创建第二个实例）
  if (bgmAudio) {
    try {
      bgmAudio.play()
    } catch (e) {}
    return true
  }
  try {
    bgmAudio = wx.createInnerAudioContext()
    bgmAudio.src = 'audio/bgm.mp3'
    bgmAudio.loop = true
    bgmAudio.autoplay = true
    bgmAudio.obeyMuteSwitch = false // 手机静音键不影响背景音乐（如需遵循静音键改为 true）
    bgmAudio.onError(function () {})
    bgmAudio.onEnded(function () {
      // loop 失效时的兜底：回到起点继续播，保证「一直播放」
      try {
        bgmAudio.seek(0)
        bgmAudio.play()
      } catch (e) {}
    })
    bgmAudio.play()
    return true
  } catch (e) {
    bgmAudio = null
    return false
  }
}

function stopBgm() {
  if (bgmAudio) {
    try {
      bgmAudio.stop()
      bgmAudio.destroy()
    } catch (e) {}
    bgmAudio = null
  }
}

/** 切后台时暂停（保留播放进度，不销毁实例） */
function pauseBgm() {
  if (bgmAudio) {
    try {
      bgmAudio.pause()
    } catch (e) {}
  }
}

/** 回前台时恢复（仅在用户仍开启 BGM 且实例存在时） */
function resumeBgm() {
  if (bgmOn && bgmAudio) {
    try {
      bgmAudio.play()
    } catch (e) {}
  }
}

/** 显式设置 BGM 开关（供 switch 的 e.detail.value 使用，避免 toggle 造成状态错位） */
function setBgm(on) {
  on = !!on
  if (on === bgmOn) return bgmOn
  bgmOn = on
  if (bgmOn) {
    if (bgmAudio) resumeBgm()
    else startBgm()
  } else {
    stopBgm()
  }
  return bgmOn
}

/** 显式设置音效开关 */
function setSfx(on) {
  sfxOn = !!on
  return sfxOn
}

function toggleBgm() {
  return setBgm(!bgmOn)
}

function toggleSfx() {
  return setSfx(!sfxOn)
}

/** 当前开关状态：页面 onLoad 时据此初始化 UI，避免「界面显示开、实际是关」 */
function getState() {
  return { sfxOn: sfxOn, bgmOn: bgmOn }
}

module.exports = {
  playClick: playClick,
  playMove: playMove,
  playFlip: playFlip,
  playCapture: playCapture,
  playCheck: playCheck,
  playWin: playWin,
  playNewGame: playNewGame,
  playIllegal: playIllegal,
  startBgm: startBgm,
  stopBgm: stopBgm,
  pauseBgm: pauseBgm,
  resumeBgm: resumeBgm,
  setBgm: setBgm,
  setSfx: setSfx,
  toggleBgm: toggleBgm,
  toggleSfx: toggleSfx,
  getState: getState
}
