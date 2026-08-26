"use client"
// C 端登录：POST /api/c/auth/login；成功后回跳被拦截前记录的页面（无记录则回首页）
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiJson, postJson, takeRedirectPath } from "@/lib/api"
import { toast } from "sonner"
import { FormField, TextInput, PasswordInput } from "@/components/ui/form"
import { User, Lock } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState("")

  /** 登录/会话有效后回跳：优先被拦截前记录的路由，无效则回首页 */
  function goNext() {
    router.replace(takeRedirectPath())
  }

  // 进入登录页先校验登录态：会话仍有效则直接回原页面，不再展示登录表单
  useEffect(() => {
    (async () => {
      try {
        await apiJson("/api/c/auth/me")
        goNext()
      } catch {
        setChecking(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function submit() {
    if (!username || !password) { setError("请输入用户名和密码"); return }
    setLoading(true)
    setError("")
    try {
      await postJson("/api/c/auth/login", { username, password })
      goNext()
    } catch (e: any) {
      setError(e.message || "登录失败")
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <span className="inline-block h-8 w-8 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">正在检查登录状态…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center p-2">
      <div className="bg-white/85 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-950/10 border border-black/5 p-8 w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-1">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-lg shadow-indigo-500/30">🧪</span>
          <div className="text-2xl font-bold text-zinc-800">NoteLab</div>
          <div className="text-xs text-zinc-400 tracking-wide">登录游戏中心，开始你的冒险</div>
        </div>
        <FormField label="用户名">
          <TextInput icon={<User size={14} />} placeholder="请输入用户名" value={username}
            onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
        <FormField label="密码">
          <PasswordInput icon={<Lock size={14} />} placeholder="请输入密码" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-xs font-medium text-red-600">⚠️ {error}</div>
        )}
        <button onClick={submit} disabled={loading} className="btn-primary w-full py-2.5 mt-1">
          {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {loading ? "登录中…" : "登 录"}
        </button>
        <p className="text-xs text-zinc-400 text-center">
          有邀请码？<Link href="/register" className="text-indigo-500 hover:text-indigo-600 font-medium">注册新账号</Link>
        </p>
      </div>
    </div>
  )
}
