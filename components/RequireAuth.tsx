"use client"
// 路由守卫包装器：进入前 GET /api/c/auth/me，401 → 记录目标路由并引导 /login
// 以 layout 形式包在受保护路由外层，游戏页本体无需感知登录逻辑
import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { apiJson, rememberPath } from "@/lib/api"

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    apiJson("/api/c/auth/me")
      .then(() => setOk(true))
      .catch(() => {
        rememberPath(window.location.pathname + window.location.search)
        router.replace("/login")
      })
  }, [router])

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
