import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // C 端（notelab-c）现在是统一消费者入口：根路径 / 是个人主页，/games 是游戏中心。
  // 去掉 basePath，让游戏路由落到 /games/*、首页落到 /；其余前缀（/blog /vs /thunder /ailab /admin /api）由 nginx 各自处理。
  async redirects() {
    return [
      // 每日翻译迁到游戏中心「工具」子模块：旧 /translate 永久跳到 /games/utils/translate
      { source: "/translate", destination: "/games/utils/translate", permanent: true },
    ];
  },
};

export default nextConfig;
