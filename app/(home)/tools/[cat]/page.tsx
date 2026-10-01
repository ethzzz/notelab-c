// 工具分类路由（/tools/[cat]，如 /tools/ai）：分类由 URL 末段表达，可直接分享。
// 非法分类走 notFound()，避免 /tools/zzz 静默退化成「全部」造成内容错配。
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ToolsPage from "@/home/src/ToolsPage"
import { CATEGORIES, countByCategory, type ToolCategoryId } from "@/home/src/data/tools"

/** 预渲染 5 个合法分类，非法路径不进静态产物 */
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ cat: c.id as string }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cat: string }>
}): Promise<Metadata> {
  const { cat } = await params
  const c = CATEGORIES.find((x) => x.id === cat)
  if (!c) return { title: "页面不存在 · ethzzz" }
  return {
    title: `${c.name} · 工具`,
    description: `${c.name}类工具与功能索引（共 ${countByCategory(c.id)} 项）。`,
  }
}

export default async function ToolsCategoryPage({
  params,
}: {
  params: Promise<{ cat: string }>
}) {
  const { cat } = await params
  if (!CATEGORIES.some((c) => c.id === (cat as ToolCategoryId))) notFound()
  return <ToolsPage />
}
