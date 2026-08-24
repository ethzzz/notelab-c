import RequireAuth from "@/components/RequireAuth"

// /spire 受保护路由：未登录 → /login
export default function SpireLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
