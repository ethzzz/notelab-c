// 摸金行动 · 局内状态机（**无 DOM / 无网络 / 无 React 依赖**）
//
// 与 loot-engine.ts 同样保持纯函数：一局的全部推进都由「(当前状态, 内容, 操作) → 新状态」表达，
// 随机数走 seed + cursor 的确定性游标（两次同样的操作序列必然得到逐字段一致的结果）。
// 这样 W3 的「Node 跑 10,000 局 + 卡方检验」可以直接 import 本文件循环调用，不需要浏览器。
//
// ⚠️ LLM 依赖：无。本文件全程确定性计算。
//
// ⚠️ 2026-10-06 形状化：容器是网格、物品有形状、背包也是网格。
//    一条关键设计 —— **布局延迟到首次搜刮才生成**（见 searchNext 里的注释）：
//    开局就生成的话，保底计数会为"玩家根本没打开的容器"提前推进。

import {
  applyPity, displayValue, findPlacement, findTable, generateLayout, indexItems, mulberry32, newGrid,
  orderOf, pendingPity, recycleValue, rollGrid,
  type Cell, type LootBalance, type LootContent, type LootItem, type LootMap, type PlacedItem, type Rarity,
} from "./loot-engine"
import type { LootSave } from "./loot-save"

// ---------------- 局内状态 ----------------

/**
 * 背包里的一件东西。
 * - `value`：**展示价**（面值 × 地图价值倍率），玩法里给玩家看的那个数；
 * - `unit`：**回收单价**（＝ 展示价 × 回收率），入库时一起写进存档 ——
 *   仓库里的东西已经离开地图、拿不到 mult，只能靠这个单价把"当时的价格"钉住；
 * - `x/y/rot/cells`：**在背包网格里的实际占位**。背包不再是"件数"，而是"格子"。
 */
export interface BackpackEntry {
  item: LootItem
  value: number
  unit: number
  x: number
  y: number
  rot: number
  cells: Cell[]
}

/** 局内一个容器实例（同一容器配比多次出现时靠 key 区分） */
export interface ContainerRuntime {
  key: string
  id: string
  name: string
  emoji: string
  /** 网格尺寸：开局按 seed 从后台配的区间里掷出来 —— 这就是"物资箱几×几是随机的" */
  cols: number
  rows: number
  slotMs: number
  riskCost: number
  /**
   * 预生成的摆放。**首次搜刮时才填**（见 searchNext 的注释），
   * 未生成前是空数组 —— 渲染层看到的全是"?"，不会泄露内容。
   */
  layout: PlacedItem[]
  /** 该容器的布局是否已生成 */
  rolled: boolean
  /** 本次是否走了保底（决定出局时保底计数要不要清零） */
  forced: boolean
  /** 已揭示的格子（长度 cols*rows，下标 = y*cols+x） */
  revealed: boolean[]
  /** 已取走的物品（layout 下标） */
  taken: boolean[]
  /** 本容器已取出的最高档序号（保底判定用） */
  maxIdx: number
}

export type RaidPhase = "raid" | "extract" | "settled"

export interface RaidLogEntry { t: string; kind: "info" | "good" | "bad" }

export interface RaidResult {
  success: boolean
  reason: string
  /** 背包内物品的展示价合计 */
  gross: number
  /** 成功时：这些物品进仓库（等价回收币 = 按 recycleRate 折算） */
  payout: number
  /** 失败时：损失的展示价 */
  lostValue: number
  backpack: BackpackEntry[]
}

export interface RaidState {
  seed: number
  mapId: string
  phase: RaidPhase
  /** 剩余时限（ms）；页面按 tick 递减 */
  remainMs: number
  containers: ContainerRuntime[]
  backpack: BackpackEntry[]
  risk: number
  riskLimit: number
  /** 容器级保底计数（进入本局时从存档拷入，出局写回） */
  pity: Record<string, number>
  /** 确定性随机游标：已消费的随机数个数 */
  cursor: number
  log: RaidLogEntry[]
  result: RaidResult | null
}

// ---------------- 确定性 RNG 游标 ----------------

/** 从 seed 出发跳过 start 个随机数，返回「取第 start 个起」的流，并记录本段消耗了几个 */
function cursorRng(seed: number, start: number) {
  const r = mulberry32(seed)
  for (let i = 0; i < start; i++) r()
  let n = 0
  return { next: () => { n++; return r() }, used: () => n }
}

