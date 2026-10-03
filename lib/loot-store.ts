// 摸金行动 · 局内状态机（**无 DOM / 无网络 / 无 React 依赖**）
//
// 与 loot-engine.ts 同样保持纯函数：一局的全部推进都由「(当前状态, 内容, 操作) → 新状态」表达，
// 随机数走 seed + cursor 的确定性游标（两次同样的操作序列必然得到逐字段一致的结果）。
// 这样 W3 的「Node 跑 10,000 局 + 卡方检验」可以直接 import 本文件循环调用，不需要浏览器。
//
// ⚠️ LLM 依赖：无。本文件全程确定性计算。

import {
  RARITY_ORDER, applyPity, displayValue, findTable, indexItems, mulberry32, recycleValue,
  resolveRarity, rollItem,
  type LootContent, type LootItem, type LootMap, type Rarity,
} from "./loot-engine"
import type { LootSave } from "./loot-save"

// ---------------- 局内状态 ----------------

/** 背包里的一件东西：item 是定义，value 是**结算展示价**（面值 × 地图价值倍率） */
export interface BackpackEntry { item: LootItem; value: number }

/** 局内一个容器实例（同一容器配比多次出现时靠 key 区分） */
export interface ContainerRuntime {
  key: string
  id: string
  name: string
  emoji: string
  slots: number
  slotMs: number
  riskCost: number
  /** 已摸出的槽（null = 空手）；picks.length 即已摸槽数 */
  picks: (LootItem | null)[]
  /** 本容器已摸出的最高档序号（保底判定用） */
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

/** 从地图配比构建容器实例（顺序固定，同 seed 同布局） */
export function buildContainers(map: LootMap, content: LootContent): ContainerRuntime[] {
  const out: ContainerRuntime[] = []
  for (const mc of map.containers) {
    const def = content.containers.find((c) => c.id === mc.containerId)
    if (!def) continue
    for (let i = 0; i < mc.count; i++) {
      out.push({
        key: `${def.id}#${i}`, id: def.id, name: def.name, emoji: def.emoji ?? "📦",
        slots: Math.max(1, def.slots), slotMs: def.slotMs, riskCost: def.riskCost,
        picks: [], maxIdx: -1,
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
  const raid: RaidState = {
    seed, mapId: map.id, phase: "raid", remainMs: map.timeLimitSec * 1000,
    containers: buildContainers(map, content),
    backpack: [], risk: 0, riskLimit: map.riskLimit,
    pity: { ...save.pity }, cursor: 0,
    log: [{ t: `进入「${map.name}」，门票 💰${map.entry.coins} 已扣`, kind: "info" }],
    result: null,
  }
  return { raid, save: nextSave }
}

const MAX_BACKPACK_LOG = 40

/**
 * 摸一格（点一次「搜刮」推进一个槽）。
 * 副作用都在返回值里：背包满了东西会被丢弃（仍消耗风险），风险超上限则**本局立即失败**。
 */
export function searchNext(raid: RaidState, content: LootContent, key: string): RaidState {
  if (raid.phase !== "raid") return raid
  const ci = raid.containers.findIndex((c) => c.key === key)
  if (ci < 0) return raid
  const rt = raid.containers[ci]
  const def = content.containers.find((c) => c.id === rt.id)
  const map = content.maps.find((m) => m.id === raid.mapId)
  if (!def || !map) return raid
  if (rt.picks.length >= rt.slots) return raid   // 已摸完

  const itemsById = indexItems(content.items)
  const table = findTable(content.tables, def.tableId)
  const { next, used } = cursorRng(raid.seed, raid.cursor)

  const firstSlot = rt.picks.length === 0
  // 保底：本次是该容器首槽、且计数已到 → 强制出目标档
  let force: Rarity | null = null
  const pityCfg = def.pity
  if (firstSlot && pityCfg && (raid.pity[def.id] || 0) >= pityCfg.afterRuns) force = pityCfg.minRarity

  const r: Rarity | null = force ?? resolveRarity(def.rarityWeights, table, itemsById, next, map.tierBoost)
  const pick = r ? rollItem(table?.pool ?? [], r, itemsById, next) : null

  const picks = [...rt.picks, pick]
  const maxIdx = pick ? Math.max(rt.maxIdx, RARITY_ORDER.indexOf(pick.rarity)) : rt.maxIdx
  const containers = [...raid.containers]
  containers[ci] = { ...rt, picks, maxIdx }

  const log = [...raid.log]
  const bagCap = content.balance.backpackCap
  let backpack = raid.backpack
  /** 这一格是否真的塞进了背包（背包满被丢弃 → false，也就不加风险） */
  let picked = false
  if (pick) {
    const v = displayValue(pick, map)
    if (backpack.length >= bagCap) {
      log.push({ t: `背包已满（${bagCap}），丢弃 ${pick.emoji ?? "📦"} ${pick.name}`, kind: "bad" })
    } else {
      backpack = [...backpack, { item: pick, value: v }]
      picked = true
      log.push({ t: `${pick.emoji ?? "📦"} ${pick.name} · ${v}（${pick.rarity}）`, kind: "good" })
    }
  } else {
    log.push({ t: `${rt.emoji} ${rt.name}：这一格是空的`, kind: "info" })
  }

  // 风险两条线（PRD §5.3）：
  //   ① 开一个容器（首槽）→ +容器 riskCost（越高级的容器越危险）
  //   ② 每往背包塞一件东西 → +balance.riskPerSlot（越贪越危险）
  // 两者相乘效果的意义：地图的上限必须"摸满就爆、适度就安全"，否则风险条永远不动、没有张力。
  let risk = raid.risk
  if (firstSlot && def.riskCost > 0) {
    risk += def.riskCost
    log.push({ t: `搜刮「${def.name}」风险 +${def.riskCost}（${risk}/${raid.riskLimit}）`, kind: risk > raid.riskLimit ? "bad" : "info" })
  }
  if (picked) {
    const per = content.balance.riskPerSlot
    if (per > 0) risk += per
  }

  // 保底计数：容器摸完时结算
  let pity = raid.pity
  const done = picks.length >= rt.slots
  if (done && def.pity) {
    const maxRarity = maxIdx >= 0 ? RARITY_ORDER[maxIdx] : null
    pity = applyPity(pity, def, maxRarity).state
  }

  const base: RaidState = {
    ...raid, containers, backpack, risk, pity, cursor: raid.cursor + used(),
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
  const payout = raid.backpack.reduce((s, b) => s + recycleValue(b.item, content.balance), 0)
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
  // 入仓库：同 itemId 累加
  const merged = new Map(save.stash.map((s) => [s.itemId, s.qty]))
  for (const b of r.backpack) merged.set(b.item.id, (merged.get(b.item.id) ?? 0) + 1)
  return {
    ...save,
    pity: raid.pity,
    stash: Array.from(merged, ([itemId, qty]) => ({ itemId, qty })),
    stats: {
      ...save.stats,
      extracts: save.stats.extracts + 1,
      bestHaul: Math.max(save.stats.bestHaul, r.gross),
    },
  }
}

// ---------------- 仓库 / 回收 / 救济 ----------------

/** 仓库里某件物品的回收价（按当前 balance 折算） */
export function stashSellValue(itemId: string, content: LootContent): number {
  const item = content.items.find((i) => i.id === itemId)
  if (!item) return 0
  return recycleValue(item, content.balance)
}

/** 一键回收：全部换成金币（返回新的存档） */
export function sellStash(save: LootSave, content: LootContent): { save: LootSave; gained: number } {
  let gained = 0
  for (const s of save.stash) gained += stashSellValue(s.itemId, content) * s.qty
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
  const out: { item: LootItem; qty: number; sell: number }[] = []
  for (const s of save.stash) {
    const item = content.items.find((i) => i.id === s.itemId)
    if (!item) continue
    out.push({ item, qty: s.qty, sell: recycleValue(item, content.balance) })
  }
  return out.sort((a, b) => RARITY_ORDER.indexOf(b.item.rarity) - RARITY_ORDER.indexOf(a.item.rarity) || b.item.baseValue - a.item.baseValue)
}

/** 剩余可摸槽数（UI 进度用） */
export function remainingSlots(raid: RaidState): { total: number; done: number } {
  let total = 0, done = 0
  for (const c of raid.containers) { total += c.slots; done += c.picks.length }
  return { total, done }
}
