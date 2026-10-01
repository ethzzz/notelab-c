import RequireAuth from "@/components/RequireAuth"

// /spire 受保护路由：是否要求登录由 B 端「游戏登录管理」配置决定（gameCode="spire"）
export default function SpireLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth gameCode="spire">{children}</RequireAuth>
}
