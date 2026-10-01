"use client"
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { BlogTab } from './components/BlogTab';
import { BookIcon, LayersIcon } from './components/Icons';
import { ProjectsTab } from './components/ProjectsTab';
import { TabLayout, type TabItem } from './components/TabLayout';
import { PROJECTS } from './data/projects';
import { PAGES, SITE } from './data/site';
import { useRouteTab } from './lib/hooks';

/** home 只有两个 tab：项目 / 文章（工具已拆到 /tools） */
type HomeTab = 'projects' | 'blog';

/** 合法 tab 集合（模块级常量，保证 useCallback 依赖稳定） */
const VALID_TABS: readonly HomeTab[] = ['projects', 'blog'];

/**
 * 个人主页（/）。
 * 全屏左 tab / 右内容；工具入口在侧栏底部，跳转独立页 /tools。
 * tab 由 URL 末段驱动：/ → 项目，/blog → 文章。
 */
export default function App(): ReactNode {
  const [tab, setTab] = useRouteTab<HomeTab>(VALID_TABS, 'projects');

  const tabs = useMemo<readonly TabItem<HomeTab>[]>(
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
        id: 'blog',
        label: '文章',
        icon: <BookIcon width={18} height={18} />,
        title: '文章',
        subtitle: '来自博客 RSS 的最新 5 篇（/blog/rss.xml）',
        content: <BlogTab />,
      },
    ],
    [],
  );

  return (
    <TabLayout<HomeTab>
      tabs={tabs}
      active={tab}
      onChange={setTab}
      toolPageHref={PAGES.tools}
      footerNote={SITE.copyright}
    />
  );
}
