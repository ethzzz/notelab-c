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
import { embeddedTool } from './tools/registry';

/**
 * 个人主页（`/`）：三个 tab —— 项目 / 文章 / 工具。
 *
 * tab 的 URL 末段用 `posts` 而非 `blog`：nginx 上有 `location ^~ /blog` 静态博客规则
 * （`/blog` 是 /blog/rss.xml、项目卡与工具卡的共同前缀），`/blog` 若归 Next 会让三处同时失效。
 */
type AppTab = HomeTab;

/** 顶栏「返回工具列表」按钮样式（与 MemoryActions 的按钮同一套视觉） */
const BACK_BTN =
  'rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50';

/**
 * 个人主页：全屏左 tab / 右内容。
 * tab 由 URL 驱动：/ → 项目，/posts → 文章，/tools(/tools/<cat>) → 工具索引，
 * /tools/<slug> → 某个工具**在内容区原地打开**。
 *
 * 工具曾是独立的侧栏外壳页，2026-10-01 合并进本页；2026-10-10 又从「游戏中心外壳」(/utils/*)
 * 整体拆出来收敛到 /tools/*，于是内容区多了「工具详情」这一形态（见 ./tools/registry.tsx）。
 */
export default function App(): ReactNode {
  const [{ tab, cat, tool: toolSlug }, setTab, setCat] = useHomeRoute();

  // 当前是否停在某个工具详情（有值则在内容区渲染该工具组件，而不是卡片网格）
  const tool = embeddedTool(toolSlug);
  const ToolBody = tool?.Body;

  const tabs = useMemo<readonly TabItem<AppTab>[]>(
    () => {
      const toolsTab: TabItem<AppTab> = tool
        ? {
            id: 'tools',
            label: '工具',
            icon: <WrenchIcon width={18} height={18} />,
            badge: TOOLS.length,
            title: tool.title,
            subtitle: tool.subtitle,
            // 左「返回列表」+ 该工具自己的操作区（导出 / 同步等）
            actions: (
              <>
                <button type="button" className={BACK_BTN} onClick={() => setTab('tools')}>
                  ← 全部工具
                </button>
                {tool.actions}
              </>
            ),
            content: ToolBody ? <ToolBody /> : null,
          }
        : {
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
          };

      return [
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
        toolsTab,
      ];
    },
    [cat, setCat, setTab, tool, ToolBody],
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
