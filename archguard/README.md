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

扫描三仓实测（`~2s`）：

```
节点 55 · 依赖边 77 · 循环依赖环 1 · 规则违规 1（error 0）
  notelab-java: 节点10 边22 文件128 | notelab-b: 节点32 边39 文件69 | notelab-c: 节点13 边16 文件63
```

⚠️ `exit 1` 是**门禁的正常结果**（`error > 0`）—— 有违规时故意返回 1 就是门禁语义，
不是扫描失败。真正失败要看**报告有没有生成**（`run.sh` 里判的是这个）。

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
| `no-controller-to-dao` | error | controller 不得直接依赖 **mapper / entity**（真持久层） |
| `no-service-to-controller` | error | service 不得反向依赖 controller（分层倒灌） |
| `no-controller-to-entity` | warn | controller 直接引用 entity 持久化模型 |

**文件规则**（判据在**单个文件内部**）：

| 规则 | 级别 | 判据 |
|---|---|---|
| `no-bypass-existing-service` | error | 同一文件 import 的 service 已封装某个 dao，却绕过它直调该 dao |

**节点规则**（判据落在模块自身，不依赖边）：

| 规则 | 级别 | 判据 |
|---|---|---|
| `no-deprecated-home` | warn | 扫到已废弃的 `home/` 目录（已并入 `app/(home)/`，却还留在仓里） |

### 架构口径（2026-10-01 校准，别改回去）

`no-controller-to-dao` **不**禁 controller→dao：notelab-java 的 dao 是**无状态静态门面**
（`FooDao.xxx()` 就是函数调用，全仓 0 处 `@Autowired Dao`），而 `service/` 只有 7 个类、
覆盖不了 19 个 controller，`service` 自己也 import dao。**要求「一律经 service」物理上做不到**，
硬判会让 error 永不归零、门禁永远接不进部署——那是规则在制造噪音，不是架构问题。
真持久层（mapper / entity）才禁；「有 service 却绕过它」交给 `no-bypass-existing-service`。

`Db` / `DbSchema` / `DaoSupport` 虽在 `dao` 包下，但它们是连接池 / DDL / 基类，
在 `build-graph.js` 里归到 **infra 层**，不算业务持久层（否则 `MenuController` 之类的启动依赖会被误报）。

当前基线：**error 0**，只剩 1 条 `no-deprecated-home` warn（真实已知项，不在门禁拦截范围）。
2026-10-01 已据此把 7 个 controller 的绕过调用收敛到对应 service（60 个转发方法），编译与接口均验证通过。

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

## M3：接进部署门禁（已上线）

`notelab-java/ops/sync-deploy.sh` 的 **notelab-c 分支**在 `npm run build` 之前跑 `archguard_gate`：

- 只有变更碰了 `src/` 或 `archguard/src/` 才扫（archguard 自带 node_modules，约 2s）
- `index.js` 退出码 `1` == 有 error 违规 → 判为「架构退步」并 `die` 中止部署
- 退出码其它非零 → 判为扫描器本身坏了（不是架构问题），同样中止
- 报告落 `arch-report.json`，直接看是哪条边
- 紧急绕过：`SKIP_ARCH=1`

⚠️ 此前刻意**不接**：基线有 1 个 error，一接会让所有 notelab-c 部署失败。清完 error 才接。

## 路线图

- [x] M1 扫描引擎 + 规则 + 门禁
- [x] M2 快照入库（MySQL）+ 趋势查询 API（查询端仍在 notelab-java 后端）
      —— 2026-10-01 从 `notelab-java/ops/archguard` 迁入本仓，本体只有一个，别去找第二份
- [x] M3 接进 `notelab-c` 部署门禁（error 基线归零后才敢接）
- [ ] M4 依赖图谱可视化（力导向图）+ 把 warn（如 `no-deprecated-home`）也接进门禁 Observe 看板
