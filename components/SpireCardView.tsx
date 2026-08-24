"use client"

// 尖塔风卡牌视图：游戏页 / 工坊编辑器 / 奖励商店共用
import { cardDesc, type CardDef, type CardCategory } from "@/lib/spire-engine"

export const RARITY_NAME = ["普通", "稀有", "史诗"]
const RARITY_GLOW = ["", "shadow-[0_0_10px_rgba(56,189,248,0.4)]", "shadow-[0_0_14px_rgba(251,191,36,0.5)]"]
export const CATEGORY_LABEL: Record<CardCategory, string> = { attack: "攻击", defense: "防御", buff: "增益", special: "特殊" }
// 尖塔风卡牌配色：横幅/插画边框/类型标签 随类型变色
const CATEGORY_STYLE: Record<CardCategory, { ribbon: string; art: string; tag: string }> = {
  attack: { ribbon: "from-zinc-100 via-zinc-300 to-zinc-400 text-zinc-900", art: "border-zinc-300/80", tag: "bg-zinc-300 text-zinc-900" },
  defense: { ribbon: "from-cyan-100 via-cyan-300 to-cyan-500 text-cyan-950", art: "border-cyan-300/80", tag: "bg-cyan-300 text-cyan-950" },
  buff: { ribbon: "from-amber-100 via-amber-300 to-amber-500 text-amber-950", art: "border-amber-300/80", tag: "bg-amber-300 text-amber-950" },
  special: { ribbon: "from-rose-100 via-rose-300 to-rose-400 text-rose-950", art: "border-rose-300/80", tag: "bg-rose-300 text-rose-950" },
}

export function SpireCardView({ def, disabled, onClick, price, small }: {
  def: CardDef; disabled?: boolean; onClick?: () => void; price?: number; small?: boolean
}) {
  const st = CATEGORY_STYLE[def.category]
  const artH = small ? "h-16" : "h-20"
  const iconSize = small ? "text-3xl" : "text-4xl"
  const descH = small ? "min-h-[3rem]" : "min-h-[3.5rem]"
  return (
    <button onClick={onClick} disabled={disabled} title={`${RARITY_NAME[def.rarity]}·${CATEGORY_LABEL[def.category]}`}
      className={`relative ${small ? "w-28" : "w-32"} rounded-lg border-[3px] border-[#3f0d0d] bg-gradient-to-b from-[#93302c] via-[#7c2624] to-[#5d1a18] px-1.5 pt-2 pb-1.5 text-left shadow-lg ${RARITY_GLOW[def.rarity]} transition-transform enabled:hover:-translate-y-1.5 enabled:hover:brightness-110 disabled:opacity-45`}>
      {/* 能量消耗珠 */}
      <span className="absolute -left-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-100 bg-gradient-to-b from-amber-300 to-orange-600 text-sm font-black text-white shadow-md">
        {def.cost}
      </span>
      {/* 强化标记 */}
      {def.upgraded && (
        <span className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-sky-100 bg-gradient-to-b from-sky-400 to-blue-600 text-[11px] shadow-md" title="已强化">⚒️</span>
      )}
      {/* 名称横幅（两侧折角） */}
      <div className="relative mx-0.5">
        <span className="absolute -left-1.5 top-1 h-2.5 w-2.5 rotate-45 bg-[#40100e]" />
        <span className="absolute -right-1.5 top-1 h-2.5 w-2.5 rotate-45 bg-[#40100e]" />
        <div className={`relative rounded-sm bg-gradient-to-b ${st.ribbon} py-0.5 text-center text-[11px] font-bold shadow`}>{def.name}</div>
      </div>
      {/* 卡面插画：放射纹底 + emoji */}
      <div className={`mx-1 mt-1 flex ${artH} items-center justify-center overflow-hidden rounded-sm border-2 ${st.art}`}
        style={{ background: "repeating-conic-gradient(from 0deg at 50% 50%, #7a2020 0deg 18deg, #571414 18deg 36deg)" }}>
        <span className={`${iconSize} drop-shadow-[0_2px_5px_rgba(0,0,0,0.7)]`}>{def.icon ?? "🎴"}</span>
      </div>
      {/* 类型小标签 */}
      <div className={`mx-auto -mt-2 w-max rounded-sm px-1.5 py-px text-[9px] font-bold shadow ${st.tag}`}>{CATEGORY_LABEL[def.category]}</div>
      {/* 描述面板 */}
      <div className={`mt-1.5 rounded-sm bg-[#2b1b1b]/95 px-1 py-1.5 text-center text-[10px] leading-snug text-zinc-100 ${descH}`}>
        {cardDesc(def)}
      </div>
      {price != null && <div className="mt-1 text-center text-xs font-bold text-amber-300">🪙 {price}</div>}
    </button>
  )
}
