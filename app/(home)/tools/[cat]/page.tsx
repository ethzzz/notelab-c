// 工具定位路由（/tools/[cat]）—— 末段有**两种**语义，共用本文件：
//   ① 分类筛选：/tools/ai，渲染工具索引 + 该分类的卡片；
//   ② 工具详情：/tools/<slug>（如 /tools/flashcards），在主页内容区原地打开该工具。
// 两者由 home/src/lib/hooks.ts 的 parseHomeRoute 区分（slug 优先，且 slug 与分类 id 不重名）。
//
// 非法末段走 notFound()，避免 /tools/zzz 静默退化成「全部」造成内容错配。
//
// 2026-10-01 工具独立页并入主页面后，这里不再渲染独立外壳：
// 复用同一个 HomeApp，由 useHomeRoute 读 pathname 末段定位。
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import HomeApp from "@/home/src/App"
import { CATEGORIES, countByCategory, type ToolCategoryId } from "@/home/src/data/tools"
import { EMBEDDED_TOOLS, embeddedTool } from "@/home/src/tools/registry"

/** 预渲染合法路径：5 个分类 + 全部内嵌工具 slug（非法路径不进静态产物） */
export function generateStaticParams() {
  return [
    ...CATEGORIES.map((c) => ({ cat: c.id as string })),
    ...EMBEDDED_TOOLS.map((t) => ({ cat: t.slug })),
  ]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cat: string }>
}): Promise<Metadata> {
  const { cat } = await params

  const tool = embeddedTool(cat)
  if (tool) {
    return {
      title: tool.title.replace(/^\S+\s*/, ""), // 去掉开头的 emoji
      description: tool.subtitle,
    }
  }

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
  const known =
    CATEGORIES.some((c) => c.id === (cat as ToolCategoryId)) || !!embeddedTool(cat)
  if (!known) notFound()
  return <HomeApp />
}