/** 单抽一个 [0,1) —— 撤离成功率判定等「局内一次性掷骰」用它，保证与抽取共用一个随机流 */
export function drawUnit(raid: RaidState): { value: number; cursor: number } {
  const r = mulberry32(raid.seed)
  for (let i = 0; i < raid.cursor; i++) r()
  return { value: r(), cursor: raid.cursor + 1 }
}

/** 背包网格尺寸（后台配的就是"格子"，不再是"件数"） */
export function bagDims(balance: LootBalance): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.min(8, Math.floor(Number(balance.backpackCols) || 5))),
    rows: Math.max(1, Math.min(8, Math.floor(Number(balance.backpackRows) || 3))),
  }
}

/** 由背包内容反推占用表（放置新东西前要先知道哪些格子已经被占了） */
export function bagGrid(backpack: BackpackEntry[], cols: number, rows: number): boolean[] {
  const g = newGrid(cols, rows)
  for (const b of backpack) {
    for (const [x, y] of b.cells) {
      if (y >= 0 && y < rows && x >= 0 && x < cols) g[y * cols + x] = true
    }
  }
  return g
}

/** 背包已用格数 / 总格数 */
export function bagUsage(backpack: BackpackEntry[], balance: LootBalance): { used: number; total: number } {
  const { cols, rows } = bagDims(balance)
  return { used: backpack.reduce((s, b) => s + Math.max(1, b.cells.length), 0), total: cols * rows }
}

// ---------------- 门槛校验 ----------------

export interface EntryCheck {
  ok: boolean
  /** 未满足的原因（逐条文案，直接可展示） */
  reasons: string[]
}

/**
 * 进图门槛校验。
 * @param groups 当前玩家所属用户组；传 null 表示未知（此时**不**校验 groups，避免误拦）
 */
export function checkEntry(save: LootSave, map: LootMap, groups: string[] | null): EntryCheck {
  const reasons: string[] = []
  const e = map.entry
  if (e.coins > 0 && save.coins < e.coins) {
    reasons.push(`金币不足：需要 💰${e.coins}，当前 💰${save.coins}`)
  }
  if (e.minExtracts > 0 && save.stats.extracts < e.minExtracts) {
    reasons.push(`撤离次数不足：需要 ${e.minExtracts} 次，当前 ${save.stats.extracts} 次`)
  }
  for (const need of e.items ?? []) {
    const have = save.stash.find((s) => s.itemId === need.itemId)?.qty ?? 0
    if (have < need.qty) reasons.push(`缺少入场物品 ${need.itemId} ×${need.qty}（当前 ${have}）`)
  }
  if (groups && (e.groups?.length ?? 0) > 0) {
    const miss = e.groups.filter((g) => !groups.includes(g))
    if (miss.length) reasons.push(`需要用户组：${miss.join(" / ")}`)
  }
  return { ok: reasons.length === 0, reasons }
}

// ---------------- 开局 / 搜索 / 结算 ----------------

/**
 * 开局：为每个容器实例掷网格尺寸（**只掷尺寸，不生成内容**）。
 *
 * 为什么不顺手把内容也生成了：内容生成要吃保底状态，而保底只有在**真的开这个容器**
 * 时才该推进 —— 开局就生成的话，玩家没碰过的容器也会把保底计数往前推。
 */
function buildContainers(map: LootMap, content: LootContent, rng: () => number): ContainerRuntime[] {
  const out: ContainerRuntime[] = []
  for (const mc of map.containers) {
    const def = content.containers.find((c) => c.id === mc.containerId)
    if (!def) continue
    for (let i = 0; i < mc.count; i++) {
      const { cols, rows } = rollGrid(def, rng)
      out.push({
        key: `${def.id}#${i}`, id: def.id, name: def.name, emoji: def.emoji ?? "📦",
        cols, rows, slotMs: def.slotMs, riskCost: def.riskCost,
        layout: [], rolled: false, forced: false,
        revealed: new Array(cols * rows).fill(false),
        taken: [], maxIdx: -1,
      })
    }
  }
  return out
}

