"use client"
import type { ReactNode } from 'react';
import { CATEGORIES, countByCategory, type ToolCategoryId } from '../data/tools';
import { ToolsGrid } from './ToolsGrid';
import styles from './ToolsGrid.module.css';

/**
 * 工具 tab 的内容体：内容区顶部一排分类 chips + 该分类的工具卡网格。
 *
 * 2026-10-01 工具独立页（/tools 曾挂全套侧栏外壳）合并进主页面后，分类不再占据
 * 顶层侧栏，降级为内容区内的二级筛选；选中态照样写进 URL（`/tools/ai`），
 * 分享 / 刷新 / 后退都能落在同一分类。
 */
export function ToolsTab({
  cat,
  onCat,
}: {
  cat: ToolCategoryId;
  onCat: (cat: ToolCategoryId) => void;
}): ReactNode {
  return (
    <>
      <div className={styles.catBar} role="tablist" aria-label="工具分类">
        {CATEGORIES.map((c) => {
          const on = c.id === cat;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? `${styles.catChip} ${styles.catChipOn}` : styles.catChip}
              onClick={() => onCat(c.id)}
              // 徽标数字对读屏软件单独播报，避免「AI 应用 4」这类连读
              aria-label={on ? undefined : `${c.name}，${countByCategory(c.id)} 项`}
            >
              <span className={styles.catEmoji} aria-hidden="true">
                {c.emoji}
              </span>
              <span>{c.name}</span>
              <span className={`${styles.catCount} u-num`} aria-hidden="true">
                {countByCategory(c.id)}
              </span>
            </button>
          );
        })}
      </div>

      <ToolsGrid cat={cat} />
    </>
  );
}
