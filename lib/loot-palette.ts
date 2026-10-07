// 摸金行动 · 稀有度色板（C 端）
//
// 后台配的 `color` 是这里的 **key**，不是十六进制色值 —— 见 loot-engine.ts 里 RarityDef 的注释。
//
// ⚠️ 为什么必须写成整串静态类名：Tailwind v4 只生成**源码里字面出现过**的类，
//    `border-${color}-400` 这种拼接出来的类在构建产物里根本不存在（会静默变透明/无色）。
//    所以每档颜色都要老老实实写全，改色板 = 改这张表。
//
// ⚠️ 与 B 端 `loot-editor/_shared/model.ts` 的 PALETTE 是同构的两份（两仓不能互相 import）：
//    改一边必须改另一边，否则"后台选的颜色"和"前台显示的颜色"会对不上。
//
// ⚠️ 这里是**暗色一套**：摸金页是整页深色的游戏区 —— 不能用 `dark:` 变体，
//    因为项目的 dark: 跟随系统偏好，而这个页不管系统主题都必须暗。
//    底色用透明色阶压在近黑页面上，边框用中等明度的同色系；
//    物品图标本身带粗描边，在这种底上才立得住。

export interface PaletteEntry {
  /** 中文色名，后台下拉框显示用 */
  label: string
  /** 容器卡片/物品格子的外框 + 底色 */
  cls: string
  /** 该档的文字色 */
  text: string
  /** 纯色块（图例/小圆点用） */
  dot: string
}

export const LOOT_PALETTE: Record<string, PaletteEntry> = {
  slate: {
    label: "灰白（普通）",
    cls: "border-slate-400/45 bg-slate-400/15",
    text: "text-slate-300",
    dot: "bg-slate-400",
  },
  blue: {
    label: "蓝",
    cls: "border-blue-400/55 bg-blue-500/20",
    text: "text-blue-300",
    dot: "bg-blue-500",
  },
  cyan: {
    label: "青",
    cls: "border-cyan-400/55 bg-cyan-500/20",
    text: "text-cyan-300",
    dot: "bg-cyan-500",
  },
  emerald: {
    label: "绿",
    cls: "border-emerald-400/55 bg-emerald-500/20",
    text: "text-emerald-300",
    dot: "bg-emerald-500",
  },
  amber: {
    label: "黄（史诗）",
    cls: "border-amber-400/60 bg-amber-500/20",
    text: "text-amber-300",
    dot: "bg-amber-500",
  },
  purple: {
    label: "紫（稀有）",
    cls: "border-purple-400/55 bg-purple-500/20",
    text: "text-purple-300",
    dot: "bg-purple-500",
  },
  rose: {
    label: "玫红",
    cls: "border-rose-400/55 bg-rose-500/20",
    text: "text-rose-300",
    dot: "bg-rose-500",
  },
  red: {
    label: "红（传说）",
    cls: "border-red-400/60 bg-red-500/20",
    text: "text-red-300",
    dot: "bg-red-500",
  },
}

export const PALETTE_KEYS = Object.keys(LOOT_PALETTE)

/** 取色板项；未知 key 回落灰白（**绝不返回 undefined**，否则 className 会变成 "undefined"） */
export function paletteOf(key?: string | null): PaletteEntry {
  return (key && LOOT_PALETTE[key]) || LOOT_PALETTE.slate
}
