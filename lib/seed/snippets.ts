import type { SeedItem } from "@/lib/memory";

/**
 * 片段库种子 —— 高频、可直接复制的片段。变量用 {{name}} 占位，界面渲染成输入框。
 * 全部来自本项目正在用的真实命令，不是网上抄的通用模板。
 */

/** 从模板体里抽出 {{var}} 变量名 */
export function extractVars(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/** 用变量表插值 */
export function interpolate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export const SEED_SNIPPETS: SeedItem[] = [
  {
    id: "sn-001",
    kind: "snippet",
    title: "git 拉齐服务器代码（防御性）",
    body: "cd {{repo}}\ngit fetch --prune\ngit reset --hard origin/main\ngit clean -fd",
    tags: ["Git", "部署"],
    extra: { note: "分支不是 main 时把 origin/main 换掉" },
  },
  {
    id: "sn-002",
    kind: "snippet",
    title: "C 端全量部署（含架构门禁）",
    body: "ssh myapp 'cd /root/Notelab/notelab-c \\\n  && git pull --ff-only \\\n  && npm run build \\\n  && pm2 restart notelab-c'\n# 紧急绕过门禁：SKIP_ARCH=1",
    tags: ["部署", "notelab-c"],
  },
  {
    id: "sn-003",
    kind: "snippet",
    title: "Java 打包编译验证",
    body: "cd /root/Notelab/notelab-java\nmvn package -DskipTests\n# ⚠️ Java 参数列表不允许尾逗号（曾带病上线）",
    tags: ["Maven", "Java"],
  },
  {
    id: "sn-004",
    kind: "snippet",
    title: "MySQL 免密进库 / root 的两种姿势",
    body: "mysql <库名>        # 走 /root/.my.cnf，notelab 账号\n# root 必须加 --no-defaults，否则 .my.cnf 盖掉 -u root：\nsudo mysql --no-defaults -u root --socket=/var/run/mysqld/mysqld.sock",
    tags: ["MySQL", "服务器"],
  },
  {
    id: "sn-005",
    kind: "snippet",
    title: "EXPLAIN 对比（同一个查询前后）",
    body: "EXPLAIN ANALYZE {{sql}};\n-- 看 key（实际选用），别看 possible_keys；\n-- filesort 不是原罪，行数才是",
    tags: ["MySQL", "调优"],
  },
  {
    id: "sn-006",
    kind: "snippet",
    title: "CDP 抓页面几何（headless Chrome）",
    body: "chrome --headless=new --remote-debugging-port={{port}} \\\n  --user-data-dir={{profile}} --no-proxy-server \\\n  --window-size={{w}},{{h}} about:blank\n# ⚠️ 必须 --no-proxy-server：本机 HTTPS_PROXY 会被继承导致整页连不上",
    tags: ["CDP", "验证"],
  },
  {
    id: "sn-007",
    kind: "snippet",
    title: "nginx 本机安全改法",
    body: "cp /etc/nginx/sites-enabled/notelab /root/backups/nginx-notelab.bak\nnginx -t && systemctl reload nginx\n# ⚠️ 本机 nginx <1.25：写 listen 443 ssl http2;（不支持 http2 on;）",
    tags: ["Nginx", "服务器"],
  },
  {
    id: "sn-008",
    kind: "snippet",
    title: "pm2 启动（cwd 必须等于仓目录）",
    body: "cd {{repo_dir}} && pm2 start {{proc_file}}\n# ⚠️ 改过启动配置必须 pm2 save，否则重启机器回到旧配置",
    tags: ["PM2", "部署"],
  },
  {
    id: "sn-009",
    kind: "snippet",
    title: "造超管会话 token（零侵入）",
    body: "# token = base64url(\"<uid>.<exp>.<hmac_sha256_hex(uid.exp)>\")，密钥取默认字面量\n# super_admin uid 实测 admin=18 → 换 uid 即可验任意超管接口，不用改用户表",
    tags: ["RBAC", "技巧"],
  },
  {
    id: "sn-010",
    kind: "snippet",
    title: "备份优先：改生产库前",
    body: "mysqldump -u notelab {{db}} > /root/backups/{{db}}-$(date +%F).sql\n# 改结构前必做；还原时注意哈希含 $，别用会二次展开的引号",
    tags: ["备份", "MySQL"],
  },
  {
    id: "sn-011",
    kind: "snippet",
    title: "tailwind 任意值类验证（部署后）",
    body: "curl -s https://haolo.cloud{{css_path}} | grep -c 'min-w-\\[15\\.5rem\\]'\n# 部署三项验证：HTTP 状态码 / 字节数变化 / 任意值类真的进了生产 CSS",
    tags: ["Tailwind", "验证"],
  },
  {
    id: "sn-012",
    kind: "snippet",
    title: "阶段文档一键开工",
    body: "bash scripts/new-stage.sh {{周次}} {{主题}}\n# 从 stages/_TEMPLATE.md 生成空文档，把开工成本压到接近零",
    tags: ["流程", "qa-community"],
  },
];

export default SEED_SNIPPETS;
