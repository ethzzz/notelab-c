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
 * - 切换：`router.replace('/<id>')` 做软导航，不堆历史记录、不触发整页刷新；
 * - 本地 state 先立即反馈（pathname 变更有异步延迟），再由 pathname 变化校正一次。
 */
export function useRouteTab<T extends string>(
  valid: readonly T[],
  fallback: T,
): [T, (id: T) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const key = valid.join('|');
  const ids = key.split('|');

  const read = useCallback((): T => {
    const seg = pathname.split('/').filter(Boolean).pop() ?? '';
    return (ids.includes(seg) ? (seg as T) : fallback) as T;
  }, [pathname, key, fallback]);

  const [tab, setTab] = useState<T>(read);

  useEffect(() => {
    setTab(read());
  }, [read]);

  const change = useCallback(
    (id: T) => {
      setTab(id);
      // 已经是目标路径就别再导航一次（避免点击当前 tab 时 push 无意义的历史）
      if (window.location.pathname !== `/${id}`) {
        router.replace(`/${id}`, { scroll: false });
      }
    },
    [router],
  );

  return [tab, change];
}
