import RequireAuth from "@/components/RequireAuth"

// /trpg 与 /trpg/play 均为受保护路由：未登录 → /login
export default function TrpgLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
