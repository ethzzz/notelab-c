import RequireAuth from "@/components/RequireAuth"

// /play/loot 受保护路由：是否要求登录由 B 端「游戏登录管理」配置决定（gameCode="loot"）
export default function LootLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth gameCode="loot">{children}</RequireAuth>
}
