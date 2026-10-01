/**
 * 小程序入口
 * - 读取系统主题，作为暗黑模式的初始值
 * - 加载书法字体（失败时自动回退到系统楷体）
 */
App({
  globalData: {
    theme: 'dark',
    fontFamily: '"STKaiti","KaiTi","Kaiti SC",serif',
    fontReadyCallbacks: [],
  },

  onLaunch() {
    try {
      const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
      if (info.theme) this.globalData.theme = info.theme
    } catch (e) {
      /* 忽略：保持默认暗色 */
    }
    this.loadBrushFont()
  },

  loadBrushFont() {
    // 基础库不支持 loadFontFace：直接用系统楷体，并立即放行已注册的回调
    if (!wx.loadFontFace) {
      this.flushFontCallbacks()
      return
    }
    wx.loadFontFace({
      global: true,
      family: 'XQBrush',
      source: 'url("https://fonts.gstatic.com/s/mashanzheng/v14/NaPecZTRCLxvwo41b4gvzkXaRMTsDIRSfr0.ttf")',
      scopes: ['webview', 'native'],
      success: () => {
        this.globalData.fontFamily = '"XQBrush","STKaiti","KaiTi",serif'
        this.flushFontCallbacks()
      },
      fail: () => {
        /* 字体加载失败：继续使用系统楷体，不影响游戏；同样放行回调，避免永久滞留 */
        this.flushFontCallbacks()
      },
    })
  },

  /** 一次性触发并清空所有等待字体的回调（成功 / 失败都调用，回调参数恒为当前 fontFamily） */
  flushFontCallbacks() {
    const callbacks = this.globalData.fontReadyCallbacks
    this.globalData.fontReadyCallbacks = []
    callbacks.forEach((cb) => cb(this.globalData.fontFamily))
  },

  onFontReady(cb) {
    if (this.globalData.fontFamily.indexOf('XQBrush') > -1) {
      cb(this.globalData.fontFamily)
    } else {
      this.globalData.fontReadyCallbacks.push(cb)
    }
  },
})
