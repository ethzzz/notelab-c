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

## 美术与音效：全是代码，仓库里没有任何素材文件

**`public/` 目录不存在**。爬塔（`/spire`）的外观与声音**全部内联在代码里**，找素材包是走错方向：

| 层 | 文件 | 做法 |
|---|---|---|
| 形象精灵 | `components/SpireSprites.tsx` | 内联 SVG（渐变塑体积 + 细描边 + 地面投影 + CSS 待机呼吸）；未知 id 回退 emoji |
| 地图美术 | `components/SpireMap.tsx` | 内联 SVG + 按幕主题取色（`ACT_THEMES` / `actAccent` / `actThemeName`） |
| 出牌动作 | `app/spire/page.tsx` | CSS `@keyframes`（突进 / 弹道 / 护盾环 / 能量粒），按「卡牌类型 × 角色」分派 |
| 音效 | `lib/spire-audio.ts` | **Web Audio API 实时合成**，24 种音效，零音频文件 |

- 依据是 `docs/TASK-PROMPT-SPIRE-ACTS.md` 的「资源约束」：**禁止外链图片 / emoji 当主形象 / 第三方图标库 / 受版权素材**。上述做法即为守住该约束。
- **要换成真实录音音效**：音频放进 `public/sounds/`（需新建该目录），在 `lib/spire-audio.ts` 顶部的 `FILE_SOURCES` 登记一次即可 —— 命中走文件、拉取或解码失败自动回落合成音，**调用方无需改动**。注意同文件的 `SOUND_DIR` 常量硬编码了 `/games/sounds/`，**与 `next.config.ts` 的 basePath 绑定**，改前缀须同步。
- 合成音效不涉及第三方素材，**因此不需要 credits 署名**。若日后引入 CC BY / CC BY-SA 类素材，须在页面加署名区块；CC BY-SA / GPL 有传染性，**不要引入**。
- **改音效参数的验证方式**（构建期查不出静默哑音）：`exponentialRampToValueAtTime` 的目标必须是非零正数，传 0 / 负数会抛 `RangeError`，而 `sfx()` 全身 `try/catch`，越界只会**静默没声音**。做法是写一个 stub `AudioContext`（实现 `createGain/createOscillator/createBufferSource/createBiquadFilter/createBuffer` 并断言所有参数为有限数、指数斜坡目标为正），遍历全部音效 × 若干档音高，检查每个都产生了声源。Node 22 可直接跑：`node --experimental-strip-types <脚本>`（注意 strip-only 模式**不支持 TS 参数属性** `constructor(public x: T)`）。

- **改地图/精灵等视觉怎么验收**（构建期同样查不出"丑"）：盘面是 HTML div + inline style，**不能**用 resvg / SSR 渲染（`artwork-preview` 技能的 resvg 路线不适用；SSR 也跑不了测连线的 `useEffect`）。做法是搭一个独立**样式对照页**：把 `SpireMap.tsx` 里与缺陷相关的样式抽出来、常量驱动，一次渲染「改前 vs 改后 / 多幕 / 多状态」，再用**系统 Chrome 无头截图**读图验收：
  ```bash
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
    --hide-scrollbars --window-size=1000,2100 --virtual-time-budget=3000 \
    --screenshot="E:\...\out.png" "file:///E:/.../page.html"
  ```
  两条纪律：① **先让对照页复现已知缺陷**，复现不了就说明样式抄错了，此时"改后好看"没有意义；② 对照页只证明"这几条样式改对了"，**不等于**真实页面已对（父级背景、层叠、暗色变量都没覆盖）。
  - 已知坑：包裹层 flex 居中 + 子元素 `width:100%` → 解析成 **0 宽**（截图只剩一条 1px 竖线）；`--screenshot` 会早于 JS 注入内容 → 先 `--dump-dom > page.static.html` 固化再截。
  - 方法与"用 canvas 复现渐变、量横向亮度跳变来证明硬边消失"的技巧，见技能 `artwork-preview` 的「真浏览器路线」。
- **Tailwind 裸数值类会静默失效**：`opacity-55` / `opacity-60` 在 v4 里**确实会生成**，但务必核一次——
  `grep -rho '\.opacity-6[05]{[^}]*}' .next/static/chunks/*.css`。类若没生成，元素保持 `opacity:1`，**不报错**。
  注意 CSS 产物在 `.next/static/chunks/*.css`，**没有** `.next/static/css/` 这个目录。

## ⚠️ 本仓没有测试脚本

仓库与服务器上**没有** `tests/` 目录，`package.json` 只有 `dev` / `build` / `start` 三个脚本。

若在**本地镜像**（`E:\code\NoteLab\notelab-c`）看到 `tests/`、`lib/vs-render.ts`，或 `test:vs` / `test:spire` / `test:games` 脚本——那是**从未入库、服务器上也不存在的过期遗留**（该镜像的 `app/vs/page.tsx` 等文件同样比仓库版本旧）。**不要把它们当成本仓结构，更不要据此改动**。需要准确版本时以服务器 `/root/notelab-c` 为准。

## 纪律与禁区
- **测试账号凭据在 `account.json`**（字段 `account` / `password`），已入 `.gitignore`。需要登录态做验收时读该文件登录；**严禁**把明文写进代码、文档或提交进仓库。
- 不动 `myapp`（旧前端）、`notelab`（旧 Python 版）、`notelab-b`（后端管理台）。本仓只消费 B 端**已发布**的剧本 / 尖塔内容（`trpg_scenarios.published`）。
- 本目录是**镜像**：真正生效的代码在服务器 `/root/notelab-c`。别只在本地改。
