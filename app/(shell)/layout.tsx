import Shell from "@/components/Shell"

// 游戏中心 + 账号页（/games、/login、/register）统一套 C 端消费级外壳（顶部导航 + 移动端底部 tab + 主题背景）。
// 个人主页（/）与工具导航（/tools）在根层，使用各自全屏布局、不套 Shell。
export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Shell>{children}</Shell>
}
