/** 自定义 hooks：RSS 加载、当前激活 tab 的 URL 路径同步。 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CATEGORIES, type ToolCategoryId } from '../data/tools';
import { fetchLatestPosts, type RssState } from './rss';

/** 个人主页顶层 tab id（与 URL 末段一致：/projects 未单独建路由，故只有这三个） */
export type HomeTab = 'projects' | 'posts' | 'tools';

/** URL 解析结果：顶层 tab + 工具 tab 的二级分类 */
export interface HomeRoute {
  tab: HomeTab;
  /** 工具分类；非 tools tab 时为 'all' */
  cat: ToolCategoryId;
}

const HOME_TABS: readonly HomeTab[] = ['projects', 'posts', 'tools'];

/**
 * 由 pathname 解析主页路由（唯一真源，SSR 与客户端共用）。
 * - `/` → 项目；`/posts` → 文章；
 * - `/tools`、`/tools/ai` → 工具 tab，分类分别落在 all / ai（非法分类退回 all，不 404）；
 * - 末段不是合法 tab 时（如 /games、/login）退回 projects，
 *   并再给一次旧 hash 外链的机会（`/#posts`），SSR 无 window 直接回退。
 */
export function parseHomeRoute(pathname: string): HomeRoute {
  const segs = pathname.split('/').filter(Boolean);

  if (segs[0] === 'tools') {
    const c = (segs[1] ?? 'all') as ToolCategoryId;
    return { tab: 'tools', cat: CATEGORIES.some((x) => x.id === c) ? c : 'all' };
  }

  const last = segs[segs.length - 1] ?? '';
  const fromPath = HOME_TABS.find((t) => t === last);
  if (fromPath) return { tab: fromPath, cat: 'all' };

  const fromHash =
    typeof window === 'undefined'
      ? undefined
      : HOME_TABS.find((t) => t === window.location.hash.replace(/^#/, ''));
  return { tab: fromHash ?? 'projects', cat: 'all' };
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

  /** 切换顶层 tab：projects → `/`，其余 → `/<id>` */
  const goTab = useCallback(
    (tab: HomeTab) => {
      setRoute({ tab, cat: 'all' });
      const target = tab === 'projects' ? '/' : `/${tab}`;
      if (typeof window !== 'undefined' && window.location.pathname !== target) {
        router.replace(target, { scroll: false });
      }
    },
    [router],
  );

  /** 切换工具分类：只在 tools tab 内生效，落到 `/tools/<cat>` */
  const goCat = useCallback(
    (cat: ToolCategoryId) => {
      setRoute({ tab: 'tools', cat });
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
