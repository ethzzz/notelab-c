// 工具导航页（/tools）：按分类浏览全部工具，迁移自 home 的 tools.html。
import type { Metadata } from "next"
import ToolsPage from "@/home/src/ToolsPage"

export const metadata: Metadata = {
  title: "工具 / 功能",
  description: "ethzzz 的全部工具与功能索引：AI 应用 / 游戏 / 效率工具 / 开发运维。",
}

export default function ToolsPageRoute() {
  return <ToolsPage />
}
