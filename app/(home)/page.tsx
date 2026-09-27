// 个人主页（/）：全屏左 tab / 右内容，迁移自 home 的 index.html。
import type { Metadata } from "next"
import HomeApp from "@/home/src/App"

export const metadata: Metadata = {
  title: "ethzzz 的个人主页",
  description: "ethzzz 的个人主页 · 游戏中心 / 工具 / 博客 / AI 实验",
}

export default function HomePage() {
  return <HomeApp />
}
