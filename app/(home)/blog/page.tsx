// 文章 tab（/blog）：主页左侧「文章」tab 的同款内容，独立成路由后可分享 / 被索引。
// 内容组件复用 home/src 的 BlogTab（命名导出），与主页 tab 共用同一份实现。
import type { Metadata } from "next"
import { BlogTab } from "@/home/src/components/BlogTab"
import { SITE } from "@/home/src/data/site"

export const metadata: Metadata = {
  title: `文章 · ${SITE.name}`,
  description: `${SITE.name} 的个人博客最新文章（每页 5 条，来自博客 RSS）。`,
}

export default function BlogPage() {
  return <BlogTab />
}
