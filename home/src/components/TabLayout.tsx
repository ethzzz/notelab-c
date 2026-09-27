"use client"
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { CONTACTS, SITE } from '../data/site';
import {
  CloseIcon,
  GitHubIcon,
  HomeIcon,
  MailIcon,
  MenuIcon,
  WrenchIcon,
} from './Icons';
import styles from './TabLayout.module.css';

/** 单个 tab 定义 */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  /** 可选计数徽标（如文章数 / 工具数） */
  badge?: number;
  /** tab 对应的内容标题 */
  title: string;
  /** 内容副标题 */
  subtitle?: string;
  /** 内容区右上角操作区 */
  actions?: ReactNode;
  /** 内容主体 */
  content: ReactNode;
}

interface TabLayoutProps<T extends string> {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** 侧栏底部「工具」入口：指向另一个 MPA 页面 */
  toolPageHref?: string;
  /** 侧栏底部「返回主页」入口（工具页用） */
  homeHref?: string;
  /** 侧栏页脚补充说明 */
  footerNote?: string;
}

/** 联系方式图标映射 */
function contactIcon(kind: (typeof CONTACTS)[number]['kind']): ReactNode {
  return kind === 'github' ? <GitHubIcon width={16} height={16} /> : <MailIcon width={16} height={16} />;
}

/**
 * 全屏「左竖直 tab / 右内容」布局外壳。
 * - 根容器 100dvh 且 overflow hidden，滚动只发生在内容区；
 * - 窄屏时侧栏降级为抽屉，由顶栏汉堡按钮唤出；
 * - index.html 与 tools.html 共用，保证两页视觉与交互一致。
 */
export function TabLayout<T extends string>({
  tabs,
  active,
  onChange,
  toolPageHref,
  homeHref,
  footerNote,
}: TabLayoutProps<T>): ReactNode {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navId = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // 抽屉打开时锁滚动，Esc 关闭
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const select = (id: T) => {
    onChange(id);
    setDrawerOpen(false);
  };

  const sidebar = (
    <>
      <div className={styles.brand}>
        <span className={styles.brandLogo} aria-hidden="true">
          {SITE.logoText}
        </span>
        <span className={styles.brandText}>
          <strong>{SITE.name}</strong>
          <small>个人主页 · 工具索引</small>
        </span>
        <button
          type="button"
          className={styles.drawerClose}
          onClick={() => setDrawerOpen(false)}
          aria-label="关闭菜单"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>

      <nav className={styles.nav} id={navId} aria-label="主导航">
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              className={on ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => select(tab.id)}
              aria-current={on ? 'page' : undefined}
              // 徽标数字对读屏软件单独播报，避免「项目6」这类连读
              aria-label={
                typeof tab.badge === 'number' ? `${tab.label}，${tab.badge} 项` : tab.label
              }
            >
              <span className={styles.tabIcon} aria-hidden="true">
                {tab.icon}
              </span>
              <span className={styles.tabLabel}>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span className={`${styles.tabBadge} u-num`} aria-hidden="true">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className={styles.sideFooter}>
        {toolPageHref && (
          <a className={styles.sideLink} href={toolPageHref} title="打开工具页（独立页面）">
            <WrenchIcon width={18} height={18} />
            <span>工具 / 功能</span>
            <span className={styles.sideLinkHint}>独立页 ↗</span>
          </a>
        )}
        {homeHref && (
          <a className={styles.sideLink} href={homeHref} title="返回个人主页">
            <HomeIcon width={18} height={18} />
            <span>返回主页</span>
            <span className={styles.sideLinkHint}>index ↗</span>
          </a>
        )}

        <div className={styles.contacts}>
          {CONTACTS.map((c) => (
            <a
              key={c.kind}
              className={styles.contactLink}
              href={c.href}
              title={c.hint}
              aria-label={c.hint}
              {...(c.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {contactIcon(c.kind)}
              <span className={styles.contactLabel}>{c.label}</span>
            </a>
          ))}
        </div>

        {footerNote && <p className={styles.copy}>{footerNote}</p>}
      </div>
    </>
  );

  return (
    <div className={styles.shell}>
      <aside
        className={drawerOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
        aria-label="侧边导航"
      >
        {sidebar}
      </aside>

      {drawerOpen && (
        <div
          className={styles.scrim}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.burger}
            onClick={() => setDrawerOpen(true)}
            aria-label="打开菜单"
            aria-expanded={drawerOpen}
            aria-controls={navId}
          >
            <MenuIcon width={20} height={20} />
          </button>

          <div className={styles.topTitle}>
            <h1>{current.title}</h1>
            {current.subtitle && <p>{current.subtitle}</p>}
          </div>

          <div className={styles.topActions}>{current.actions}</div>
        </header>

        {/* key 触发切换时的入场动画 */}
        <main className={styles.content} key={current.id}>
          {current.content}
        </main>
      </div>
    </div>
  );
}
