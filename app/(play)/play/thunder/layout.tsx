import RequireAuth from "@/components/RequireAuth"

// /thunder 受保护路由：是否要求登录由 B 端「游戏登录管理」配置决定（gameCode="thunder"）
export default function ThunderLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth gameCode="thunder">{children}</RequireAuth>
}
