// 摸金行动 · 稀有度色板（C 端）
//
// 后台配的 `color` 是这里的 **key**，不是十六进制色值 —— 见 loot-engine.ts 里 RarityDef 的注释。
//
// ⚠️ 为什么必须写成整串静态类名：Tailwind v4 只生成**源码里字面出现过**的类，
//    `border-${color}-400` 这种拼接出来的类在构建产物里根本不存在（会静默变透明/无色）。
//    所以每档颜色都要老老实实写全，改色板 = 改这张表。
//
// ⚠️ 与 B 端 `loot-editor/_shared/palette.ts` 是同构的两份（两仓不能互相 import）：
//    改一边必须改另一边，否则"后台选的颜色"和"前台显示的颜色"会对不上。

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
    cls: "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  blue: {
    label: "蓝",
    cls: "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  cyan: {
    label: "青",
    cls: "border-cyan-400 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-300",
    dot: "bg-cyan-500",
  },
  emerald: {
    label: "绿",
    cls: "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  amber: {
    label: "黄（史诗）",
    cls: "border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  purple: {
    label: "紫（稀有）",
    cls: "border-purple-400 bg-purple-50 dark:border-purple-500 dark:bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-300",
    dot: "bg-purple-500",
  },
  rose: {
    label: "玫红",
    cls: "border-rose-400 bg-rose-50 dark:border-rose-500 dark:bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  red: {
    label: "红（传说）",
    cls: "border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-500/10",
    text: "text-red-600 dark:text-red-300",
    dot: "bg-red-500",
  },
}

export const PALETTE_KEYS = Object.keys(LOOT_PALETTE)

/** 取色板项；未知 key 回落灰白（**绝不返回 undefined**，否则 className 会变成 "undefined"） */
export function paletteOf(key?: string | null): PaletteEntry {
  return (key && LOOT_PALETTE[key]) || LOOT_PALETTE.slate
}
