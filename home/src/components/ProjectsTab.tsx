"use client"
import type { CSSProperties, ReactNode } from 'react';
import { PROJECTS } from '../data/projects';
import { SITE } from '../data/site';
import { ArrowRightIcon, ArrowUpRightIcon } from './Icons';
import styles from './ProjectsTab.module.css';

/** 卡片内联 CSS 变量需要断言为 CSSProperties（tone 为自定义属性） */
type CardStyle = CSSProperties & { '--tone'?: string };

/**
 * 「项目」tab：个人介绍（hero）+ 全部项目导航卡。
 * 卡片文案与链接完整迁移自旧 index.html；/thunder/ 与 /vs 来自旧工具区，
 * 工具拆页后在此保留，确保主页项目链接无损。
 */
export function ProjectsTab(): ReactNode {
  return (
    <div className={styles.wrap}>
      {/* 个人介绍 */}
      <section className={styles.hero}>
        <div className={styles.avatar} aria-hidden="true">
          {SITE.logoText}
        </div>
        <div className={styles.heroText}>
          <h2 className={styles.heroTitle}>
            {SITE.greeting} <span className="u-grad-text">{SITE.name}</span>
          </h2>
          <p className={styles.tagline}>{SITE.tagline}</p>
          <ul className={styles.tags} aria-label="技术栈">
            {SITE.skills.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 项目卡网格 */}
      <section className={styles.grid} aria-label="项目导航">
        {PROJECTS.map((p, i) => (
          <a
            key={p.id}
            className={styles.card}
            href={p.href}
            style={{ '--tone': p.tone, animationDelay: `${i * 55}ms` } as CardStyle}
          >
            <span className={styles.cardHead}>
              <span className={styles.cardEmoji} aria-hidden="true">
                {p.emoji}
              </span>
              <h3 className={styles.cardName}>{p.name}</h3>
              <span className={styles.cardGo} aria-hidden="true">
                <ArrowUpRightIcon width={16} height={16} />
              </span>
            </span>

            <p className={styles.cardDesc}>{p.desc}</p>

            <span className={styles.cardFoot}>
              <span className={styles.cardCta}>
                {p.cta}
                <ArrowRightIcon width={14} height={14} />
              </span>
              <span className={styles.cardRepo}>{p.repo}</span>
            </span>
          </a>
        ))}
      </section>
    </div>
  );
}
