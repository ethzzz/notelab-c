#!/usr/bin/env bash
# ArchGuard 扫描 + 入库。用法（在 notelab-c 仓内执行）：
#   bash archguard/run.sh                 # 扫描并入库
#   bash archguard/run.sh --no-persist    # 只扫描不入库
#   bash archguard/run.sh --dry           # 只入库预览（打印 SQL，不连库）
#   bash archguard/run.sh --no-persist --dry  # 两者都不做，等价于只扫描
# 输出报告落在本目录 arch-report.json。凭据走 /root/.my.cnf（见 src/persist.js）。
#
# ⚠️ 2026-10-01 从 notelab-java/ops/archguard 迁入本仓（notelab-c）——ArchGuard 扫的是
#    三个仓，本就不是 notelab-java 的内部工具；M2 的查询端（/api/arch/*）仍留在后端，
#    写入端（本脚本的 persist.js）迁过来后，服务器上跑扫描的地方也跟着换到 /root/notelab-c。
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -d node_modules ]; then
  echo "[archguard] 首次运行，安装依赖（java-parser + ts-morph）..."
  npm ci --no-audit --no-fund || exit 3
fi

WANT_PERSIST=1
WANT_DRY=0
for a in "$@"; do
  if [ "$a" = "--no-persist" ]; then WANT_PERSIST=0; fi
  if [ "$a" = "--dry" ]; then WANT_DRY=1; fi
done

node src/index.js "$@"
rc=$?
# ⚠️ 不能因为 rc 非零就退出：index.js 有 error 级违规时**故意**返回 1（门禁语义），
# 这是扫描的正常结果而不是扫描失败。早期版本写成 `[ "$rc" -ne 0 ] && exit "$rc"`，
# 结果只要基线存在 error（现在就有 controller→dao 那一处），落库就永远跑不到。
# 只有报告压根没生成才算真失败。
if [ ! -f "$DIR/arch-report.json" ]; then
  echo "[archguard] 扫描未产出报告（index.js 退出码 $rc），终止" >&2
  exit 3
fi

if [ "$WANT_PERSIST" -eq 0 ]; then
  echo "[archguard] --no-persist：未入库（扫描退出码 $rc）"
  exit "$rc"
elif [ "$WANT_DRY" -eq 1 ]; then
  node src/persist.js --report "$DIR/arch-report.json" --dry
else
  node src/persist.js --report "$DIR/arch-report.json"
fi
exit $?
