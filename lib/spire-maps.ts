// 已发布地图方案 → 引擎 SpireMap 的**校验 + 转换**（C 端）
//
// 数据来路：B 端「地图生成」页生成整套 3 幕 → 存 ui_config 的 spire.maps → 发布到
// spire_published.maps → 后端 GET /api/c/spire/content 透传 → lib/spire-content.ts 取回。
//
// 两个必须守住的点：
//  ① **不可信输入**：虽然后端 SpireContentController 已做了一轮结构净化，但配置可能来自
//    更早的版本、或被人手改过 DB。这里再过一遍**严格**校验，不合法就返回 null 让调用方回落，
//     绝不让脏数据进入引擎（半张图比没有图更糟：玩家会卡在死路上）。
//  ② **每次取用都要深拷贝**：引擎会在运行时把 `revealedType` 写回节点（未揭示节点踏入时 roll）。
//     若每幕共用同一份对象，第二局开局就会继承上一局的揭示结果。所以缓存"校验结果"、
//     每次调用重新造 `SpireMap`。

import {
  TOTAL_ACTS,
  type ActMapProvider,
  type MapNode,
  type NodeType,
  type SpireMap,
} from "./spire-engine"

const NODE_TYPES: NodeType[] = ["enemy", "elite", "boss", "rest", "shop", "event", "random"]
const isNodeType = (v: unknown): v is NodeType => typeof v === "string" && (NODE_TYPES as string[]).includes(v)
// 必须写成**类型谓词**：只写 `=> typeof v === "number"` 的话 TS 不会把 unknown 收窄成 number，
// 后面 `row < 0`、`row: row` 都会报 TS18046/TS2322
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v)

interface CleanAct {
  act: number
  layers: number
  /** 已通过全部结构校验的节点（原样缓存，取用时再深拷贝） */
  nodes: MapNode[]
}

/**
 * 校验并归一化一幕：任一硬性条件不满足 → 返回 null（该幕回落本地生成）。
 * 校验项：层数 ≥ 4；节点 id 唯一；row 落在 [0, layers)；type 合法；
 * next 指向的 id **必须存在**（否则会出现点了没反应的死按钮）；至少各有 1 个入口与 BOSS。
 */
export function toCleanAct(raw: unknown): CleanAct | null {
  if (!raw || typeof raw !== "object") return null
  const a = raw as { act?: unknown; layers?: unknown; nodes?: unknown }
  const act = typeof a.act === "number" && Number.isFinite(a.act) ? Math.trunc(a.act) : 0
  if (!(act >= 1 && act <= TOTAL_ACTS)) return null
  if (!Array.isArray(a.nodes) || a.nodes.length === 0) return null
  const layers = typeof a.layers === "number" && Number.isFinite(a.layers) ? Math.trunc(a.layers) : 0
  if (!(layers >= 4)) return null
  // 上限只是防呆（正常每幕 30~70 个节点）：一张 4000 节点的图会把排版函数拖垮
  if (a.nodes.length > 500) return null

  const byId = new Map<string, MapNode>()
  for (const n of a.nodes) {
    if (!n || typeof n !== "object") return null
    const x = n as Record<string, unknown>
    const id = typeof x.id === "string" ? x.id : ""
    if (!id || byId.has(id)) return null
    const row = x.row, col = x.col
    if (!isInt(row) || !isInt(col)) return null
    if (row < 0 || row >= layers || col < 0) return null
    if (!isNodeType(x.type)) return null
    if (!Array.isArray(x.next) || x.next.some((t) => typeof t !== "string")) return null
    const node: MapNode = { id, row, col, type: x.type, next: x.next as string[] }
    // revealedType 只在 random 上有意义；带上它可以让"已揭示"状态持久化（存档/重渲染不重 roll）
    if (isNodeType(x.revealedType)) node.revealedType = x.revealedType
    byId.set(id, node)
  }
  // `next` 必须全部指向存在的节点：缺一个就是一条走不通的路
  for (const n of byId.values()) {
    for (const t of n.next) if (!byId.has(t)) return null
  }
  let hasEntrance = false
  let hasBoss = false
  for (const n of byId.values()) {
    if (n.row === 0) hasEntrance = true
    if (n.row === layers - 1) hasBoss = true
  }
  if (!hasEntrance || !hasBoss) return null

  return { act, layers, nodes: [...byId.values()] }
}

/** 取用一幕的**全新副本**（见文件头 ②） */
function cloneAct(c: CleanAct): SpireMap {
  return {
    layers: c.layers,
    nodes: c.nodes.map((n) => ({
      ...n,
      next: [...n.next],
    })),
  }
}

/** 已发布地图文档（与后端/ B 端同口径的最小结构） */
export interface PublishedMapDoc {
  defaultId?: string
  packs?: { id?: string; name?: string; acts?: unknown[] }[]
}

/**
 * 构造引擎要的地图取用口。
 * 返回 null = **完全没有可用配置**（未发布 / 结构全废）→ 调用方应把 provider 置空，
 * 全程走本地 generateMap，与加这个功能之前的行为完全一致。
 *
 * 粒度：**单幕**。某一幕缺失或非法，只让那一幕回落，其余幕照用已发布配置。
 * 方案选择：优先 doc.defaultId，取不到则用第一个 pack（与 B 端「默认方案」语义一致）。
 */
export function makePublishedMapProvider(doc: PublishedMapDoc | undefined | null): ActMapProvider | null {
  const packs = Array.isArray(doc?.packs) ? doc!.packs!.filter((p) => p && typeof p === "object") : []
  if (!packs.length) return null
  const pack = packs.find((p) => p.id === doc?.defaultId) || packs[0]
  const acts = Array.isArray(pack.acts) ? pack.acts : []
  const clean = new Map<number, CleanAct>()
  for (const a of acts) {
    const c = toCleanAct(a)
    if (c && !clean.has(c.act)) clean.set(c.act, c)
  }
  if (!clean.size) return null
  // layers 入参只作参考：**以发布配置自带的层数为准**（后台可以生成非 16 层的图）
  return (act: number) => {
    const c = clean.get(act)
    return c ? cloneAct(c) : null
  }
}
