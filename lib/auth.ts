// C 端登录态：受保护页进入前 GET /api/c/auth/me，401 → 记录目标路由并引导 /login
"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { apiJson, rememberPath } from "./api"

export type CUser = { id: number; username: string; nickname: string; group_code: string }

export type AuthState = "loading" | "ok"

/**
 * 路由守卫：挂载即校验登录态。未登录时记录当前路径并跳转 /login，
 * 期间返回 "loading"（页面渲染占位，不渲染受保护内容）。
 */
export function useRequireAuth(): { state: AuthState; user: CUser | null } {
  const router = useRouter()
  const [state, setState] = useState<AuthState>("loading")
  const [user, setUser] = useState<CUser | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const me = await apiJson<CUser>("/api/c/auth/me")
        setUser(me)
        setState("ok")
      } catch {
        rememberPath(window.location.pathname + window.location.search)
        router.replace("/login")
      }
    })()
  }, [router])

  return { state, user }
}

/** 尝试静默获取当前用户（外壳用）：未登录返回 null，不做跳转 */
export async function fetchMe(): Promise<CUser | null> {
  try {
    return await apiJson<CUser>("/api/c/auth/me")
  } catch {
    return null
  }
}