/**
 * 开局：扣门票（含入场物品）、累加局数、生成容器实例。
 * ⚠️ 调用前必须先过 {@link checkEntry}；本函数不做二次校验（保持纯、无文案分歧）。
 */
export function startRaid(content: LootContent, map: LootMap, save: LootSave, seed: number): { raid: RaidState; save: LootSave } {
  const nextSave: LootSave = { ...save, coins: save.coins - (map.entry.coins || 0), stats: { ...save.stats, runs: save.stats.runs + 1 } }
  // 扣入场物品（checkEntry 已保证够）
  if ((map.entry.items ?? []).length) {
    const need = new Map(map.entry.items.map((i) => [i.itemId, i.qty]))
    nextSave.stash = save.stash
      .map((s) => ({ ...s, qty: s.qty - (need.get(s.itemId) ?? 0) }))
      .filter((s) => s.qty > 0)
  }
  const { next, used } = cursorRng(seed, 0)
  const raid: RaidState = {
    seed, mapId: map.id, phase: "raid", remainMs: map.timeLimitSec * 1000,
    containers: buildContainers(map, content, next),
    backpack: [], risk: 0, riskLimit: map.riskLimit,
    pity: { ...save.pity }, cursor: used(),
    log: [{ t: `进入「${map.name}」，门票 💰${map.entry.coins} 已扣`, kind: "info" }],
    result: null,
  }
  return { raid, save: nextSave }
}

const MAX_BACKPACK_LOG = 40

/**
 * 搜刮一格。
 *
 * 逐格揭示（行优先）：点到空格 → 空手；点到某件东西的任一格 → **整件取出**
 * （它占的所有格子一起翻面），再自动找位塞进背包网格。
 *
 * 为什么布局要延迟到第一次搜刮时才生成（{@link ContainerRuntime.rolled}）：
 *   ① 保底：生成布局要读/消费保底状态，而保底只在"真开了这个容器"时才该推进 ——
 *      开局统一生成会让没被碰过的容器白白推进计数；
 *   ② 随机游标：晚生成 = 随机数按"实际发生的操作"顺序消耗，复现一局时更贴近真实操作序列。
 *   代价是渲染层在生成前只看到空 layout（正好，本来也全是"?"）。
 */
