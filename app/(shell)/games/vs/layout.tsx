import RequireAuth from "@/components/RequireAuth"

// /vs 受保护路由：未登录 → /login
export default function VsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
