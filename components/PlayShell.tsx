"use client"
// 全屏游戏台外壳（2026-10-01 建）：与消费级 Shell 最大的区别是——
// 这里**没有 padding、没有 fixed 顶栏、没有移动端底部 tab**，整页 100dvh 就是游戏区，
// 浮层 HUD 悬在幕布之上（容器 pointer-events-none，只有按钮 pointer-events-auto，绝不挡 canvas）。
//
// 为什么必须独立成路由组（不能沿用 (shell) 里隐藏 chrome）：
//   游戏页过去住在 app/(shell)/games/<game> 里，被 header(fixed h-14) + main(pt-14 pb-16)
//   + 内容(p-3 md:p-7) 三层夹住，于是 5 款游戏各写一遍 calc(100dvh - Xrem) 去猜"外壳吃了多少"。
//   容器尺寸改由本组件一次定死为 100dvh，各游戏页统一写 h-full，这两类 magic number 全部消失。
// ⚠️ 也不做成"按 pathname 隐藏 Shell"的伪全屏：header 是 fixed 的，去掉 padding 时布局仍要重算一次，
//    且 (play) 与 (shell) 若解析出同一 URL，Next build 会直接报 two parallel pages resolve to same path。
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { fetchMe, type CUser } from "@/lib/auth"
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react"

const GLASS =
  "pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-black/5 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white active:scale-95"

/** 游戏内 HUD 按钮通用样式（浅色玻璃，深底/浅底游戏区上都可辨） */
const BTN = `${GLASS} cursor-pointer`

export default function PlayShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<CUser | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // HUD 右上角的用户名：切换游戏页时重查（与 Shell 同一套 fetchMe，未登录时游戏页会被 RequireAuth 拦住）
  useEffect(() => {
    fetchMe().then((u) => setUser(u)).catch(() => setUser(null))
  }, [pathname])

  // 全屏态跟随浏览器（Esc 退出也要能把图标切回 maximize）
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === document.documentElement)
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // 浏览器拒绝（非用户手势 / 未 allow="fullscreen" 的 iframe）→ 保持原状即可
    }
  }

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden"
      // iPhone 底部指示条：viewport-fit=cover 后由这里让出安全区，避免画布被压住
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* ===== 浮层 HUD ===== */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between gap-2 px-3 md:px-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Link href="/games" className={GLASS}>
          <ArrowLeft size={14} /> 游戏中心
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {/* C 端登录用户名常驻文本（未登录时留空，游戏页本身已被 RequireAuth 挡住） */}
          {user && (
            {/* 用户名常驻（移动端不隐藏，只收窄截断——HUD 三个元素都是常驻的） */}
            <span className="max-w-[3.25rem] truncate rounded-full border border-black/5 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur sm:max-w-[8rem] sm:px-3">
              {user.nickname || user.username}
            </span>
          )}
          <button onClick={toggleFullscreen} className={BTN} aria-label={fullscreen ? "退出全屏" : "全屏"}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden sm:inline">{fullscreen ? "退出全屏" : "全屏"}</span>
          </button>
        </div>
      </div>

      {/* ===== 游戏区：整页即画布，各游戏页一律 h-full =====
          ⚠️ 这里保留 overflow-y-auto 而不是 hidden：canvas 类游戏自身 h-full 不产生滚动条，
          但《地牢领主》是长内容经营页（房间/派遣/离线结算），被 hidden 会直接裁掉下半屏。 */}
      <div className="h-full w-full overflow-y-auto overflow-x-hidden">{children}</div>
    </div>
  )
}
