// 工具 tab 的落地页（/tools）：与主页面共用一套外壳，只是 URL 末段落在 tools 上。
// 2026-10-01 起工具页不再是独立外壳（独立页 /tools 已合并进主页面），
// 这里渲染同一个 HomeApp，由 useHomeRoute 把 /tools → 「工具」tab、/tools/<cat> → 对应分类。
import type { Metadata } from "next"
import HomeApp from "@/home/src/App"

export const metadata: Metadata = {
  title: "工具 / 功能",
  description: "ethzzz 的全部工具与功能索引：AI 应用 / 游戏 / 效率工具 / 开发运维。",
}

export default function ToolsPageRoute() {
  return <HomeApp />
}
