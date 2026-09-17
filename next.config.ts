import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // C 端挂在统一入口的 /games 前缀下（nginx ^~ /games -> :3010，保留前缀，同 B 端 /admin 模式）；
  // 根路径 / 让位给个人主页（/var/www/home 静态站）
  basePath: "/games",
};

export default nextConfig;
