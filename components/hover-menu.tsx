"use client"
// 顶部导航通用悬浮下拉菜单：主 tab 悬停展开子菜单列表（桌面端用）
// 复用方式：<HoverMenu label="xx" icon={...} items={[{href,name,desc?,emoji?}]} pathname={pathname} dark={dark} />
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

export type HoverMenuItem = {
  href: string
  name: string
  desc?: string
  emoji?: string
}

export default function HoverMenu({ label, icon, items, pathname, dark }: {
  label: string
  icon?: ReactNode
  items: HoverMenuItem[]
  pathname: string
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  // 任一子项命中当前路由 → 主 tab 高亮
  const anyActive = items.some((it) => pathname === it.href || pathname.startsWith(it.href + "/"))

  function show() {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
    setOpen(true)
  }
  // 短暂延迟收起：鼠标从 tab 移向面板的间隙不会闪烁
  function hideSoon() {
    timer.current = window.setTimeout(() => setOpen(false), 160)
  }
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const triggerCls = anyActive
    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25"
    : dark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button type="button"
        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${triggerCls}`}>
        {icon} {label}
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* 面板常驻 + 透明切换：pt-2 桥接区保证悬停移动不中断 */}
      <div className={`absolute left-0 top-full z-[70] pt-2 transition-opacity duration-150 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className={`w-64 rounded-2xl border p-1.5 shadow-xl backdrop-blur-xl ${dark ? "bg-[#171722]/95 border-white/10" : "bg-white/95 border-black/5"}`}>
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/")
            return (
              <Link key={it.href} href={it.href}
                className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition ${active
                  ? dark ? "bg-white/10" : "bg-indigo-50"
                  : dark ? "hover:bg-white/10" : "hover:bg-black/[0.04]"}`}>
                {it.emoji && <span className="mt-0.5 text-lg leading-none">{it.emoji}</span>}
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active
                    ? dark ? "text-indigo-300" : "text-indigo-600"
                    : dark ? "text-zinc-100" : "text-zinc-800"}`}>{it.name}</span>
                  {it.desc && <span className={`block text-[11px] leading-relaxed ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{it.desc}</span>}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
