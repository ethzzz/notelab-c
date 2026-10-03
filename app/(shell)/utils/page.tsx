// C 端「工具」聚合页（/utils）：非游戏类效率工具的总入口。
// 匿名可见；各工具页自身按需加登录墙（如 /utils/translate 由 RequireAuth 守卫）。
import Link from "next/link"
import { ArrowRight } from "lucide-react"

// ⚠️ 路径口径（2026-10-03）：工具一律落在 /utils/*，不再挂 /games 命名空间。
// 旧链 /games/utils/* 由 next.config.ts 的 308 兜到本前缀。
const TOOLS = [
  {
    href: "/utils/translate", emoji: "🌐", name: "每日英语翻译练习", tag: "每日更新 · AI 判分",
    desc: "每天 0 点更新一组中文句子，分三阶梯逐句翻译成英文，大模型即时批改、纠错与讲解。",
  },
  {
    href: "/utils/flashcards", emoji: "🃏", name: "速查卡 · 间隔重复", tag: "SM-2 · 键盘操作",
    desc: "把踩坑点压成卡片，按遗忘曲线排期复习。空格翻面、1–6 评分，答错降 ease 并重排到当天。",
  },
  {
    href: "/utils/excerpts", emoji: "📦", name: "知识摘录盒", tag: "本地全文检索",
    desc: "一句话存一段原文，打标签、按标签词频侧栏筛，能整包导出 Markdown / JSON 带走。",
  },
  {
    href: "/utils/snippets", emoji: "🧩", name: "模板 / 片段库", tag: "变量插值 · 一键复制",
    desc: "常敲的命令与配置片段，用 {{变量}} 参数化，打开即带本项目默认值，点一下直接复制。",
  },
  {
    href: "/utils/habits", emoji: "✅", name: "习惯打卡", tag: "连续天数 · 12 周热力",
    desc: "每天勾一次，自动算连续天数（今天没打从昨天起算），配 12 周热力图看坚持密度。",
  },
]

export default function UtilsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="flex flex-col items-center gap-3 pt-10 pb-10 text-center md:pt-14">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl shadow-xl shadow-indigo-600/30">🧰</span>
        <span className="text-[11px] font-medium tracking-widest text-indigo-500">玩家中心 · 工具</span>
        <h1 className="text-3xl font-black tracking-wide text-zinc-800 md:text-4xl">工具</h1>
        <p className="max-w-xl text-sm leading-relaxed text-zinc-500 md:text-base">
          游戏之外的实用小工具，未登录本地也能用；登录后可一键同步，换设备不丢。
        </p>
      </section>

      {/* 工具卡片 */}
      <section className="grid grid-cols-1 gap-4 pb-14 md:grid-cols-2 lg:gap-5">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href}
            className="card card-hover group flex flex-col gap-3 border border-black/5 bg-white/70 p-6 shadow-sm backdrop-blur-md">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-3xl shadow-inner transition-transform duration-200 group-hover:scale-110">{t.emoji}</span>
            <div>
              <span className="text-lg font-bold text-zinc-800">{t.name}</span>
              <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600">{t.tag}</span>
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-zinc-500">{t.desc}</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 transition-all group-hover:gap-2.5">
              打开工具 <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </section>
    </div>
  )
}
