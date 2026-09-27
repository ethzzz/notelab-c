/**
 * 工具 / 功能数据。
 * 完整迁移自旧 main.js 的 CATEGORIES / TOOLS 两个数组，字段一一对应：
 *   cat / emoji / name / desc / href
 * 新增或修改工具只需改 TOOLS，分类 tab 与计数自动生效。
 *
 * href 为占位符（'#'）的条目表示「尚未上线」，渲染为不可点击卡片并标注「敬请期待」。
 */

/** 工具分类 id：全部 / AI 应用 / 游戏 / 效率工具 / 开发运维 */
export type ToolCategoryId = 'all' | 'ai' | 'game' | 'tool' | 'dev';

/** 除 all 之外的真实分类（用于卡片上的分类名标注） */
export type ToolCat = Exclude<ToolCategoryId, 'all'>;

export interface ToolCategory {
  id: ToolCategoryId;
  name: string;
  emoji: string;
}

export interface Tool {
  cat: ToolCat;
  emoji: string;
  name: string;
  desc: string;
  /** 目标地址；`'#'` 表示占位未上线 */
  href: string;
}

/** 占位地址：渲染为「敬请期待」，不产生跳转 */
export const PLACEHOLDER_HREF = '#';

export const CATEGORIES: readonly ToolCategory[] = [
  { id: 'all', name: '全部', emoji: '🗂️' },
  { id: 'ai', name: 'AI 应用', emoji: '🧪' },
  { id: 'game', name: '游戏', emoji: '🎮' },
  { id: 'tool', name: '效率工具', emoji: '🧰' },
  { id: 'dev', name: '开发运维', emoji: '⚙️' },
] as const;

export const TOOLS: readonly Tool[] = [
  {
    cat: 'ai',
    emoji: '🧪',
    name: 'AI 试验场',
    desc: '大模型应用平台：RAG 检索、代码沙盒、本地语音合成。',
    href: '/ailab/',
  },
  {
    cat: 'ai',
    emoji: '🔊',
    name: '英语发音教练',
    desc: 'Kokoro-82M 本地 TTS，句子朗读与跟读，离线可用。',
    href: '/ailab/',
  },
  {
    cat: 'ai',
    emoji: '📜',
    name: 'TRPG 剧本生成',
    desc: 'AI 生成跑团剧本与分支剧情，一键发布到游戏中心。',
    href: '/games',
  },
  {
    cat: 'ai',
    emoji: '📖',
    name: '小说工坊',
    desc: 'AI 辅助写作，docx 编辑与导出。',
    href: PLACEHOLDER_HREF,
  },
  {
    cat: 'game',
    emoji: '🎲',
    name: 'TRPG 跑团',
    desc: '多人文字冒险，回忆模式与卡牌系统。',
    href: '/games',
  },
  {
    cat: 'game',
    emoji: '🃏',
    name: '尖塔爬塔',
    desc: 'Roguelike 卡牌爬塔，数据驱动角色与被动。',
    href: '/games',
  },
  {
    cat: 'game',
    emoji: '✈️',
    name: '雷霆战机',
    desc: '本地 H5 弹幕射击，轨道碰撞与波次挑战。',
    href: '/thunder/',
  },
  {
    cat: 'game',
    emoji: '🧟',
    name: '幸存者割草',
    desc: '波次生存，范围武器追身清场。',
    href: '/vs',
  },
  {
    cat: 'tool',
    emoji: '✍️',
    name: '博客',
    desc: 'Astro 驱动，全文搜索与深浅色阅读。',
    href: '/blog',
  },
  {
    cat: 'tool',
    emoji: '🧩',
    name: '低代码设计器',
    desc: '拖拽生成页面，四列布局与组件库。',
    href: '/admin',
  },
  {
    cat: 'tool',
    emoji: '🌐',
    name: '每日翻译',
    desc: '每日英语翻译练习，逐句提交，大模型判分与纠错。',
    href: '/games/utils/translate',
  },
  {
    cat: 'tool',
    emoji: '🩺',
    name: '每日巡检',
    desc: '服务器自动体检 + AI 研判，日报落盘。',
    href: PLACEHOLDER_HREF,
  },
  {
    cat: 'dev',
    emoji: '🔐',
    name: 'RBAC 权限体系',
    desc: '路由组→角色→账户，菜单按权限即时过滤。',
    href: '/admin',
  },
  {
    cat: 'dev',
    emoji: '🎫',
    name: 'SSO 统一登录',
    desc: 'nginx auth_request 门禁，B/C 双会话互认。',
    href: PLACEHOLDER_HREF,
  },
  {
    cat: 'dev',
    emoji: '🗄️',
    name: '自动备份',
    desc: '每日 mysqldump + gzip，滚动保留最近 7 份。',
    href: PLACEHOLDER_HREF,
  },
] as const;

/** 是否为占位（未上线）工具 */
export function isPlaceholder(tool: Tool): boolean {
  return tool.href === PLACEHOLDER_HREF || tool.href.trim() === '';
}

/** 分类 id → 中文名（卡片底部标注用） */
export function categoryName(cat: ToolCat | ToolCategoryId): string {
  return CATEGORIES.find((c) => c.id === cat)?.name ?? '';
}

/** 某分类下的工具数量；all 为总数 */
export function countByCategory(id: ToolCategoryId): number {
  return id === 'all' ? TOOLS.length : TOOLS.filter((t) => t.cat === id).length;
}

/** 按分类筛选工具 */
export function toolsByCategory(id: ToolCategoryId): readonly Tool[] {
  return id === 'all' ? TOOLS : TOOLS.filter((t) => t.cat === id);
}
