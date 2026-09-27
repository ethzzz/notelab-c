/** 自定义 hooks：RSS 加载、当前激活 tab 的 URL hash 同步。 */
import { useCallback, useEffect, useState } from 'react';
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
 * 激活 tab 与 URL hash 双向同步：
 * - 首次进入按 hash 选中（如 /#blog），非法或缺省时用 fallback；
 * - 切换 tab 用 replaceState 改写 hash（不堆历史记录）；
 * - 浏览器前进/后退触发 hashchange 时同步回 state。
 */
export function useHashTab<T extends string>(
  valid: readonly T[],
  fallback: T,
): [T, (id: T) => void] {
  const key = valid.join('|');

  const read = useCallback((): T => {
    // SSR 阶段没有 window，直接回退到默认 tab，避免服务端渲染报错
    if (typeof window === 'undefined') return fallback;
    const raw = window.location.hash.replace(/^#/, '');
    return key.split('|').includes(raw) ? (raw as T) : fallback;
  }, [key, fallback]);

  const [tab, setTab] = useState<T>(read);

  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [read]);

  const change = useCallback((id: T) => {
    setTab(id);
    const target = `#${id}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target);
    }
  }, []);

  return [tab, change];
}
