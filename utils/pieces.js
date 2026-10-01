// ===== 阴阳象棋 · 棋子文字与渲染编码的唯一真源 =====
// 收敛原先散落在三处的重复映射（index.js 的 CHAR/TYPE_CODE、game.js 的 LABEL、
// renderer.js 的 PIECE_TEXT），避免「改一个字要改三个文件」的维护陷阱。
//
// 编码约定（viewBoard / renderer 共用）：
//   明子：'rK' / 'bC' ...   ← 颜色首字母 + 类型码
//   暗子：'r_' / 'b_'       ← 颜色首字母 + 下划线（背面，无字）

/** 真实身份 → 中文名（按颜色区分正/繁体写法） */
const CHAR = {
  red: { jiang: '帅', che: '车', ma: '马', xiang: '相', shi: '仕', pao: '炮', bing: '兵' },
  black: { jiang: '将', che: '車', ma: '馬', xiang: '象', shi: '士', pao: '砲', bing: '卒' },
}

/** 真实身份 → 渲染类型码（帅→K / 车→R / 马→N / 相→B / 仕→A / 炮→C / 兵→P） */
const TYPE_CODE = { jiang: 'K', che: 'R', ma: 'N', xiang: 'B', shi: 'A', pao: 'C', bing: 'P' }

/** 未知类型时的兜底编码（与「兵」同码，保证不会渲染成空白） */
const FALLBACK_TYPE = 'P'

/** 渲染编码 → 显示文字（由 CHAR + TYPE_CODE 派生，含暗子背面空串） */
const PIECE_TEXT = { r_: '', b_: '' }
Object.keys(TYPE_CODE).forEach(function (realType) {
  const code = TYPE_CODE[realType]
  PIECE_TEXT['r' + code] = CHAR.red[realType]
  PIECE_TEXT['b' + code] = CHAR.black[realType]
})

/** 取棋子中文名（棋谱文本等场景使用） */
function charOf(color, realType) {
  return (CHAR[color] && CHAR[color][realType]) || ''
}

/**
 * 棋子对象 → 渲染编码
 * @param {{color:string,state:number,realType:string}|null} p
 * @returns {string|null} 明子 'rK' / 'bC'，暗子 'r_' / 'b_'，空棋子 null
 */
function encodePiece(p) {
  if (!p) return null
  const side = p.color === 'red' ? 'r' : 'b'
  if (p.state === 0) return side + '_' // 暗棋背面
  return side + (TYPE_CODE[p.realType] || FALLBACK_TYPE)
}

module.exports = { CHAR, TYPE_CODE, PIECE_TEXT, charOf, encodePiece }
