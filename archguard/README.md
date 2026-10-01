# ArchGuard —— 跨仓架构守护

扫描 notelab-java / notelab-b / notelab-c **三个仓的真实源码**，建统一依赖图，用图算法和架构规则找出
循环依赖与分层违规，最后以**退出码当门禁**（`error > 0` → exit 1），可直接接 CI / 部署脚本。

**不依赖任何大模型**，纯 AST 静态分析 + 图算法，结果完全确定可复现。

## 为什么放在 notelab-c 里

本目录是 notelab-c 仓内的**独立子包**（有自己的 `package.json` 与 `node_modules`，不参与 `next build`），
不是 Next.js 源码目录，所以放在根目录而非 `app/`。选 notelab-c 是因为三仓在工作区与服务器上都是
**同级兄弟目录**（`E:\code\NoteLab\`、`/root/`），扫描器从自身位置向上三级即可定位另两仓。

> 依赖隔离在 `archguard/node_modules`，不会污染 `notelab-c` 根依赖，也不影响 `next build`。

## 用法

```bash
# 首次 / 依赖变更后
cd archguard && npm install

# 扫描（报告写 arch-report.json，error>0 时退出码 1）
node src/index.js               # 或 npm run scan

# 扫描 + 快照入库（写入端直连 MySQL，凭据走 /root/.my.cnf，不需要超管会话）
bash run.sh                     # 跑完再落库
bash run.sh --no-persist        # 只扫描不入库
bash run.sh --dry               # 只打印将要执行的 SQL，不连库

# 只要门禁（CI 里用）
npm run scan
```

扫描三仓实测（`~2.5s`）：

```
节点 55 · 依赖边 76 · 循环依赖环 1 · 规则违规 2（error 1）
  notelab-java: 节点10 边21 文件128 | notelab-b: 节点32 边39 文件69 | notelab-c: 节点13 边16 文件63
```

## 流水线

| 阶段 | 文件 | 干什么 |
|---|---|---|
| 解析 Java | `src/extract-java.js` | `java-parser` 出 CST，自己写 unwrap 遍历抽 `package` + `import` |
| 解析 TS | `src/extract-ts.js` | `ts-morph` 抽静态 import / `export..from` / 动态 `import()` |
| 建图 | `src/build-graph.js` | 统一成 `仓库:模块` 节点 + 依赖边（包级粒度） |
| 分析 | `src/analyze.js` | Tarjan 强连通分量找环 + 规则集判违规 |
| 入口 | `src/index.js` | 汇总、打印、写报告、`exit 1` |
| 落库 | `src/persist.js` | 快照写 `arch_scan_runs` / `arch_scan_cycles` / `arch_scan_violations` |

## M2 落库与查询端职责分离

- **写入端 = 这里**（`run.sh` → `persist.js`），CLI 直连 MySQL，凭据走 `/root/.my.cnf`（chmod 600，
  密码不上命令行、不进 git）。刻意不复用超管会话：扫描器只在服务器本地跑，没必要为此新开一套口令体系。
- **查询端 = 后端** `notelab-java` 的 `/api/arch/{summary,trend,runs/{id}}`（超管）。
  ⚠️ 后端**没有**也不该有对应的 POST 写入接口——写入只认本地 CLI。
- 建表在后端那边，本目录只负责往里插数；`run.sh --dry` 可离线预览生成的 SQL（校验转义用）。

## 规则集

**边规则**（模块 → 模块）：

| 规则 | 级别 | 判据 |
|---|---|---|
| `no-controller-to-dao` | error | controller 不得直接依赖 mapper / dao / entity（应经 service） |
| `no-service-to-controller` | error | service 不得反向依赖 controller（分层倒灌） |
| `no-controller-to-entity` | warn | controller 直接引用 entity 持久化模型 |

**节点规则**（判据落在模块自身，不依赖边）：

| 规则 | 级别 | 判据 |
|---|---|---|
| `no-deprecated-home` | warn | 扫到已废弃的 `home/` 目录（已并入 `app/(home)/`，却还留在仓里） |

⚠️ 当前基线并非干净——`no-controller-to-dao` 那条正是把 7 个 Java 包串成环的引线。
门禁对 **warn** 不返回非零，只有 **error** 会让 `exit 1`，所以先清 error 再谈 warn。

## 已知坑（都在这上面踩过，改代码前先看）

1. **`java-parser` v3 只有 `parse` 没有 `simplify`**，且 CST 的 children 值**可能是数组或 `{name,children}` 包装层**。
   直接读 `.children.packageOrTypeName` 会拿到数组 → `.children` 是 undefined → **import 静默全丢、零报错**，
   只表现为「依赖边为 0」。`extract-java.js` 的 `unwrap` 统一吃掉两层，别删。
2. **`ts-morph@28` 没有 `getDynamicImports()` / `getImportEqualsDeclarations()`**（`typeof` 直接是 undefined）。
   用 `getImportStringLiterals()` 一次覆盖静态 import + `export..from` + 动态 `import()`。
3. **节点粒度必须截到包级**：把类名塞进节点 id（`com.notelab.dao.UiConfigDao`）会让「按末段判层」取到
   `UiConfigDao`，规则永不命中；`build-graph.js` 的 `javaTarget` 末段若以大写字母开头就 pop 掉。
4. **Windows 下 Git Bash 的 `/e/code/...` 会被 node 理解成 `E:\e\code\`**，所有路径一律用 `path.join(__dirname, ...)`。
5. 报告产物 `arch-report.json` 已在 `.gitignore` 里，别 `git add -f`。

## 路线图

- [x] M1 扫描引擎 + 规则 + 门禁
- [x] M2 快照入库（MySQL）+ 趋势查询 API（查询端仍在 notelab-java 后端）
      —— 2026-10-01 从 `notelab-java/ops/archguard` 迁入本仓，本体只有一个，别去找第二份
- [ ] M3 依赖图谱可视化（力导向图）
- [ ] M4 接进部署门禁 ⚠️ **现在不能接**：基线还有 1 个 `error`（`controller → dao`），
      一接就会让所有部署直接失败。先清 error 再谈门禁自动化。
