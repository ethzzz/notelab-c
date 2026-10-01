// 个人主页（/ 与 /tools 共用同一外壳，工具已并入主页 tab）共享的布局：
// 引入 home 的设计令牌与全局样式。
// 这些全局样式只在本路由组生效，不会污染游戏中心（/games）等其它路由。
import "@/home/src/styles/global.css"

export default function HomeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
