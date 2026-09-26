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

## 构建与发布（本地改 → 服务器从 git 同步）
```bash
# 本地：改完提交推送
git push origin main
# 服务器：同步 + 构建 + 重启一条命令搞定
ssh myapp "/root/notelab-java/ops/sync-deploy.sh notelab-c"
```
- **不要在 `/root/notelab-c` 里手改代码**——服务器是只读部署目标；脚本发现工作区脏会直接拒绝执行。完整行为与参数见根 `AGENTS.md`「开发流程」。
- 脚本只在**有变更**时构建；仅文档变更自动跳过（强制构建加 `--build`）；**构建失败不会重启服务**，老进程继续服务。
- **只用 npm，不要用 pnpm**：`preinstall` 脚本会拦截（已移除，别再加回）。
- 清理构建产物用 `rm -rf`：本机 npm 相关删除会被 safe-delete 策略拦 trash 操作。

## 美术与音效：代码内联为主，`public/spire/` 是唯一例外（2026-09-26 起）

爬塔（`/spire`）的声音**仍然全部合成**（零音频文件），外观大部分内联在代码里；
**唯一入仓的素材是地图节点素材包 `public/spire/`**（`svg/`+`png/` 是矢量层，`art/` 是整图层，另有 manifest / 生成配置 / 样例图）。

| 层 | 文件 | 做法 |
|---|---|---|
| 地图节点整图 | `public/spire/art/icon-*.png` | **素材包整图**，经 `NODE_META.art`（带 basePath 前缀 `/games`）用 `<img>` 铺满节点；event 无整图、回落到「圆盘 + 自绘线描」 |
| 地图连线整图 | `public/spire/art/link-straight.png` | 沿**直弦**拉伸（`preserveAspectRatio="none"`）+ 按弦角旋转；状态只用透明度区分，可选态再叠一条流动虚线 |
| 地图生成规则 | `public/spire/map-gen.config.json` | **生成配置**（权重 / 最小层数 / 揭示池 / 最大列数），被 `lib/spire-engine.ts` import —— 调平衡改这里，别在代码里写魔数 |
| 形象精灵 | `components/SpireSprites.tsx` | 内联 SVG（渐变塑体积 + 细描边 + 地面投影 + CSS 待机呼吸）；未知 id 回退 emoji |
| 地图盘面美术 | `components/SpireMap.tsx` | 内联 SVG + 按幕主题取色（`ACT_THEMES` / `actAccent` / `actThemeName`） |
| 出牌动作 | `app/spire/page.tsx` | CSS `@keyframes`（突进 / 弹道 / 护盾环 / 能量粒），按「卡牌类型 × 角色」分派 |
| 音效 | `lib/spire-audio.ts` | **Web Audio API 实时合成**，24 种音效，零音频文件 |

- 素材包来源是**自产**（非第三方素材库），所以不触发「禁止第三方图标库 / 受版权素材」那条约束；
  **外链图片与 emoji 当主形象仍是禁区**，别因为有了 `public/` 就开始外链图片。
- **两层的分工**（见 `public/spire/manifest.json` 的 `spec.artNote` / `composition.artNote`）：
  - `art/` 是**整图层**：圆形整幅画，自带"石质外环 + 外沿烟雾"，**没有矢量源**，原生尺寸各不一致（320~760，那只是导出尺寸、不是显示尺寸）。
    渲染时铺满节点并轻微出血（`ART_SCALE`），**圆盘底色/描边必须一起取消** —— 叠上去就变成"球里贴了张画"（已用对照页比过，见下方验收方法）。
  - `svg/`+`png/` 是**矢量图层**（`png` 是 `svg` 的 2 倍导出，`svgIsSourceOfTruth`）：**已不参与节点渲染**，只在类型 `art` 为 null 时由 SpireMap 的自绘线描兜底。
    要别的尺寸从 svg 重导，**不要放大 png**；但 `art/` 是位图，只能重采样。
  - 仍未接入：`state.*`（三态覆盖层）、`node.base`、`link.branch`。接入时按 manifest 的 `renderOrder`。
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
  - **三个必填参数**（缺任一个都可能静默失败）：`--screenshot=` 用**绝对路径**（写相对路径会以 `拒绝访问 (0x5)` 失败——headless 的 cwd 不是你的 cwd）；`--user-data-dir=` 显式给一个可写目录（用完删掉，会留几十 MB）；`--virtual-time-budget` 给图片/字体加载留时间（不给会截到破图占位符，很容易误判成"路径写错了"）。
  - 对照页里**绝对定位的图层必须显式给 `left/top` + `transform: translate(-50%,-50%)`**；只写 `position:absolute` 会全部塌到 static 位置叠成一团，看起来像"渲染坏了"。
  - **改配色/透明度时，对照页要三列**：`改前配色+改前取值`（基准）/ `改后配色+改前取值`（问题现场）/ `改后配色+修正取值`（修复）。另加一条**切在边界上**的放大条（左半前景内部、右半背景）——只放大中心没用，中心永远是最亮的地方。
  - **背景是渐变的，"必须比底色亮"这类不变量要在「最不利位置」算**：先从布局常量算出容器高与节点中心的 y 序列，只在元素真的会出现的那些 y 上取背景色算比值、取最小值（最亮的危险区常在中间某行，只比 `bgTop`/`bgBottom` 端点会漏）。亮度用 WCAG 相对亮度线性化，别用 `(r+g+b)/3`。
  - 方法与"用 canvas 复现渐变、量横向亮度跳变来证明硬边消失"的技巧，见技能 `artwork-preview` 的「真浏览器路线」。
