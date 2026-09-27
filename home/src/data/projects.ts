/**
 * 项目导航卡数据。
 * 迁移自旧 index.html 的 .cards 区块（游戏中心 / 博客 / AI 试验场 / 管理后台），
 * 并补上原先仅通过「工具」区可达的两个独立游戏仓（雷霆战机 /thunder/、幸存者割草 /vs），
 * 确保工具拆到独立页后主页仍无损保留全部项目链接。
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
    desc: 'TRPG 跑团、尖塔爬塔、幸存者割草、雷霆战机弹幕——登录即玩。',
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
  {
    id: 'thunder',
    emoji: '✈️',
    name: '雷霆战机',
    desc: '本地 H5 弹幕射击，轨道碰撞与波次挑战。',
    href: '/thunder/',
    cta: '开玩 →',
    repo: 'thunder-h5',
    tone: '#38bdf8',
  },
  {
    id: 'vs',
    emoji: '🧟',
    name: '幸存者割草',
    desc: '波次生存，范围武器追身清场。',
    href: '/vs',
    cta: '开玩 →',
    repo: 'vs-h5',
    tone: '#34d399',
  },
] as const;
