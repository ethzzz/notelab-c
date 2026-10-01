import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // C 端（notelab-c）现在是统一消费者入口：根路径 / 是个人主页，/games 是游戏中心。
  // 去掉 basePath，让游戏路由落到 /games/*、首页落到 /；其余前缀（/blog /vs /thunder /ailab /admin /api）由 nginx 各自处理。
  async redirects() {
    return [
      // 每日翻译迁到游戏中心「工具」子模块：旧 /translate 永久跳到 /games/utils/translate
      { source: "/translate", destination: "/games/utils/translate", permanent: true },

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