- **Tailwind 裸数值类会静默失效**：`opacity-55` / `opacity-60` 在 v4 里**确实会生成**，但务必核一次——
  `grep -rho '\.opacity-[0-9]*{[^}]*}' .next/static/chunks/*.css | sort -u`。
  类若没生成，元素保持 `opacity:1`，**不报错**。注意 CSS 产物在 `.next/static/chunks/*.css`，**没有** `.next/static/css/` 这个目录。
  - ⚠️ 别把正则写成 `opacity-6[05]` 这种"按十位分组"的形式：它匹配不到 `opacity-55`，会让你误判成"类没生成"。
    用上面的全量 `opacity-[0-9]*` 一次列全最稳。
  - ⚠️ **带 `[]` 的任意值类不能用正则或 `grep` 搜**：`opacity-[0.76]` 在 CSS 里写作 `.opacity-\[0\.76\]`，**反斜杠是字面量**，正则中要写成 `\\\\`，在 shell 里几乎必然转义错——结果只匹配到 `--tw-grayscale:initial` 这类变量声明，从而**误判"类没生成"**（`.grayscale-[.4]` 与 `.opacity-[0.76]` 各踩过一次）。
    做法：`scp` 线上 `.next/static/chunks/*.css` 回本地，用 Python **纯子串查找**——`css.find(r".opacity-\[0\.76\]")`，找到后打印到 `}` 看规则体；顺带确认**旧类已被 tree-shake 移除**（不再被引用就该消失，否则可能核的是错的那份产物）。

## 已发布配置：素材槽位与地图方案（2026-09-26 起由 B 端下发）

B 端「爬塔尖塔工坊」拆成了 6 个子页，其中**素材资源**（`/admin/spire-editor/assets`）与
**地图生成**（`/admin/spire-editor/map`）产出的配置会随「发布到 C 端」下发给本仓。
C 端匿名接口 `/api/c/spire/content` 一次取回 4 个切片（`cards` / `characters` / `skills` / `charAccess`）
加上新增的 `assets` / `maps`，入口仍是 `lib/spire-content.ts` 的 `loadSpireContent()`。

| 切片 | C 端文件 | 消费点 | 缺失/非法时 |
|---|---|---|---|
| `assets`（槽位→素材路径） | `lib/spire-assets.ts` | `artForNodeType()`（节点整图）、`spireAssetUrl(LINK_SLOT)`（连线）、`spireAssetUrl(BG_MAP_SLOT/BG_HOME_SLOT)`（背景）、`charArtUrl()`（角色立绘，经 `SpireSprites`） | 逐槽位回落内置默认；`event` 槽位默认**故意为空**（走自绘圆盘） |
| `maps`（多套命名方案） | `lib/spire-maps.ts` | `makePublishedMapProvider()` → 注入引擎的 `setActMapProvider()`；引擎 `mapForAct()` 在 `newRun` / `enterNextAct` 取用 | `provider` 为 null → 全程本地 `generateMap()`；**粒度是单幕**：某幕缺失/非法只回落那一幕 |

**四条必须守住的约定**：

1. **槽位 key 是跨端契约**，B 端 `notelab-b/src/lib/spire-assets.ts` 的 `ASSET_SLOTS` / `char.<id>` 与本仓
   `lib/spire-assets.ts` 必须**同名同义**。改名不会报错，只会**静默失配 → 回落默认**，表现为
   「后台配了但线上没生效」。加槽位的顺序是「B 端注册表加一行 → C 端加消费点」。
   （`char.*` 是**开放命名空间**：B 端按运行时角色池动态生成槽位，所以新建工坊角色能立刻配立绘。）
2. **`revealedType` 会被引擎写回节点** → 已发布地图**每次取用都必须深拷贝**（`cloneAct`）。
   若三幕共用同一份对象，第二局开局就会继承上一局的揭示结果。这条有专门的断言守着
   （`.sync/verify-maps-e2e.js`，见下）。
3. **`s.maxFloor` 以实际用的那张图为准**（`map.layers`），因为后台可以生成非 16 层的图。
   但 `runDepth()` 的换算基数仍是 `MAP_ROWS` 常量（改它会让 localStorage 里的历史 best 值口径突变），
   所以自定义层数时「纪录档位」与页面上的「第 N/M 层」会不一致 —— 这是**已知取舍**，不是 bug。
