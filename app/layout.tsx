import type { Metadata } from "next"
import { Toaster } from "sonner"
import Shell from "@/components/Shell"
import { ConfirmHost } from "@/components/ui/confirm"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "NoteLab 玩家中心", template: "%s · NoteLab" },
  description: "NoteLab C 端玩家中心 · 游戏中心 / 每日翻译等工具",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <Shell>{children}</Shell>
        <Toaster richColors position="top-center" />
        <ConfirmHost />
      </body>
    </html>
  )
}
