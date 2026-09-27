/**
 * 博客 RSS 拉取与解析。
 * 行为完整迁移自旧 main.js：fetch('/blog/rss.xml') → DOMParser 解析 <item> →
 * 取最新 MAX_POSTS 篇（标题 / 链接 / 日期 / 摘要）。
 *
 * 安全：只返回纯文本字符串，渲染一律走 React 文本节点（自动转义），
 * 不使用 dangerouslySetInnerHTML，避免 RSS 内容注入 HTML。
 */

/** RSS 数据源（Astro @astrojs/rss 输出，item.link 为绝对 URL） */
export const RSS_URL = '/blog/rss.xml';

/** 展示的最新文章篇数 */
export const MAX_POSTS = 5;

/** 失败 / 空态时兜底跳转的博客地址 */
export const BLOG_URL = '/blog';

export interface RssPost {
  /** 文章标题 */
  title: string;
  /** 原文链接（绝对 URL） */
  link: string;
  /** 格式化后的日期 YYYY-MM-DD；无法解析时为空串 */
  date: string;
  /** 摘要（纯文本） */
  desc: string;
  /** React 列表 key */
  id: string;
}

export type RssState =
  | { status: 'loading' }
  | { status: 'ok'; posts: RssPost[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/**
 * 日期格式化：与旧 fmtDate 一致，无效日期返回空串。
 * 用本地时区拆分，避免 toISOString 造成的跨日偏移。
 */
export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 安全取子节点文本（trim）；节点缺失返回 null */
function textOf(parent: Element, tag: string): string | null {
  const el = parent.querySelector(tag);
  const text = el?.textContent?.trim();
  return text ? text : null;
}

/**
 * 只接受 http(s) 与站内相对路径的链接；
 * 其余（如 javascript:）一律回退到博客首页，防止恶意 RSS 注入协议。
 */
export function sanitizeLink(raw: string | null): string {
  if (!raw) return BLOG_URL;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return BLOG_URL;
}

/** 把 <item> 列表解析为 RssPost[] */
export function parseRssItems(doc: Document, limit: number = MAX_POSTS): RssPost[] {
  const items = Array.from(doc.querySelectorAll('item')).slice(0, limit);
  return items.map((item, index) => {
    const link = sanitizeLink(textOf(item, 'link'));
    return {
      title: textOf(item, 'title') ?? '无标题',
      link,
      date: formatDate(textOf(item, 'pubDate')),
      desc: textOf(item, 'description') ?? '',
      // guid 优先，退化到 link，再退化到序号，保证 key 稳定唯一
      id: textOf(item, 'guid') ?? link ?? String(index),
    };
  });
}

/**
 * 模块级缓存：同一次页面生命周期内只真正拉取一次 RSS。
 *
 * 为什么需要：/blog/rss.xml 约 1.8MB，而「文章」tab 每次切换都会重新挂载 BlogTab，
 * 不缓存会导致反复全量下载。
 *
 * 只缓存成功态（ok / empty）；失败态不缓存，用户点「重新加载」时能真正重试。
 * 注意：这里刻意不接收 AbortSignal —— 请求结果要被缓存复用，中途取消等于白下载；
 * 调用方（useLatestPosts）用 active 标志忽略卸载后的结果即可。
 */
let cached: RssState | null = null;
let inflight: Promise<RssState> | null = null;

/** 清空缓存（测试 / 强制刷新用） */
export function clearRssCache(): void {
  cached = null;
  inflight = null;
}

export interface FetchPostsOptions {
  /** true = 忽略缓存与进行中的请求，强制重新拉取（失败重试用） */
  force?: boolean;
}

/**
 * 拉取并解析 RSS（带缓存与并发去重）。
 * 任何环节失败（网络 / HTTP 非 2xx / XML 解析错误）都归一为 error 状态，
 * 由调用方渲染「直接去博客 →」兜底链接。
 */
export function fetchLatestPosts(options: FetchPostsOptions = {}): Promise<RssState> {
  if (!options.force && cached) return Promise.resolve(cached);
  // 并发去重：StrictMode 双调用 / 快速切换 tab 时只发一个请求
  if (!options.force && inflight) return inflight;

  const task = loadPosts().then((state) => {
    // 只有当前这个 task 仍是最新的那个时才清空 inflight（避免 force 竞态误清）
    if (inflight === task) inflight = null;
    if (state.status === 'ok' || state.status === 'empty') cached = state;
    return state;
  });

  inflight = task;
  return task;
}

/** 真正的网络拉取与解析（不含缓存逻辑） */
async function loadPosts(): Promise<RssState> {
  let res: Response;
  try {
    res = await fetch(RSS_URL);
  } catch {
    return { status: 'error', message: '文章列表加载失败' };
  }

  if (!res.ok) {
    return { status: 'error', message: '文章列表加载失败' };
  }

  let xml: string;
  try {
    xml = await res.text();
  } catch {
    return { status: 'error', message: '文章列表加载失败' };
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { status: 'error', message: '文章列表加载失败' };
  }

  const posts = parseRssItems(doc);
  if (posts.length === 0) {
    return { status: 'empty' };
  }
  return { status: 'ok', posts };
}
