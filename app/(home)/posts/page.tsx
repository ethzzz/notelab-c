// 文章 tab（/posts）：主页左侧「文章」tab 的同款内容，独立成路由后可分享 / 被索引。
// 内容组件复用 home/src 的 BlogTab（命名导出），与主页 tab 共用同一份实现。
// 路径取 /posts 而非 /blog：/blog 已被 nginx 静态博客（location ^~ /blog）占用，
// 且 /blog/rss.xml、项目卡「博客」、工具卡「博客」都以此为前缀，不能让给 Next 路由。
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
