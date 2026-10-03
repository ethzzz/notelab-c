"use client"
import type { CSSProperties, ReactNode } from 'react';
import {
  categoryName,
  isPlaceholder,
  PLACEHOLDER_HREF,
  toolsByCategory,
  type ToolCategoryId,
} from '../data/tools';
import { ArrowUpRightIcon, HourglassIcon } from './Icons';
import { track } from '@/lib/track';
import styles from './ToolsGrid.module.css';

type CardStyle = CSSProperties & { '--tone'?: string };

/** 各分类强调色，用于卡片图标底与 hover 描边 */
const TONE: Record<Exclude<ToolCategoryId, 'all'>, string> = {
  ai: '#a855f7',
  game: '#f472b6',
  tool: '#5b5ff0',
  dev: '#22c55e',
};

/**
 * 某分类下的工具卡网格。
 * 卡片字段 name / desc / href 完整迁移自旧 main.js 的 TOOLS；
 * href 为占位（'#'）的条目渲染为不可点击卡片，并标注「敬请期待」。
 */
export function ToolsGrid({ cat }: { cat: ToolCategoryId }): ReactNode {
  const list = toolsByCategory(cat);

  if (list.length === 0) {
    return <p className={styles.empty}>该类别下暂无工具。</p>;
  }

  return (
    <div className={styles.grid}>
      {list.map((t, i) => {
        const soon = isPlaceholder(t);
        const tone = TONE[t.cat];

        if (soon) {
          // 占位：用 div 而非 a，点击不跳转；标注敬请期待
          return (
            <div
              key={t.name}
              className={`${styles.card} ${styles.cardSoon}`}
              style={{ '--tone': tone, animationDelay: `${i * 45}ms` } as CardStyle}
              aria-disabled="true"
            >
              <span className={styles.cardHead}>
                <span className={styles.cardEmoji} aria-hidden="true">
                  {t.emoji}
                </span>
                <span className={styles.soonTag}>
                  <HourglassIcon width={13} height={13} />
                  敬请期待
                </span>
              </span>
              <h3 className={styles.cardName}>{t.name}</h3>
              <p className={styles.cardDesc}>{t.desc}</p>
              <span className={styles.cardFoot}>
                <span className={styles.catName}>{categoryName(t.cat)}</span>
                <span className={styles.soonHint}>未上线</span>
              </span>
            </div>
          );
        }

        const internal = t.href.startsWith('/');
        const toolId = t.href.replace(/^\//, '').replace(/\//g, '_') || t.name;
        return (
          <a
            key={t.name}
            className={styles.card}
            href={t.href}
            onClick={() => track("tool_open", { tool_id: toolId })}
            style={{ '--tone': tone, animationDelay: `${i * 45}ms` } as CardStyle}
            {...(internal ? {} : { target: '_blank', rel: 'noreferrer' })}
          >
            <span className={styles.cardHead}>
              <span className={styles.cardEmoji} aria-hidden="true">
                {t.emoji}
              </span>
              <span className={styles.cardGo} aria-hidden="true">
                <ArrowUpRightIcon width={16} height={16} />
              </span>
            </span>
            <h3 className={styles.cardName}>{t.name}</h3>
            <p className={styles.cardDesc}>{t.desc}</p>
            <span className={styles.cardFoot}>
              <span className={styles.catName}>{categoryName(t.cat)}</span>
              <code className={styles.href}>{t.href === PLACEHOLDER_HREF ? '' : t.href}</code>
            </span>
          </a>
        );
      })}
    </div>
  );
}
