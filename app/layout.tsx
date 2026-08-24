import type { Metadata } from "next"
import { Toaster } from "sonner"
import Shell from "@/components/Shell"
import { ConfirmHost } from "@/components/ui/confirm"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "NoteLab 游戏中心", template: "%s · NoteLab" },
  description: "NoteLab C 端 · 文字冒险 / 爬塔 / 幸存者",
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
