"use client"
// 路由守卫包装器：进入前 GET /api/c/auth/me，401 → 记录目标路由并引导 /login
// 以 layout 形式包在受保护路由外层，游戏页本体无需感知登录逻辑。
//
// 配置驱动（gameCode）：若 B 端超管将该游戏配置为「游客可玩」(requireLogin=false)，
// 则不再校验登录态、直接渲染内容；仅当 requireLogin=true 时才要求登录。
import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { apiJson, rememberPath } from "@/lib/api"
import { isLoginRequired } from "@/lib/gameAccess"

export default function RequireAuth({ children, gameCode }: { children: ReactNode; gameCode?: string }) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 指定了 gameCode 且配置为游客可玩 → 直接放行（不校验登录）
      if (gameCode && !(await isLoginRequired(gameCode))) {
        if (!cancelled) setOk(true)
        return
      }
      // 否则校验登录态
      apiJson("/api/c/auth/me")
        .then(() => { if (!cancelled) setOk(true) })
        .catch(() => {
          if (cancelled) return
          rememberPath(window.location.pathname + window.location.search)
          router.replace("/login")
        })
    })()
    return () => { cancelled = true }
  }, [router, gameCode])

  if (!ok) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <span className="inline-block h-8 w-8 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">正在校验登录状态…</span>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
