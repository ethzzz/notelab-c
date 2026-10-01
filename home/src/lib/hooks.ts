/** 自定义 hooks：RSS 加载、当前激活 tab 的 URL 路径同步。 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchLatestPosts, type RssState } from './rss';

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

/**
 * 激活 tab 与 **URL 路径末段** 双向同步（如 `/blog`、`/tools/ai`）。
 *
 * 前序实现 `useHashTab` 用的是 `location.hash + replaceState` —— 那套来自旧 home 仓
 * （Vite 纯静态 MPA，双入口 index.html / tools.html，当时没有路由系统可用）。
 * 2026-09-27 主页移植进 notelab-c 的 Next App Router 后，`/` 与 `/tools` 已是真实路由，
 * tab 继续用 hash 会留下 `/#blog` 这样的脏 URL，也无法单独分享 / 索引某个 tab。
 * 故改为路径驱动，并与 App Router 的软导航对齐：
 * - 读取：取 pathname 最后一段（`/` 段为空时用 fallback）；
 * - 兼容旧 hash 链接：pathname 末段非法时再试一次 location.hash，
 *   让 `/#blog`、`/tools#ai` 这类历史收藏 / 外链仍能落到正确 tab（SSR 无 window 跳过）；
 * - 切换：`router.replace('/<id>')` 做软导航，不堆历史记录、不触发整页刷新；
 * - 本地 state 先立即反馈（pathname 变更有异步延迟），再由 pathname 变化校正一次。
 */
export function useRouteTab<T extends string>(
  valid: readonly T[],
  fallback: T,
  /** tab 所在的父路径：主页为 ''（`/blog`），工具页为 'tools'（`/tools/ai`） */
  base = '',
): [T, (id: T) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const key = valid.join('|');
  const ids = key.split('|');

  const read = useCallback((): T => {
    const seg = pathname.split('/').filter(Boolean).pop() ?? '';
    if (ids.includes(seg)) return seg as T;
    // 末段不是 tab（如 /tools 的 'tools'、根路径的空串）时退看 hash：
    // 让 /#blog、/tools#ai 这类历史收藏 / 外链仍能落到正确 tab。SSR 无 window 直接回 fallback。
    if (typeof window === 'undefined') return fallback;
    return ids.includes(window.location.hash.replace(/^#/, ''))
      ? (window.location.hash.replace(/^#/, '') as T)
      : fallback;
  }, [pathname, key, fallback]);

  const [tab, setTab] = useState<T>(read);

  useEffect(() => {
    setTab(read());
  }, [read]);

  const change = useCallback(
    (id: T) => {
      setTab(id);
      // 选中默认 tab 时回到父路径本身（/tools → /tools，/ → /），
      // 这样外部引来的 /tools 链接不会被用户一按 tab 就永久改写成 /tools/all
      const target =
        id === fallback
          ? base
            ? `/${base}`
            : '/'
          : base
            ? `/${base}/${id}`
            : `/${id}`;
      if (window.location.pathname !== target) {
        router.replace(target, { scroll: false });
      }
    },
    [base, fallback, router],
  );

  return [tab, change];
}
