"use client"
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLatestPosts } from '../lib/hooks';
import { BLOG_URL, RSS_URL } from '../lib/rss';
import { ArrowRightIcon, ArrowUpRightIcon, CalendarIcon, RefreshIcon } from './Icons';
import styles from './BlogTab.module.css';

/** 骨架占位（加载中），保留旧页「加载中…」文案 */
function Skeleton(): ReactNode {
  return (
    <div className={styles.list} aria-busy="true" aria-live="polite">
      <p className={styles.loading}>加载中…</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div className={styles.skRow} key={i} style={{ animationDelay: `${i * 90}ms` }}>
          <span className={styles.skDate} />
          <span className={styles.skBody}>
            <span className={styles.skTitle} />
            <span className={styles.skDesc} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 失败 / 空态兜底：文案沿用旧 main.js，并提供「直接去博客 →」链接 */
function Fallback({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div className={styles.fallback} role="status">
      <div className={styles.fallbackIcon} aria-hidden="true">
        ✍️
      </div>
      <p className={styles.fallbackText}>
        {message} ·{' '}
        <a className={styles.fallbackLink} href={BLOG_URL}>
          直接去博客看看
          <ArrowRightIcon width={14} height={14} />
        </a>
      </p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          <RefreshIcon width={15} height={15} />
          重新加载
        </button>
      )}
    </div>
  );
}

/**
 * 「文章」tab：拉取 /blog/rss.xml 展示最新 5 篇（标题 / 链接 / 日期 / 摘要）。
 *
 * 安全：标题、日期、摘要全部作为 React 子节点渲染（文本节点，自动转义），
 * 不使用 dangerouslySetInnerHTML；href 经 sanitizeLink 协议白名单校验。
 */
export function BlogTab(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const state = useLatestPosts(reloadKey);

  if (state.status === 'loading') return <Skeleton />;
  if (state.status === 'error')
    return <Fallback message={state.message} onRetry={() => setReloadKey((n) => n + 1)} />;
  if (state.status === 'empty') return <Fallback message="博客还没有文章" />;

  return (
    <ol className={styles.list}>
      {state.posts.map((post, i) => {
        const internal = post.link.startsWith('/');
        return (
          <li key={post.id} className={styles.item} style={{ animationDelay: `${i * 55}ms` }}>
            <a
              className={styles.post}
              href={post.link}
              {...(internal ? {} : { target: '_blank', rel: 'noreferrer' })}
            >
              <span className={styles.postDate}>
                <CalendarIcon width={14} height={14} />
                <time className="u-num" dateTime={post.date || undefined}>
                  {post.date || '—'}
                </time>
              </span>

              <span className={styles.postBody}>
                <span className={styles.postTitle}>{post.title}</span>
                {post.desc && <span className={styles.postDesc}>{post.desc}</span>}
              </span>

              <span className={styles.postGo} aria-hidden="true">
                <ArrowUpRightIcon width={16} height={16} />
              </span>
            </a>
          </li>
        );
      })}

      <li className={styles.foot}>
        <a className={styles.more} href={BLOG_URL}>
          全部文章
          <ArrowRightIcon width={14} height={14} />
        </a>
        <span className={styles.source}>
          数据源 <code>{RSS_URL}</code>
        </span>
      </li>
    </ol>
  );
}
