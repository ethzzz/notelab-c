"use client"
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { BlogTab } from './components/BlogTab';
import { BookIcon, LayersIcon, WrenchIcon } from './components/Icons';
import { ProjectsTab } from './components/ProjectsTab';
import { TabLayout, type TabItem } from './components/TabLayout';
import { ToolsTab } from './components/ToolsTab';
import { PROJECTS } from './data/projects';
import { SITE } from './data/site';
import { categoryName, countByCategory, TOOLS } from './data/tools';
import { useHomeRoute, type HomeTab } from './lib/hooks';

/**
 * 个人主页（`/`，2026-10-01 起工具页 /tools 已并入本页）：三个 tab —— 项目 / 文章 / 工具。
 *
 * tab 的 URL 末段用 `posts` 而非 `blog`：nginx 上有 `location ^~ /blog` 静态博客规则
 * （/`blog` 是 /blog/rss.xml、项目卡与工具卡的共同前缀），`/blog` 若归 Next 会让三处同时失效。
 */
type AppTab = HomeTab;

/**
 * 个人主页：全屏左 tab / 右内容。
 * tab 由 URL 驱动：/ → 项目，/posts → 文章，/tools(/tools/<cat>) → 工具及其二级分类。
 * 工具曾是一个独立的侧栏外壳页（同一套 TabLayout 渲染第二层 tab），
 * 2026-10-01 合并后两套外壳只留这一套，/tools 变成本页的一个 tab，分类降级为内容区 chips。
 */
export default function App(): ReactNode {
  const [{ tab, cat }, setTab, setCat] = useHomeRoute();

  const tabs = useMemo<readonly TabItem<AppTab>[]>(
    () => [
      {
        id: 'projects',
        label: '项目',
        icon: <LayersIcon width={18} height={18} />,
        badge: PROJECTS.length,
        title: '项目',
        subtitle: `${PROJECTS.length} 个在线项目 · 游戏 / 博客 / AI / 管理端`,
        content: <ProjectsTab />,
      },
      {
        id: 'posts',
        label: '文章',
        icon: <BookIcon width={18} height={18} />,
        title: '文章',
        subtitle: '来自博客 RSS 的最新 5 篇（/blog/rss.xml）',
        content: <BlogTab />,
      },
      {
        id: 'tools',
        label: '工具',
        icon: <WrenchIcon width={18} height={18} />,
        badge: TOOLS.length,
        title: cat === 'all' ? '工具 / 功能' : `${categoryName(cat)} · 工具`,
        subtitle:
          cat === 'all'
            ? `共 ${TOOLS.length} 项 · 按分类浏览，标注「敬请期待」的尚未上线`
            : `${countByCategory(cat)} 项 · ${categoryName(cat)}`,
        content: <ToolsTab cat={cat} onCat={setCat} />,
      },
    ],
    [cat, setCat],
  );

  return (
    <TabLayout<AppTab>
      tabs={tabs}
      active={tab}
      onChange={setTab}
      footerNote={SITE.copyright}
    />
  );
}
