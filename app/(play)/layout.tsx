import PlayShell from "@/components/PlayShell"

// 全屏游戏台（/play/*）：不套消费级 Shell，整页即游戏区。
// 登录守卫不在这里——各游戏仍在自己的 layout 挂 RequireAuth(gameCode)，
// 这样 B 端「游戏登录管理」的 requireLogin 配置继续逐游戏生效、不需要改这里。
export default function PlayLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PlayShell>{children}</PlayShell>
}
