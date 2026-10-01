const path = require('path');

function layerOf(nodeId) {
  const seg = nodeId.split(':');
  const tail = seg[1].split('.').pop();
  return tail;
}

function tarjanSCC(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) if (adj.has(e.from)) adj.get(e.from).push(e.to);

  let counter = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const comps = [];

  const strongConnect = (v) => {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) || []) {
      if (!idx.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comps.push(comp);
    }
  };

  for (const n of nodes) if (!idx.has(n.id)) strongConnect(n.id);
  return comps.filter((c) => c.length > 1);
}

// ⚠️ 架构口径（2026-10-01 校准，别再当成教科书三层）：
// notelab-java 的 dao 层是**无状态静态门面**（FooDao.xxx() 就是个函数调用，全仓 0 处 @Autowired Dao），
// 且 service/ 只有 7 个类覆盖不了 19 个 controller —— 要求「controller 一律经 service」物理上做不到，
// service 自己也在 import dao。所以 controller→dao 是**项目既定形态**，不是违规。
// 真持久层（mapper / entity）才禁；「有 service 却绕过它」由下面的 no-bypass-existing-service 管。
const RULES = [
  {
    id: 'no-controller-to-dao',
    level: 'error',
    desc: 'controller 不得直接依赖 mapper / entity（真持久层）；dao 为无状态静态门面，本项目放行',
    check: (e) => layerOf(e.from) === 'controller' && ['mapper', 'entity'].includes(layerOf(e.to)),
  },
  {
    id: 'no-service-to-controller',
    level: 'error',
    desc: 'service 不得反向依赖 controller（分层倒灌）',
    check: (e) => layerOf(e.from) === 'service' && layerOf(e.to) === 'controller',
  },
  {
    id: 'no-controller-to-entity',
    level: 'warn',
    desc: 'controller 直接引用 entity 持久化模型',
    check: (e) => layerOf(e.from) === 'controller' && layerOf(e.to) === 'entity',
  },
];

// 文件级规则：判据在**单个文件**内部（同一文件既走 service 又绕过它直调 dao）。
// 包粒度做不到——controller 包天然同时 import service 和 dao，按包判会永远命中。
const FILE_RULES = [
  {
    id: 'no-bypass-existing-service',
    level: 'error',
    desc: '同一域：import 的 service 已封装该 dao，controller 却绕过它直调——service 里的逻辑会被静默跳过',
    check: (f, ctx) => {
      if (f.pkg !== 'com.notelab.controller' || !f.imports) return false;
      const svcs = f.imports.filter((i) => /^com\.notelab\.service\./.test(i)).map((i) => i.split('.').pop());
      if (!svcs.length) return false;
      // 同域判定：这个 service 自己依赖了哪个 dao 门面（RateLimit/GradeEngine 这类纯工具不依赖 dao，不算）
      const daoBySvc = new Set();
      for (const s of svcs) {
        const sf = (ctx.files || []).find((x) => x.pkg === 'com.notelab.service' && path.basename(x.file) === `${s}.java`);
        if (!sf) continue;
        for (const imp of sf.imports) {
          const m = /\.([A-Z][A-Za-z]*Dao)\b/.exec(imp);
          if (m && m[1] !== 'Db') daoBySvc.add(m[1]);
        }
      }
      if (!daoBySvc.size) return false;
      const called = new Set((f.daoTouch || []).filter((n) => n !== 'Db'));
      return [...called].some((d) => daoBySvc.has(d));
    },
  },
];

// 节点级规则：判据落在「模块自身」而非「模块之间的边」，所以不能复用上面的 edge.check
const NODE_RULES = [
  {
    id: 'no-deprecated-home',
    level: 'warn',
    desc: 'home/ 是已并入 app/(home)/ 的废弃目录，仍留在仓里会被扫进依赖图',
    check: (n) => /(^|:)home$/.test(n.id),
  },
];

function analyze(graph) {
  const cycles = tarjanSCC(graph.nodes, graph.edges).map((c) => ({
    members: c.sort(),
    size: c.length,
  }));

  const violations = [];
  for (const e of graph.edges) {
    for (const r of RULES) {
      if (r.check(e)) violations.push({ rule: r.id, level: r.level, from: e.from, to: e.to, desc: r.desc });
    }
  }
  for (const n of graph.nodes) {
    for (const r of NODE_RULES) {
      if (r.check(n)) violations.push({ rule: r.id, level: r.level, node: n.id, desc: r.desc });
    }
  }
  for (const f of graph.files || []) {
    for (const r of FILE_RULES) {
      if (r.check(f, graph)) {
        violations.push({ rule: r.id, level: r.level, node: `notelab-java:${f.pkg}`, file: f.file, desc: r.desc });
      }
    }
  }

  const scored = graph.nodes.map((n) => ({ id: n.id, kind: n.kind, files: n.files, in: n.in, out: n.out, score: n.in + n.out }));
  const hubs = scored.filter((n) => n.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
  const heavyFiles = graph.nodes.filter((n) => n.files >= 5).sort((a, b) => b.files - a.files).slice(0, 10);

  return {
    cycles,
    violations,
    hubs,
    heavyFiles,
    counts: {
      nodes: graph.stats.nodeCount,
      edges: graph.stats.edgeCount,
      cycles: cycles.length,
      violations: violations.length,
      errors: violations.filter((v) => v.level === 'error').length,
    },
  };
}

module.exports = { analyze, tarjanSCC, RULES };
