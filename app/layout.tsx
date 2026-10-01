import type { Metadata, Viewport } from "next"
import { Toaster } from "sonner"
import { ConfirmHost } from "@/components/ui/confirm"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "NoteLab 玩家中心", template: "%s · NoteLab" },
  description: "NoteLab C 端玩家中心 · 游戏中心 / 工具 / 博客 / AI 实验",
}

// 2026-10-01：全屏游戏台 (/play/*) 需要吃满屏幕并把底部安全区让给画布，
// viewport-fit=cover 之后 PlayShell 才能取到 env(safe-area-inset-*)。
export const viewport: Viewport = {
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-center" />
        <ConfirmHost />
      </body>
    </html>
  )
}
