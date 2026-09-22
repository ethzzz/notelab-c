"use client"
// C 端消费级外壳：顶部导航（桌面）+ 底部 Tab（移动端）+ 全局主题背景
// 背景匿名拉取 /api/c/config/background，深色主题自动文字反色（沿用 themes.ts 的 dark 标记）
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { apiJson, api, clearRememberedPath } from "@/lib/api"
import { resolveBgStyle, themeById } from "@/lib/themes"
import { fetchMe, type CUser } from "@/lib/auth"
import Modal from "@/components/ui/modal"
import HoverMenu, { type HoverMenuItem } from "@/components/hover-menu"
import { LogOut, User as UserIcon, Gamepad2, Languages, Wrench, ExternalLink } from "lucide-react"

// 移动端底部 Tab（桌面导航为 游戏中心 / 工具 两个悬浮菜单 + 返回主页）
const NAV = [
  { href: "/", name: "游戏中心", icon: Gamepad2 },
  { href: "/utils/translate", name: "每日翻译", icon: Languages },
]

// 游戏中心子模块的子菜单（悬停展开）：概览 + 四款游戏
const GAME_MENU: HoverMenuItem[] = [
  { href: "/", name: "游戏中心首页", desc: "全部游戏一览", emoji: "🎮" },
  { href: "/trpg", name: "TRPG 文字冒险", desc: "互动剧情 · 多结局", emoji: "🎲" },
  { href: "/spire", name: "爬塔", desc: "卡牌构筑 · Roguelike", emoji: "🗼" },
  { href: "/vs", name: "吸血鬼幸存者", desc: "自动战斗 · 生存", emoji: "🧛" },
  { href: "/thunder", name: "雷霆战机", desc: "纵版弹幕 · 闯关", emoji: "✈️" },
]

