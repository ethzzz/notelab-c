/** 自定义 hooks：RSS 加载、当前激活 tab 的 URL 路径同步。 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CATEGORIES, type ToolCategoryId } from '../data/tools';
import { isEmbeddedSlug } from '../tools/registry';
import { fetchLatestPosts, type RssState } from './rss';

/** 个人主页顶层 tab id（与 URL 末段一致：/projects 未单独建路由，故只有这三个） */
export type HomeTab = 'projects' | 'posts' | 'tools';

/** URL 解析结果：顶层 tab + 工具 tab 的二级定位（分类筛选 或 工具详情） */
export interface HomeRoute {
  tab: HomeTab;
  /** 工具分类；非 tools tab 或处于工具详情时为 'all' */
  cat: ToolCategoryId;
  /** 工具详情 slug（`/tools/<slug>`）；不是工具详情时为 null */
  tool: string | null;
}

const HOME_TABS: readonly HomeTab[] = ['projects', 'posts', 'tools'];

/**
 * 由 pathname 解析主页路由（唯一真源，SSR 与客户端共用）。
 * - `/` → 项目；`/posts` → 文章；
 * - `/tools`、`/tools/ai` → 工具 tab，分类分别落在 all / ai（非法分类退回 all，不 404）；
 * - `/tools/<slug>` → 工具 tab 的**工具详情**（在内容区原地打开，见 tools/registry.tsx）；
 *   slug 优先于分类 id 匹配，二者不重名；
 * - 末段不是合法 tab 时（如 /games、/login）退回 projects，
 *   并再给一次旧 hash 外链的机会（`/#posts`），SSR 无 window 直接回退。
 */
export function parseHomeRoute(pathname: string): HomeRoute {
  const segs = pathname.split('/').filter(Boolean);

  if (segs[0] === 'tools') {
    const second = segs[1] ?? 'all';
    if (isEmbeddedSlug(second)) return { tab: 'tools', cat: 'all', tool: second };
    return {
      tab: 'tools',
      cat: CATEGORIES.some((x) => x.id === second) ? (second as ToolCategoryId) : 'all',
      tool: null,
    };
  }

  const last = segs[segs.length - 1] ?? '';
  const fromPath = HOME_TABS.find((t) => t === last);
  if (fromPath) return { tab: fromPath, cat: 'all', tool: null };

  const fromHash =
    typeof window === 'undefined'
      ? undefined
      : HOME_TABS.find((t) => t === window.location.hash.replace(/^#/, ''));
  return { tab: fromHash ?? 'projects', cat: 'all', tool: null };
}

/**
 * 主页路由状态（tab + 工具分类）与 URL 双向同步。
 *
 * 2026-10-01 工具页 /tools 合并进主页面后，主页与工具页共用一套外壳（TabLayout），
 * 顶层 tab 由 pathname 末段驱动、工具分类由 `/tools/<cat>` 驱动，
 * 两者都用 `router.replace` 软导航：不堆历史、不触发整页刷新、URL 可直接分享。
 */
export function useHomeRoute(): [
  HomeRoute,
  (tab: HomeTab) => void,
  (cat: ToolCategoryId) => void,
] {
  const pathname = usePathname();
  const router = useRouter();
  const [route, setRoute] = useState<HomeRoute>(() => parseHomeRoute(pathname));

  useEffect(() => {
    setRoute(parseHomeRoute(pathname));
  }, [pathname]);

  /** 切换顶层 tab：projects → `/`，其余 → `/<id>`。同时退出工具详情（回到分类索引） */
  const goTab = useCallback(
    (tab: HomeTab) => {
      setRoute({ tab, cat: 'all', tool: null });
      const target = tab === 'projects' ? '/' : `/${tab}`;
      if (typeof window !== 'undefined' && window.location.pathname !== target) {
        router.replace(target, { scroll: false });
      }
    },
    [router],
  );

  /** 切换工具分类：只在 tools tab 内生效，落到 `/tools/<cat>`；同时退出工具详情 */
  const goCat = useCallback(
    (cat: ToolCategoryId) => {
      setRoute({ tab: 'tools', cat, tool: null });
      const target = `/tools/${cat}`;
      if (typeof window !== 'undefined' && window.location.pathname !== target) {
        router.replace(target, { scroll: false });
      }
    },
    [router],
  );

  return [route, goTab, goCat];
}

/**
 * 拉取博客最新文章。
 *
 * 不主动 abort 请求：结果会被模块级缓存复用，取消等于白下载那份 1.8MB 的 RSS；
 * 卸载后的 setState 用 active 标志拦截。
 *
 * @param reloadKey 递增即强制绕过缓存重新拉取（失败后的「重新加载」按钮）
 */
export function useLatestPosts(reloadKey: number = 0): RssState {
  const [state, setState] = useState<RssState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    // reloadKey > 0 = 用户主动重试，强制绕过缓存；同时立刻回到加载态
    const force = reloadKey > 0;
    if (force) setState({ status: 'loading' });

    void fetchLatestPosts({ force }).then((next) => {
      if (active) setState(next);
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return state;
}
