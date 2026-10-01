"use client"
// C 端落地页：玩家中心 · 「游戏中心」子模块页（Hero + 四款游戏卡片，匿名可见）
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { fetchMe, type CUser } from "@/lib/auth"
import { rememberPath } from "@/lib/api"

const GAMES = [
  {
    href: "/play/trpg", emoji: "🎲", name: "TRPG 文字冒险", tag: "互动剧情 · 多结局",
    desc: "挑一个剧本，开始你的冒险。每一次选择，都将左右命运的走向，还有掷骰检定等你挑战。",
  },
  {
    href: "/play/spire", emoji: "🗼", name: "爬塔", tag: "卡牌构筑 · Roguelike",
    desc: "选择角色，构筑卡组，一层一层向上挑战。击败敌人、收集卡牌与药水，看看你能爬多高。",
  },
  {
    href: "/play/vs", emoji: "🧛", name: "吸血鬼幸存者", tag: "自动战斗 · 生存",
    desc: "吸血鬼潮水般涌来，走位、升级、挑选武器强化，在包围中坚持到最后一刻。",
  },
  {
    href: "/play/thunder", emoji: "✈️", name: "雷霆战机", tag: "纵版弹幕 · 闯关",
    desc: "驾驶战机突入敌阵，弹幕中穿梭躲闪，击败层层首领，守住最后的防线。",
  },
  {
    href: "/play/dungeon", emoji: "🏰", name: "地牢领主", tag: "经营养成 · 派遣放置",
    desc: "建造地下城设施、招募英雄并派遣探索。离线也在产出，每天回来看一眼就够了。",
  },
]

export default function HomePage() {
  const [user, setUser] = useState<CUser | null>(null)
  const [meChecked, setMeChecked] = useState(false)

  // 登录态：仅用于决定 Hero 是否展示「登录」按钮（登录后隐藏）
  useEffect(() => {
    fetchMe().then((u) => { setUser(u); setMeChecked(true) })
  }, [])

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 pt-10 pb-12 text-center md:pt-16 md:pb-16">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl shadow-xl shadow-indigo-600/30">🎮</span>
        <span className="text-[11px] font-medium tracking-widest text-indigo-500">玩家中心 · 游戏</span>
        <h1 className="text-3xl font-black tracking-wide text-zinc-800 md:text-5xl">游戏中心</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-500 md:text-base">
          卡牌构筑与 Roguelike、文字冒险、弹幕射击——登录即可开始游玩，进度自动保存，随时随地继续。
        </p>
        {/* ⚠️ CTA 结构必须恒定（2026-10-01 修）：按钮行固定 min-w，登录态只换「第一颗」的文案与目标、
            不增删按钮。此前已登录时多渲染一颗「回到游戏中心」，整行居中会把「登录即玩」从 x=662 挤到 x=597，
            下方卡片区还跟着下移 2px。
            未登录 → 登录即玩（额外记 rememberPath，登录成功后回跳 /games，不再落到个人主页）；
            已登录 → 开始冒险（直达 TRPG），避免点「登录即玩」后被 /login 的已登录回跳送回主页。 */}
        <div className="mt-2 flex min-h-[2.375rem] min-w-[15.5rem] items-center justify-center gap-3">
          {meChecked && user ? (
            <Link href="/play/trpg" className="btn-primary cursor-pointer">开始冒险 <ArrowRight size={15} /></Link>
          ) : (
            <Link href="/login" onClick={() => rememberPath("/games")} className="btn-primary cursor-pointer">登录即玩 <ArrowRight size={15} /></Link>
          )}
          {meChecked && user && <Link href="/games" className="btn-ghost cursor-pointer">回到游戏中心</Link>}
        </div>
      </section>

      {/* 游戏卡片（五款：中屏 2 列、大屏 3 列） */}
      <section className="grid grid-cols-1 gap-4 pb-14 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {GAMES.map((g) => (
          <Link key={g.href} href={g.href}
            className="card card-hover group flex cursor-pointer select-none flex-col gap-3 border border-black/5 bg-white/70 p-6 shadow-sm backdrop-blur-md">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-3xl shadow-inner transition-transform duration-200 group-hover:scale-110">{g.emoji}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-zinc-800">{g.name}</span>
              </div>
              <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600">{g.tag}</span>
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-zinc-500">{g.desc}</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 transition-all group-hover:gap-2.5">
              开始游玩 <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </section>
    </div>
  )
}