export function searchNext(raid: RaidState, content: LootContent, key: string): RaidState {
  if (raid.phase !== "raid") return raid
  const ci = raid.containers.findIndex((c) => c.key === key)
  if (ci < 0) return raid
  let rt = raid.containers[ci]
  const def = content.containers.find((c) => c.id === rt.id)
  const map = content.maps.find((m) => m.id === raid.mapId)
  if (!def || !map) return raid

  const order = orderOf(content)
  const total = rt.cols * rt.rows
  let idx = -1
  for (let i = 0; i < total; i++) if (!rt.revealed[i]) { idx = i; break }
  if (idx < 0) return raid   // 已摸完

  let cursor = raid.cursor
  const log = [...raid.log]

  // ---- 首次搜刮：先生成这个容器的布局 ----
  if (!rt.rolled) {
    const itemsById = indexItems(content.items)
    const table = findTable(content.tables, def.tableId)
    const { next, used } = cursorRng(raid.seed, cursor)
    const force: Rarity | null = pendingPity(raid.pity, def)
    const layout = generateLayout({
      def, table, itemsById, rng: next, order, tierBoost: map.tierBoost,
      forceRarity: force, cols: rt.cols, rows: rt.rows,
    })
    rt = { ...rt, layout, rolled: true, forced: !!force, taken: new Array(layout.length).fill(false) }
    cursor += used()
  }

  const x = idx % rt.cols
  const y = Math.floor(idx / rt.cols)
  const revealed = [...rt.revealed]
  revealed[idx] = true
  const taken = [...rt.taken]

  // 命中的物品（未取走、且占据这一格）
  let hit = -1
  for (let k = 0; k < rt.layout.length; k++) {
    if (taken[k]) continue
    if (rt.layout[k].cells.some(([cx, cy]) => cx === x && cy === y)) { hit = k; break }
  }

  const { cols: bagCols, rows: bagRows } = bagDims(content.balance)
  let backpack = raid.backpack
  /** 这一格是否真的塞进了背包（放不下被丢弃 → false，也就不加风险） */
  let picked = false
  let maxIdx = rt.maxIdx

  if (hit >= 0) {
    const p = rt.layout[hit]
    const item = content.items.find((i) => i.id === p.itemId)
    if (item) {
      // 整件取出：它占的每一格一起翻面
      for (const [cx, cy] of p.cells) revealed[cy * rt.cols + cx] = true
      taken[hit] = true
      maxIdx = Math.max(maxIdx, order.indexOf(item.rarity))

      const place = findPlacement(item.shape, bagCols, bagRows, bagGrid(backpack, bagCols, bagRows))
      const v = displayValue(item, map)
      if (!place) {
        log.push({ t: `背包塞不下 ${item.emoji ?? "📦"} ${item.name}（占 ${p.cells.length} 格），只能丢下`, kind: "bad" })
      } else {
        backpack = [...backpack, { item, value: v, unit: recycleValue(item, content.balance, map.valueMult), ...place }]
        picked = true
        log.push({ t: `${item.emoji ?? "📦"} ${item.name} · ${v}（占 ${p.cells.length} 格）`, kind: "good" })
      }
    }
  } else {
    log.push({ t: `${rt.emoji} ${rt.name}：这一格是空的`, kind: "info" })
  }

  // 风险两条线（PRD §5.3）：
  //   ① 开一个容器（首次搜刮）→ +容器 riskCost（越高级的容器越危险）
  //   ② 每往背包塞**一格** → +balance.riskPerSlot（占格越多越危险，这是拿大件的代价）
  let risk = raid.risk
  const firstCell = rt.revealed.every((v) => !v)
  if (firstCell && def.riskCost > 0) {
    risk += def.riskCost
    log.push({ t: `搜刮「${def.name}」风险 +${def.riskCost}（${risk}/${raid.riskLimit}）`, kind: risk > raid.riskLimit ? "bad" : "info" })
  }
  if (picked) {
    const per = content.balance.riskPerSlot
    const add = per * (backpack[backpack.length - 1]?.cells.length || 0)
    if (add > 0) risk += add
  }

  const containers = [...raid.containers]
  containers[ci] = { ...rt, revealed, taken, maxIdx }

  // 保底：整个容器翻完才结算（forced 告诉它本次保底是否已经被消费）
  let pity = raid.pity
  const done = revealed.every(Boolean)
  if (done && def.pity) {
    const maxRarity = maxIdx >= 0 ? order[maxIdx] : null
    pity = applyPity(pity, def, maxRarity, rt.forced, order).state
  }

  const base: RaidState = {
    ...raid, containers, backpack, risk, pity, cursor,
    log: log.slice(-MAX_BACKPACK_LOG),
  }

  // 风险超上限 → 立即失败
  if (risk > raid.riskLimit) {
    return finalize(base, { success: false, reason: `风险累积超过上限（${risk}/${raid.riskLimit}），被清场` }, content)
  }
  return base
}

/** 时限耗尽 → 失败（由页面在倒计时归零时调用） */
export function timeoutFail(raid: RaidState, content: LootContent): RaidState {
  if (raid.phase !== "raid") return raid
  return finalize({ ...raid, remainMs: 0 }, { success: false, reason: "超时未撤离" }, content)
}

/** 结算：走 / 撤离失败 都在这里收口。成功→物品进仓库；失败→背包全丢、门票不退 */
export function finalize(
  raid: RaidState,
  outcome: { success: boolean; reason: string },
  content: LootContent,
): RaidState {
  const gross = raid.backpack.reduce((s, b) => s + b.value, 0)
  const payout = raid.backpack.reduce((s, b) => s + b.unit, 0)
  const result: RaidResult = {
    success: outcome.success,
    reason: outcome.reason,
    gross,
    payout,
    lostValue: outcome.success ? 0 : gross,
    backpack: raid.backpack,
  }
  const log = [...raid.log, {
    t: outcome.success ? `✅ 撤离成功：${raid.backpack.length} 件物品入仓库` : `❌ ${outcome.reason}：背包 ${raid.backpack.length} 件全部损失`,
    kind: outcome.success ? "good" : "bad",
  } as RaidLogEntry]
  return { ...raid, phase: "settled", result, log: log.slice(-MAX_BACKPACK_LOG) }
}

