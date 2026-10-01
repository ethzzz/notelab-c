"use client"
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { TabLayout, type TabItem } from './components/TabLayout';
import { ToolsGrid } from './components/ToolsGrid';
import { CATEGORIES, countByCategory, TOOLS, type ToolCategoryId } from './data/tools';
import { PAGES, SITE } from './data/site';
import { useRouteTab } from './lib/hooks';

/** 合法分类集合（分类 id：all/ai/game/tool/dev） */
const VALID_TABS: readonly ToolCategoryId[] = CATEGORIES.map((c) => c.id);

/**
 * 工具页（/tools，分类路由 /tools/[cat]）。
 * 与主页一致的全屏左 tab / 右内容布局：左侧 tab = 工具分类，右侧 = 该分类工具卡。
 * 分类由 URL 末段驱动：/tools → all，/tools/ai → ai。
 */
export default function ToolsPage(): ReactNode {
  const [cat, setCat] = useRouteTab<ToolCategoryId>(VALID_TABS, 'all', 'tools'); // → /tools/ai

  const tabs = useMemo<readonly TabItem<ToolCategoryId>[]>(
    () =>
      CATEGORIES.map((c) => ({
        id: c.id,
        label: c.name,
        icon: <span aria-hidden="true">{c.emoji}</span>,
        badge: countByCategory(c.id),
        title: c.id === 'all' ? '工具 / 功能' : c.name,
        subtitle:
          c.id === 'all'
            ? `共 ${TOOLS.length} 项 · 按分类浏览，标注「敬请期待」的尚未上线`
            : `${countByCategory(c.id)} 项 · ${c.name}`,
        content: <ToolsGrid cat={c.id} />,
      })),
    [],
  );

  return (
    <TabLayout<ToolCategoryId>
      tabs={tabs}
      active={cat}
      onChange={setCat}
      homeHref={PAGES.home}
      footerNote={SITE.copyright}
    />
  );
}
