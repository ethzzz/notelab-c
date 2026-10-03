import RequireAuth from "@/components/RequireAuth"

// /utils/translate 为受保护路由：未登录 → /login（与 /trpg 同款守卫）
export default function UtilsTranslateLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>
}
