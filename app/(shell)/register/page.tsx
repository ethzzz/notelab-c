"use client"
// C 端注册：需邀请码（B 端生成，单码可注册次数有限）；成功后自动登录并回首页
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { postJson, takeRedirectPath } from "@/lib/api"
import { FormField, TextInput, PasswordInput } from "@/components/ui/form"
import { User, Lock, Ticket, SmilePlus } from "lucide-react"

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    if (!username || !password || !inviteCode) { setError("用户名、密码和邀请码为必填项"); return }
    if (password.length < 6) { setError("密码至少 6 位"); return }
    setLoading(true)
    setError("")
    try {
      await postJson("/api/c/auth/register", {
        username, password, nickname, invite_code: inviteCode.trim(),
      })
      // 注册成功即已写入会话 Cookie，直接回跳
      router.replace(takeRedirectPath())
    } catch (e: any) {
      setError(e.message || "注册失败")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center p-2">
      <div className="bg-white/85 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-950/10 border border-black/5 p-8 w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-1">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-lg shadow-indigo-500/30">🧪</span>
          <div className="text-2xl font-bold text-zinc-800">注册账号</div>
          <div className="text-xs text-zinc-400 tracking-wide">凭邀请码加入玩家中心</div>
        </div>
        <FormField label="用户名" required hint="2-20 位字母 / 数字 / 下划线 / 中文">
          <TextInput icon={<User size={14} />} placeholder="请输入用户名" value={username}
            onChange={(e) => setUsername(e.target.value)} />
        </FormField>
        <FormField label="昵称">
          <TextInput icon={<SmilePlus size={14} />} placeholder="选填，游戏内显示" value={nickname}
            onChange={(e) => setNickname(e.target.value)} />
        </FormField>
        <FormField label="密码" required hint="至少 6 位">
          <PasswordInput icon={<Lock size={14} />} placeholder="请输入密码" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label="邀请码" required hint="由管理员发放，每个邀请码可注册次数有限">
          <TextInput icon={<Ticket size={14} />} placeholder="请输入邀请码" value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-xs font-medium text-red-600">⚠️ {error}</div>
        )}
        <button onClick={submit} disabled={loading} className="btn-primary w-full py-2.5 mt-1">
          {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {loading ? "注册中…" : "注 册"}
        </button>
        <p className="text-xs text-zinc-400 text-center">
          已有账号？<Link href="/login" className="text-indigo-500 hover:text-indigo-600 font-medium">直接登录</Link>
        </p>
      </div>
    </div>
  )
}
