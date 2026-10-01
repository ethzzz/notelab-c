// 文章 tab（/posts）：主页左侧「文章」tab 落地的真实路由，可分享 / 被索引。
// 复用主页面组件而非裸 BlogTab：TabLayout 会按 pathname 末段 posts 把「文章」置为激活态，
// 侧栏导航、返回主页、返回工具页都保留（只在 BlogTab 里套 TabLayout 会让 /posts 裸奔）。
// 路径取 /posts 而非 /blog：/blog 已被 nginx 静态博客（location ^~ /blog）占用，
// 且 /blog/rss.xml、项目卡「博客」、工具卡「博客」都以此为前缀，不能让给 Next 路由。
import type { Metadata } from "next"
import HomeApp from "@/home/src/App"
import { SITE } from "@/home/src/data/site"

export const metadata: Metadata = {
  title: `文章 · ${SITE.name}`,
  description: `${SITE.name} 的个人博客最新文章（每页 5 条，来自博客 RSS）。`,
}

export default function PostsPage() {
  return <HomeApp />
}