4. **盘面背景图会破坏 `DISC_BG` 那条红线**：「圆盘最外圈必须比幕底色亮」是在**纯渐变底**下算的。
   任意用户图都可能更亮 → 节点糊进背景。`withBgImage()` 因此固定叠了一层近黑压暗层；
   换背景图后仍要目视确认一次（B 端槽位提示里写了「选低对比图」）。
   同理 `ART_BOX_K`（节点整图的尺寸归一系数）是按**素材包那六张图**量的，换构图差异大的图会偏大/偏小。

**验证脚本（在 `.sync/`，不入库）**：`.sync/verify-maps-e2e.js` 把 B 端生成器与本仓校验器**逐字转译**后对跑，
覆盖 4 种层数 × 5 个种子、808 条断言（结构不变量 / 深拷贝隔离 / defaultId 选择 / fail-open 单幕粒度 / 18 种坏数据必须被拒）。
```bash
node .sync/verify-maps-e2e.js     # 不需要服务器：用 notelab-b/node_modules 里的 typescript 转译
```
⚠️ 别用「节点数 + 首节点的 next」这类**弱指纹**判断两张图是否相同：层数少时（如 5 层、每幕 12 个节点）
弱指纹会误报"两幕一样"，实测三幕其实全不同。要指纹就用全量 `id:type>next`。

## ⚠️ 本仓没有测试脚本

仓库与服务器上**没有** `tests/` 目录，`package.json` 只有 `dev` / `build` / `start` 三个脚本。

若在**本地镜像**（`E:\code\NoteLab\notelab-c`）看到 `tests/`、`lib/vs-render.ts`，或 `test:vs` / `test:spire` / `test:games` 脚本——那是**从未入库、服务器上也不存在的过期遗留**（该镜像的 `app/vs/page.tsx` 等文件同样比仓库版本旧）。**不要把它们当成本仓结构，更不要据此改动**。需要准确版本时以服务器 `/root/notelab-c` 为准。

### 唯一的验证脚本：地图生成约束断言（在 `.sync/`，不入库）

`E:\code\NoteLab\.sync\verify-mapgen.js` 用来验证爬塔地图生成是否满足 `public/spire/map-gen.config.json` 的全部硬约束
（不交叉 / 无死路 / 无孤立 / 唯一 BOSS / BOSS 前一层全 rest / 最小层数 / 开局两层只许 normal+random / shop-rest 不直连 / 入口可达全部节点）。
它 transpile **真实引擎源码**来跑，不是重写一份逻辑——改了生成器或改了配置权重后**必须重跑**：

```bash
scp .sync/verify-mapgen.js notelab-c/lib/spire-engine.ts notelab-c/public/spire/map-gen.config.json myapp:/tmp/verify/
ssh myapp "node /tmp/verify/verify-mapgen.js /tmp/verify/spire-engine.ts /tmp/verify/map-gen.config.json 800"
# 验其它层数（确认生成器与层数无关）：VERIFY_LAYERS=7 前缀
```

⚠️ 它用 `ts.transpileModule`，**只剥类型、不做类型检查**——类型错误要靠服务器 `npx tsc --noEmit`，两者不能互相替代。

### ⚠️ 本仓的 `tsc` 是可信的（与 notelab-b 相反）

`npx tsc --noEmit` 在本仓输出干净、没有 notelab-b 那种「引用已删页面的陈旧 `.next/types`」噪音，
所以**可以把服务器上的 `npx tsc --noEmit` 当部署前预检**：scp 改动文件进 `/root/notelab-c` → tsc → `git checkout -- <file>` 还原 → 再 push。
两个仓的这条结论**不能混用**。

⚠️ 但它**只能在服务器上跑**：本仓本地 `node_modules` 是空的（不做本地安装），
而 `npx tsc` 一旦找不到 typescript，会去下**同名假包 `tsc@2.0.4`**（2015 年的空壳），
它打印「This is not the tsc command you are looking for」却**返回退出码 0** —— 典型的**假绿**，
千万别当类型检查通过。识别方法：看有没有 `npm warn exec The following package was not found` 这行。

## 纪律与禁区
- **测试账号凭据在 `account.json`**（字段 `account` / `password`），已入 `.gitignore`。需要登录态做验收时读该文件登录；**严禁**把明文写进代码、文档或提交进仓库。
- 不动 `myapp`（旧前端）、`notelab`（旧 Python 版）、`notelab-b`（后端管理台）。本仓只消费 B 端**已发布**的剧本 / 尖塔内容（`trpg_scenarios.published`）。
- 本目录是本地工作副本，**改这里**；服务器 `/root/notelab-c` 是只读部署目标（由 `ops/sync-deploy.sh notelab-c` 从 git 拉取）。别去服务器上改。
