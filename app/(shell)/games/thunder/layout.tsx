import RequireAuth from "@/components/RequireAuth"

// /thunder 受保护路由：未登录 → /login（与 /vs 同款）
export default function ThunderLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
