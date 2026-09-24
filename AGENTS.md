# notelab-c —— C 端（玩家端）

> 本文件只写「本仓特有、不知道就会出错」的信息。全局信息（目录结构、服务器、纪律、提交规范）见根 `../AGENTS.md`。

## 定位
玩家端：游戏中心 + 工具集。Next.js App Router + 自定义样式，**basePath `/games`**（写死在 `next.config.ts`）。

| 项 | 值 |
|---|---|
| 服务器目录 | `/root/notelab-c` |
| pm2 进程 | `notelab-c` |
| 端口 | **3010** |
| nginx | `location ^~ /games`，保留前缀转发 |
| 线上入口 | http://117.72.32.87/games/ |
| GitHub | `git@github.com:ethzzz/notelab-c.git`（main） |

**本仓没有自己的后端**：页面内 `/api/*` 全部由 nginx 直达 `notelab-java`（:8001），前端不做任何代理或 rewrites。

## 页面路由（相对 basePath，即 `/games` 之下）
| 路径 | 内容 |
|---|---|
| `/` | 玩家中心（游戏中心已降为子模块） |
| `/login` `/register` | 登录 / 注册说明 |
| `/spire` | 杀戮尖塔类 |
| `/trpg` `/trpg/play` | 跑团：剧本 / 游玩 |
| `/thunder` | 雷霆战机 |
| `/vs` | 吸血鬼幸存者 |
| `/utils` `/utils/translate` | 工具集 / 每日英语翻译练习 |

`/translate` → `/utils/translate` 是永久跳转，写在 `next.config.ts` 的 `redirects()` 里；source / destination **相对 basePath，不要再加 `/games` 前缀**。

## 构建与发布（生产在服务器，本地只读参考）
```bash
ssh myapp
cd /root/notelab-c && npm run build && pm2 restart notelab-c
```
- **只用 npm，不要用 pnpm**：`preinstall` 脚本会拦截（已移除，别再加回）。
- 清理构建产物用 `rm -rf`：本机 npm 相关删除会被 safe-delete 策略拦 trash 操作。

## ⚠️ 本仓没有测试脚本
仓库与服务器上**没有** `tests/` 目录，`package.json` 只有 `dev` / `build` / `start` 三个脚本。

若在**本地镜像**（`E:\code\NoteLab\notelab-c`）看到 `tests/`、`lib/vs-render.ts`，或 `test:vs` / `test:spire` / `test:games` 脚本——那是**从未入库、服务器上也不存在的过期遗留**（该镜像的 `app/vs/page.tsx` 等文件同样比仓库版本旧）。**不要把它们当成本仓结构，更不要据此改动**。需要准确版本时以服务器 `/root/notelab-c` 为准。

## 纪律与禁区
- **测试账号凭据在 `account.json`**（字段 `account` / `password`），已入 `.gitignore`。需要登录态做验收时读该文件登录；**严禁**把明文写进代码、文档或提交进仓库。
- 不动 `myapp`（旧前端）、`notelab`（旧 Python 版）、`notelab-b`（后端管理台）。本仓只消费 B 端**已发布**的剧本 / 尖塔内容（`trpg_scenarios.published`）。
- 本目录是**镜像**：真正生效的代码在服务器 `/root/notelab-c`。别只在本地改。
