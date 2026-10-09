import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // C 端（notelab-c）现在是统一消费者入口：根路径 / 是个人主页，/games 是游戏中心。
  // 去掉 basePath，让游戏路由落到 /games/*、首页落到 /；其余前缀（/blog /vs /thunder /ailab /admin /api）由 nginx 各自处理。
  async redirects() {
    return [
      // 2026-10-10：效率工具**整体从游戏中心外壳拆走**，收敛到主页 /tools/*，
      // 点卡片改为在主页内容区原地打开（不再跳到游戏中心的顶部导航外壳）。
      // 工具 URL 的演变史：裸 /translate → /games/utils/*（中枢期）→ /utils/*（2026-10-03 独立）
      // → /tools/*（本次）。所有历史前缀一律直接 308 到最终地址，不做链式两跳。
      { source: "/translate", destination: "/tools/translate", permanent: true },
      { source: "/games/utils", destination: "/tools", permanent: true },
      { source: "/games/utils/", destination: "/tools", permanent: true },
      { source: "/games/utils/translate", destination: "/tools/translate", permanent: true },
      { source: "/games/utils/flashcards", destination: "/tools/flashcards", permanent: true },
      { source: "/games/utils/excerpts", destination: "/tools/excerpts", permanent: true },
      { source: "/games/utils/snippets", destination: "/tools/snippets", permanent: true },
      { source: "/games/utils/habits", destination: "/tools/habits", permanent: true },
      // /utils/* 这一代（2026-10-03 ~ 2026-10-10）
      { source: "/utils", destination: "/tools", permanent: true },
      { source: "/utils/translate", destination: "/tools/translate", permanent: true },
      { source: "/utils/flashcards", destination: "/tools/flashcards", permanent: true },
      { source: "/utils/excerpts", destination: "/tools/excerpts", permanent: true },
      { source: "/utils/snippets", destination: "/tools/snippets", permanent: true },
      { source: "/utils/habits", destination: "/tools/habits", permanent: true },

      // 2026-10-01：游戏页从「套消费级 Shell」改成「全屏游戏台」(play) 路由组，
      // 整页 100dvh 即游戏区。URL 前缀由 /games/<game> 改为 /play/<game>，
      // 旧书签/已分享链接一律 308 兜到新址——注意这里不能省：两个 route group 解析同名路径会 build 冲突，
      // 所以新路由必须换前缀，而换前缀就必然要留重定向，否则老链接直接 404。
      { source: "/games/spire", destination: "/play/spire", permanent: true },
      { source: "/games/vs", destination: "/play/vs", permanent: true },
      { source: "/games/thunder", destination: "/play/thunder", permanent: true },
      { source: "/games/dungeon", destination: "/play/dungeon", permanent: true },
      { source: "/games/trpg", destination: "/play/trpg", permanent: true },
      { source: "/games/trpg/play", destination: "/play/trpg/play", permanent: true },
    ];
  },
};

export default nextConfig;