/** 把结算写回存档：成功入仓库 / 失败记失败数；两者都写回保底计数 */
export function commitResult(raid: RaidState, save: LootSave): LootSave {
  const r = raid.result
  if (!r) return { ...save, pity: raid.pity }
  if (!r.success) {
    return { ...save, pity: raid.pity, stats: { ...save.stats, failed: save.stats.failed + 1 } }
  }
  // 入仓库：按「itemId + 回收单价」合并 —— 同一件东西从不同倍率的图带出来，价格本就不同，
  // 合并成一个价会悄悄抹掉差价（仓库里同 id 两行是正常的）。
  const merged = new Map(save.stash.map((s) => [`${s.itemId}@${s.unit ?? ""}`, { itemId: s.itemId, qty: s.qty, unit: s.unit }]))
  for (const b of r.backpack) {
    const k = `${b.item.id}@${b.unit}`
    const cur = merged.get(k)
    merged.set(k, { itemId: b.item.id, qty: (cur?.qty ?? 0) + 1, unit: b.unit })
  }
  return {
    ...save,
    pity: raid.pity,
    stash: Array.from(merged.values()),
    stats: {
      ...save.stats,
      extracts: save.stats.extracts + 1,
      bestHaul: Math.max(save.stats.bestHaul, r.gross),
    },
  }
}

// ---------------- 仓库 / 回收 / 救济 ----------------

/**
 * 仓库里某件物品的回收价：优先用入库时钉住的单价（含当时的地图倍率）。
 * 旧存档没有 unit 时按"标准倍率"折算（1×），不会算不出来。
 */
export function stashSellValue(itemId: string, content: LootContent, unit?: number): number {
  if (unit != null && Number.isFinite(unit)) return Math.round(unit)
  const item = content.items.find((i) => i.id === itemId)
  if (!item) return 0
  return recycleValue(item, content.balance, 1)
}

/** 一键回收：全部换成金币（返回新的存档） */
export function sellStash(save: LootSave, content: LootContent): { save: LootSave; gained: number } {
  let gained = 0
  for (const s of save.stash) gained += stashSellValue(s.itemId, content, s.unit) * s.qty
  return { save: { ...save, coins: save.coins + gained, stash: [] }, gained }
}

/** 破产判定：金币不够进最便宜的图，且仓库也没有可卖的东西 */
export function isBroke(save: LootSave, content: LootContent): boolean {
  if (save.stash.length > 0) return false
  const cheapest = content.maps.reduce((min, m) => Math.min(min, m.entry.coins || 0), Number.POSITIVE_INFINITY)
  if (!Number.isFinite(cheapest)) return false
  return save.coins < cheapest
}

/** 救济是否可用（破产 + 冷却已过）。now 显式传入，便于测试 */
export function canRescue(save: LootSave, content: LootContent, now: number): { ok: boolean; remainMs: number } {
  if (!isBroke(save, content)) return { ok: false, remainMs: 0 }
  const cd = content.balance.rescueCooldownSec * 1000
  const elapsed = now - (save.rescueAt || 0)
  if (elapsed >= cd) return { ok: true, remainMs: 0 }
  return { ok: false, remainMs: cd - elapsed }
}

export function doRescue(save: LootSave, content: LootContent, now: number): LootSave {
  return { ...save, coins: save.coins + content.balance.rescueCoins, rescueAt: now }
}

// ---------------- 组队/展示小工具 ----------------

/** 仓库按稀有度排序后的展示序列（贵的在前） */
export function stashSorted(save: LootSave, content: LootContent): { item: LootItem; qty: number; sell: number }[] {
  const order = orderOf(content)
  const out: { item: LootItem; qty: number; sell: number }[] = []
  for (const s of save.stash) {
    const item = content.items.find((i) => i.id === s.itemId)
    if (!item) continue
    out.push({ item, qty: s.qty, sell: stashSellValue(s.itemId, content, s.unit) })
  }
  return out.sort((a, b) => order.indexOf(b.item.rarity) - order.indexOf(a.item.rarity) || b.sell - a.sell)
}

/** 摸过的格数 / 总格数（UI 进度用）。注意"格数"≠"件数"：一件 2×2 占 4 格 */
export function remainingSlots(raid: RaidState): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const c of raid.containers) {
    total += c.cols * c.rows
    for (const v of c.revealed) if (v) done++
  }
  return { total, done }
}
