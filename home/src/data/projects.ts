/**
 * 项目导航卡数据。
 * 迁移自旧 index.html 的 .cards 区块（游戏中心 / 博客 / AI 试验场 / 管理后台）。
 *
 * ⚠️ 2026-10-01 口径调整：本项目（notelab-c）不再在主页「项目」tab 里直接陈列游戏入口。
 * 游戏一律只从「游戏中心」(/games) 进，所以原先补进来的两个独立游戏仓卡片
 * （雷霆战机 /thunder/、幸存者割草 /vs）已移除——它们不是本仓实现，也不该在主页被直接露出。
 */

export interface Project {
  /** 唯一标识 */
  id: string;
  /** 卡片 emoji */
  emoji: string;
  /** 项目名 */
  name: string;
  /** 一句话描述（沿用旧页文案） */
  desc: string;
  /** 跳转路由 */
  href: string;
  /** 行动号召文案 */
  cta: string;
  /** 关联仓库名（README 仓库索引用） */
  repo: string;
  /** 卡片强调色（CSS 变量名之外的自定义色，用于左侧色条与图标底） */
  tone: string;
}

export const PROJECTS: readonly Project[] = [
  {
    id: 'games',
    emoji: '🎮',
    name: '游戏中心',
    desc: '卡牌爬塔、弹幕射击、文字冒险、割草生存——登录即玩，进度自动保存。',
    href: '/games',
    cta: '进入 →',
    repo: 'notelab-c',
    tone: '#f472b6',
  },
  {
    id: 'blog',
    emoji: '✍️',
    name: '博客',
    desc: '技术笔记与随笔，Astro 驱动，支持全文搜索与深浅色阅读。',
    href: '/blog',
    cta: '阅读 →',
    repo: 'blog',
    tone: '#5b5ff0',
  },
  {
    id: 'ailab',
    emoji: '🧪',
    name: 'AI 试验场',
    desc: '大模型应用实验平台：RAG 检索、代码沙盒、本地语音合成。',
    href: '/ailab/',
    cta: '探索 →',
    repo: 'ai-lab',
    tone: '#a855f7',
  },
  {
    id: 'admin',
    emoji: '🛠️',
    name: '管理后台',
    desc: 'NoteLab 管理端：内容、用户、权限与低代码工具集。',
    href: '/admin',
    cta: '登录 →',
    repo: 'notelab-b',
    tone: '#f59e0b',
  },
] as const;
