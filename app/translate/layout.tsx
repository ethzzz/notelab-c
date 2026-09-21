import RequireAuth from "@/components/RequireAuth"

// /translate 为受保护路由：未登录 → /login（与 /trpg 同款守卫）
export default function TranslateLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
