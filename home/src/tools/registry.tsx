/**
 * 内嵌工具注册表：主页「工具」tab 里，这些工具**不再跳出去**，而是在内容区原地打开。
 *
 * 与 `data/tools.ts` 的 `TOOLS` 的关系：
 *   - `TOOLS` 是卡片展示数据（含 /ailab/、/blog、/admin 等站外或其它应用的链接）；
 *   - 本表只登记「点进去要在主页内容区渲染组件」的那几个，并用 slug 与卡片 href 对齐
 *     （`TOOLS` 里对应条目的 href 写 `/tools/<slug>`）。
 *
 * ⚠️ slug 与 `CATEGORIES` 的分类 id（all / ai / game / tool / dev）**不能重名** ——
 *    `parseHomeRoute` 正靠这一点在同一层 URL 里区分「分类筛选」与「工具详情」。
 *
 * 2026-10-10：这些工具原先住在游戏中心外壳的 /utils/* 下（顶部导航里与「游戏中心」并列），
 * 拆开后统一收敛到主页 /tools/*，游戏中心不再有工具入口。
 */
import type { ComponentType, ReactNode } from 'react';
import TranslateTool from '@/components/tools/TranslateTool';
import FlashcardsTool from '@/components/tools/FlashcardsTool';
import ExcerptsTool from '@/components/tools/ExcerptsTool';
import SnippetsTool from '@/components/tools/SnippetsTool';
import HabitsTool from '@/components/tools/HabitsTool';
import MemoryActions from '@/components/tools/MemoryActions';

export interface EmbeddedTool {
  /** URL slug：/tools/<slug> */
  slug: string;
  /** 主页内容区顶栏标题 */
  title: string;
  /** 顶栏副标题 */
  subtitle: string;
  /** 工具主体 */
  Body: ComponentType;
  /** 顶栏右侧操作区（记忆型工具有导出/同步；翻译页没有） */
  actions?: ReactNode;
}

export const EMBEDDED_TOOLS: readonly EmbeddedTool[] = [
  {
    slug: 'translate',
    title: '🌐 每日英语翻译练习',
    subtitle: '每天 0 点更新一组中文句子 · 逐句提交 → 大模型判分 · 需要登录',
    Body: TranslateTool,
  },
  {
    slug: 'flashcards',
    title: '🃏 速查卡 · 间隔重复',
    subtitle: 'SM-2 记忆曲线本地排期 · 键盘 1–6 评分 · 空格翻面',
    Body: FlashcardsTool,
    actions: <MemoryActions kind="flashcard" />,
  },
  {
    slug: 'excerpts',
    title: '📦 知识摘录盒',
    subtitle: '摘一段原文 → 打 tag → 本地全文检索 → 导出 Markdown / JSON',
    Body: ExcerptsTool,
    actions: <MemoryActions kind="excerpt" />,
  },
  {
    slug: 'snippets',
    title: '🧩 模板 / 片段库',
    subtitle: '{{变量}} 自动抽成输入框 · 一键复制 · 本地全文搜索',
    Body: SnippetsTool,
    actions: <MemoryActions kind="snippet" />,
  },
  {
    slug: 'habits',
    title: '✅ 习惯打卡',
    subtitle: '每日打卡 · 连续天数 · 12 周热力图 · 全本地存储',
    Body: HabitsTool,
    actions: <MemoryActions kind="habit" />,
  },
];

/** slug → 内嵌工具；不是内嵌工具（含 null）返回 undefined */
export function embeddedTool(slug: string | null | undefined): EmbeddedTool | undefined {
  if (!slug) return undefined;
  return EMBEDDED_TOOLS.find((t) => t.slug === slug);
}

/** 仅判存在性（parseHomeRoute 里用来区分 slug 与分类 id） */
export function isEmbeddedSlug(seg: string): boolean {
  return EMBEDDED_TOOLS.some((t) => t.slug === seg);
}
