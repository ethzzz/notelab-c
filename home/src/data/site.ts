/**
 * 站点级常量：品牌、联系方式、个人介绍。
 * 迁移自旧 index.html（topbar / hero / footer），保持链接与文案一致。
 */

export const SITE = {
  /** 品牌名 */
  name: 'ethzzz',
  /** 品牌 logo 字母 */
  logoText: 'E',
  /** Hero 主标题前缀 */
  greeting: '你好，我是',
  /** Hero 副标题 */
  tagline: '全栈折腾者 · 用代码做点好玩的东西——游戏、博客与 AI 实验',
  /** Hero 技术标签 */
  skills: [
    'TypeScript',
    'Next.js',
    'Spring Boot',
    'Python',
    'Astro',
    'MySQL',
    'Redis',
    'Docker',
  ],
  /** 版权行 */
  copyright: '© 2026 ethzzz · Powered by 手搓与好奇心',
} as const;

/** 联系方式：GitHub + 邮箱（mailto），保留旧页全部入口 */
export const CONTACTS = [
  {
    kind: 'github',
    label: 'github.com/ethzzz',
    href: 'https://github.com/ethzzz',
    external: true,
    hint: 'GitHub 主页（新窗口打开）',
  },
  {
    kind: 'mail',
    label: 'ethz0607@gmail.com',
    href: 'mailto:ethz0607@gmail.com',
    external: false,
    hint: '发送邮件到 ethz0607@gmail.com',
  },
] as const;

export type Contact = (typeof CONTACTS)[number];

/**
 * 站点入口路径。
 * 2026-10-01 工具页并入主页后两套外壳合为一处，导航全在 TabLayout 内部；
 * PAGES 保留为对外/对外链的真实路由常量（tools 即主页里的「工具」tab 落地路径）。
 */
export const PAGES = {
  home: '/',
  tools: '/tools',
} as const;
