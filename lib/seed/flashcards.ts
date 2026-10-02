import type { SeedItem } from "@/lib/memory";

/**
 * 速查卡种子 —— 全部来自本项目 **真踩过** 的坑，不是凑数的百科词条。
 * 由大模型在开发阶段产出并固化成常量；运行期不依赖任何大模型接口。
 * 重灌入口：scripts/gen-seed.mjs（key 恢复后可增量补第二批，不改工具代码）。
 */
export const SEED_FLASHCARDS: SeedItem[] = [
  {
    id: "fc-001",
    kind: "flashcard",
    title: "Next 16 两个 route group 解析同一 URL",
    body: "Q：app/(play)/play/x 和 app/(shell)/x 会怎样？\nA：build 直接报 two parallel pages resolve to the same path。所以新建全屏路由组必须换前缀（如 /play/*），换前缀就必须同时留重定向（next.config 的 308），否则老书签 404。",
    tags: ["Next.js", "路由", "踩坑"],
  },
  {
    id: "fc-002",
    kind: "flashcard",
    title: "git check-ignore 对不存在的目录假阴性",
    body: "Q：gitignore 写了 `.agent/` 但 check-ignore 说没命中？\nA：目录型规则只对**存在**的目录生效。加 `--no-index` 才能对未跟踪路径正确判定：`git check-ignore -q --no-index <path>`。",
    tags: ["Git", "踩坑"],
  },
  {
    id: "fc-003",
    kind: "flashcard",
    title: "CSS @layer 里永远输给裸规则",
    body: "Q：为什么软导航回来样式串了？\nA：@layer base 里的规则**永远**输给 unlayered 规则。对方是裸 body{}（unlayered），你的 @layer 版本再“更具体”也没用。解法：把基础规则移出 @layer、加 html 前缀提到 (0,0,2)。",
    tags: ["CSS", "Tailwind", "踩坑"],
  },
  {
    id: "fc-004",
    kind: "flashcard",
    title: "Tailwind 任意值类与生产 CSS 生成",
    body: "Q：`opacity-55`、任意值写进代码就一定进产物吗？\nA：Tailwind 只在**源码文本**里匹配类名字面量。动态拼接（`className={'opacity-'+n}`）不会生成。任意值 `min-w-[15.5rem]` 会被原样编译，部署后要用 HTTP 抓 CSS 验证字节数真的变了。",
    tags: ["Tailwind", "构建"],
  },
  {
    id: "fc-005",
    kind: "flashcard",
    title: "PM2 改启动配置必须 save",
    body: "Q：为什么改了启动脚本重启后不生效？\nA：pm2 restart 不刷新快照。改进程启动配置后必须 `pm2 save`，否则重启机器就回到旧配置。",
    tags: ["PM2", "部署"],
  },
  {
    id: "fc-006",
    kind: "flashcard",
    title: "凭据只放进程环境会丢",
    body: "Q：MySQL 密码写在 pm2 env 里为什么重启就崩？\nA：进程 env 不落盘。必须写进仓内 .env，且**pm2 启动 cwd 必须等于仓目录**（AppConfig 按 CWD 读）。查进程真实 env 用 `pm2 jlist` 的 pm2_env。",
    tags: ["部署", "凭据", "踩坑"],
  },
  {
    id: "fc-007",
    kind: "flashcard",
    title: "curl 猜路由会误判接口坏了",
    body: "Q：GET /api/perm/roles 返回 405 是接口坏了？\nA：不，它是 POST。405/404 ≠ 接口故障，先读 controller 的 @XxxMapping。真路由是 /api/perm/overview、/api/perm/users（GET）。",
    tags: ["Spring", "调试"],
  },
  {
    id: "fc-008",
    kind: "flashcard",
    title: "SSH 叠引号会吃掉转义",
    body: "Q：ssh 里拼 cookie 为什么总 401？\nA：嵌套引号中的 \\\" 会变成字面反斜杠，cookie 名被破坏。改用 heredoc 送命令：`ssh myapp <<'REMOTE' ... REMOTE`。",
    tags: ["SSH", "踩坑"],
  },
  {
    id: "fc-009",
    kind: "flashcard",
    title: "验证超管别改用户表",
    body: "Q：怎么零侵入验超管接口？\nA：造会话 token = base64url(\"<uid>.<exp>.<hmac_sha256_hex(uid.exp)>\")，密钥取 AppConfig.secretKey()（服务器没配 SECRET_KEY 就是默认字面量）。super_admin uid 实测 admin=18。验完不用收尾。",
    tags: ["RBAC", "技巧"],
  },
  {
    id: "fc-010",
    kind: "flashcard",
    title: "MySQL 索引不是加就快",
    body: "Q：加了 idx_tag_q 反而变慢？\nA：`ORDER BY hot_score LIMIT 20` 下优化器扫 24 行就够，索引是负收益。看 EXPLAIN 要看 **key**（实际选用）而非 possible_keys；filesort 不是原罪，排 77 行远小于排 785 行。",
    tags: ["MySQL", "索引"],
  },
  {
    id: "fc-011",
    kind: "flashcard",
    title: "Spring @Value 绑不了 YAML 列表",
    body: "Q：@Value(\"${list}\") 配 YAML 数组为什么是空？\nA：@Value 绑不上 YAML 列表。写成逗号分隔字符串再 `split(\",\")`。另：JDBC characterEncoding=utf8mb4 非法（只认 Java 字符集名，写 UTF-8）。",
    tags: ["Spring", "Java"],
  },
  {
    id: "fc-012",
    kind: "flashcard",
    title: "MySQL root 不能用密码",
    body: "Q：root -p 登录报 ERROR 1698？\nA：Ubuntu 的 root 走 auth_socket。正解 `sudo mysql --no-defaults -u root --socket=/var/run/mysqld/mysqld.sock`（--no-defaults 必须加，否则 .my.cnf 会盖掉 -u root）。",
    tags: ["MySQL", "服务器"],
  },
  {
    id: "fc-013",
    kind: "flashcard",
    title: "Dao 重载会被方法名 Map 吃掉",
    body: "Q：自动生成 service 转发时签名怎么选？\nA：Dao **按方法名存 Map 会静默丢重载**（createTrpgPlay 有 3 参/4 参两版）。必须按「方法名 + 实参个数」选，且实参个数要跨行统计（调用可能换行续写）。",
    tags: ["ArchGuard", "Java"],
  },
  {
    id: "fc-014",
    kind: "flashcard",
    title: "ArchGuard 有 error 时故意返回 1",
    body: "Q：门禁脚本为什么 rc=1 还算是正常？\nA：index.js 有 error 时故意返回 1（门禁语义），跑门禁本来就可能得到 1。判「报告有没有生成」才算真失败。run.sh 不能因 rc≠0 就退出。",
    tags: ["ArchGuard", "CI"],
  },
  {
    id: "fc-015",
    kind: "flashcard",
    title: "sync-deploy 已是最新就什么都不做",
    body: "Q：加了 --build 为什么门禁没跑？\nA：脚本在「已是最新」时 before=after 直接 return，--build 也救不回来。想触发门禁必须有真实新 commit。SKIP_ARCH=1 可紧急绕过。",
    tags: ["部署", "CI", "踩坑"],
  },
  {
    id: "fc-016",
    kind: "flashcard",
    title: "Chrome 继承代理会整页连不上",
    body: "Q：headless CDP 抓页面显示“未连接到互联网”，四个路由数据一模一样？\nA：本机 HTTPS_PROXY 被 Chrome 子进程继承。spawn 时加 `--no-proxy-server`。否则极易误判成“路由没生效”。",
    tags: ["CDP", "调试", "踩坑"],
  },
  {
    id: "fc-017",
    kind: "flashcard",
    title: "Node 22 内置 WebSocket 没有 .on()",
    body: "Q：CDP 脚本连不上 ws？\nA：Node 22 内置 WebSocket 是 EventTarget 实现，**没有 `ws.on()`**，要用 `addEventListener`。另：`/json/new` 新版 Chrome 要 PUT；target.id ≠ sessionId，得先 Target.attachToTarget{flatten:true}。",
    tags: ["CDP", "Node", "踩坑"],
  },
  {
    id: "fc-018",
    kind: "flashcard",
    title: "大文件 Write 可能静默不落盘",
    body: "Q：Write 报成功但文件是旧的？\nA：~17KB+ 的大文件 Write 可能报成功却不写。写完必须 `ls` 验证大小/时间，别信返回码。",
    tags: ["工具坑"],
  },
  {
    id: "fc-019",
    kind: "flashcard",
    title: "dvh 与 vh 在移动端的差别",
    body: "Q：canvas 高度在手机上算错？\nA：`100vh` 用的是**最大**地址栏高度（有利地址栏，画面会被压）；`100dvh` 是当前可视高度。移动端游戏区一律用 dvh；容器由外壳定死 h-[100dvh] 后，页面内不要再写 `calc(100dvh - Xrem)` 去猜外壳吃多少。",
    tags: ["CSS", "移动端"],
  },
  {
    id: "fc-020",
    kind: "flashcard",
    title: "bash 双引号会二次展开哈希",
    body: "Q：trap 里的 PBKDF2 哈希怎么被吃空了？\nA：哈希含 `$`，`trap \"...$VAR...\"` 双引号会二次展开。还原要用扁平单展开。同类坑：备份前先 mysqldump，改生产库结构前先备份。",
    tags: ["Bash", "备份"],
  },
];

export default SEED_FLASHCARDS;
