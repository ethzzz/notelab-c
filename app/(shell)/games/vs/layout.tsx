import RequireAuth from "@/components/RequireAuth"

// /vs 受保护路由：是否要求登录由 B 端「游戏登录管理」配置决定（gameCode="vs"）
export default function VsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth gameCode="vs">{children}</RequireAuth>
}
