import RequireAuth from "@/components/RequireAuth"

// /trpg 与 /trpg/play：是否要求登录由 B 端「游戏登录管理」配置决定（gameCode="trpg"）
export default function TrpgLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth gameCode="trpg">{children}</RequireAuth>
}