// 工具类子模块的子菜单（悬停展开）：目前仅每日翻译，后续可扩展
const TOOLS_MENU: HoverMenuItem[] = [
  { href: "/utils", name: "工具首页", desc: "全部工具一览", emoji: "🧰" },
  { href: "/utils/translate", name: "每日英语翻译练习", desc: "每日更新 · AI 判分", emoji: "🌐" },
]

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<CUser | null>(null)
  const [meChecked, setMeChecked] = useState(false)
  const [bg, setBg] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 首屏：匿名背景配置（只拉一次）
  useEffect(() => {
    apiJson("/api/c/config/background").then((j) => setBg(j.background || null)).catch(() => { /* 失败用默认色 */ })
  }, [])

  // 登录态：路由变化时重查（登录/退出后软跳转也能即时刷新顶栏用户态）
  useEffect(() => {
    fetchMe().then((u) => { setUser(u); setMeChecked(true) })
  }, [pathname])

  // 下拉菜单点外关闭
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  async function logout() {
    try { await api("/api/c/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    clearRememberedPath()
    setUser(null)
    setMenuOpen(false)
    setProfileOpen(false)
    router.push("/")
  }

  const bgStyle = resolveBgStyle(bg)
  const dark = !!themeById(bg?.theme)?.dark
  const avatarChar = String(user?.nickname || user?.username || "?").trim().charAt(0).toUpperCase()
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

  return (
    <div className={`min-h-screen ${dark ? "theme-dark" : ""}`} style={bgStyle}>
      {/* ===== 顶部导航 ===== */}
      <header className={`fixed top-0 inset-x-0 h-14 z-[60] flex items-center gap-3 px-3 md:px-5 ${dark ? "text-zinc-100" : "text-zinc-800"}`}>
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base shadow-md shadow-indigo-600/30">🧪</span>
          <span className="font-bold tracking-wide whitespace-nowrap">NoteLab</span>
          <span className={`hidden lg:inline text-[10px] rounded-full px-2.5 py-1 whitespace-nowrap border ${dark ? "text-zinc-300 bg-white/10 border-white/10" : "text-zinc-500 bg-black/[0.04] border-black/5"}`}>玩家中心</span>
        </Link>

        {/* 桌面端导航：游戏中心 / 工具 两个悬浮菜单 + 返回主页（home 主模块） */}
        <nav className="hidden md:flex items-center gap-1 ml-4">
          <HoverMenu label="游戏中心" icon={<Gamepad2 size={15} />} items={GAME_MENU} pathname={pathname} dark={dark} />
          <HoverMenu label="工具" icon={<Wrench size={15} />} items={TOOLS_MENU} pathname={pathname} dark={dark} />
          {/* 返回主站：home 个人主页为上层主模块，普通 <a> 跳出 basePath */}
          <a href="/"
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${dark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}>
            <ExternalLink size={15} /> 返回主页
          </a>
        </nav>

        {/* 右侧：登录按钮 / 用户下拉 */}
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {!meChecked ? (
            <span className={`h-9 w-24 rounded-xl ${dark ? "bg-white/10" : "bg-black/[0.04]"}`} />
          ) : !user ? (
            <Link href="/login" className="btn-primary !px-4 !py-2 text-xs md:text-sm">登录</Link>
          ) : (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)}
                className={`flex items-center gap-2 rounded-xl border py-1.5 pl-2 pr-3 min-w-0 transition active:scale-95 ${dark ? "bg-white/10 border-white/10 hover:bg-white/20" : "bg-white/70 border-black/5 shadow-sm hover:bg-white/95"}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-[11px] font-bold text-white shadow-sm">{avatarChar}</span>
                <span className="hidden sm:block truncate max-w-[7rem] text-sm font-medium">{user.nickname || user.username}</span>
              </button>
              {menuOpen && (
                <div className={`absolute right-0 top-full mt-2 w-44 rounded-2xl border p-1.5 shadow-xl backdrop-blur-xl ${dark ? "bg-[#171722]/95 border-white/10 text-zinc-200" : "bg-white/95 border-black/5 text-zinc-700"}`}>
                  <button onClick={() => { setMenuOpen(false); setProfileOpen(true) }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${dark ? "hover:bg-white/10" : "hover:bg-black/[0.05]"}`}>
                    <UserIcon size={14} /> 查看信息
                  </button>
                  <button onClick={logout}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${dark ? "hover:bg-red-500/20 hover:text-red-300" : "hover:bg-red-50 hover:text-red-600"}`}>
                    <LogOut size={14} /> 退出登录
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ===== 主内容（顶部导航 + 移动端底部 Tab 之间） ===== */}
      <main className="pt-14 pb-16 md:pb-0 min-h-screen min-w-0">
        <div className="p-3 md:p-7">{children}</div>
      </main>

      {/* ===== 移动端底部 Tab（<768px） ===== */}
      <nav className={`md:hidden fixed bottom-0 inset-x-0 h-14 z-[60] flex items-stretch border-t backdrop-blur-xl ${dark ? "bg-[#101018]/85 border-white/10 text-zinc-400" : "bg-white/85 border-black/5 text-zinc-500"}`}>
        {NAV.slice(0, 3).map((n) => {
          const active = isActive(n.href)
          return (
            <Link key={n.href} href={n.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${active ? "text-indigo-500" : ""}`}>
              <n.icon size={17} strokeWidth={active ? 2.4 : 2} />
              {n.name}
            </Link>
          )
        })}
        <button onClick={() => (user ? setProfileOpen(true) : router.push("/login"))}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${pathname === "/login" ? "text-indigo-500" : ""}`}>
          <UserIcon size={17} />
          我的
        </button>
      </nav>

      {/* ===== 个人信息弹窗 ===== */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="👤 我的信息" maxW="max-w-sm">
        {user && (
          <div className="flex flex-col items-center gap-3 py-2">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">{avatarChar}</span>
            <div className="text-lg font-bold text-zinc-800">{user.nickname || user.username}</div>
            <div className="w-full flex flex-col gap-2 text-sm">
              <div className={`flex justify-between rounded-xl px-4 py-2.5 ${dark ? "bg-white/[0.06]" : "bg-black/[0.04]"}`}><span className="text-zinc-400">用户名</span><span className="font-medium text-zinc-700">{user.username}</span></div>
              <div className={`flex justify-between rounded-xl px-4 py-2.5 ${dark ? "bg-white/[0.06]" : "bg-black/[0.04]"}`}><span className="text-zinc-400">用户组</span><span className="font-medium text-zinc-700">{user.group_code || "default"}</span></div>
            </div>
            <button onClick={logout} className="btn-danger w-full py-2.5 mt-1"><LogOut size={14} /> 退出登录</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
