// 摸金行动 · 纯逻辑引擎（**无 DOM / 无网络依赖**）
//
// 为什么必须纯函数：验收要用 Node 跑「10,000 局掉落模拟 + 卡方检验」，要求掉落逻辑能在
// 没有浏览器的环境里直接 import 执行（与爬塔 SM-2 / ArchGuard 同一套验法）。
// 本文件**不得**出现任何大模型调用（PRD-P3 铁律：LLM 零依赖）。
//
// 净化口径与 notelab-java 的 LootContentController、notelab-b 的 loot-editor/_shared/model.ts 一致。

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary"

/** ⚠️ 顺序不可变：权重与保底都依赖它，三端硬编码同一份顺序 */
export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"]

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "普通", uncommon: "精良", rare: "稀有", epic: "史诗", legendary: "传说",
}

export type RarityWeights = Record<Rarity, number>

export interface LootItem {
  id: string
  name: string
  rarity: Rarity
  baseValue: number
  recycleValue?: number | null
  stack?: number
  emoji?: string
  tags?: string[]
  desc?: string
}

export interface LootPity { afterRuns: number; minRarity: Rarity }

export interface LootContainer {
  id: string
  name: string
  slots: number
  slotMs: number
  rarityWeights: RarityWeights
  riskCost: number
  pity?: LootPity | null
  tableId: string
  emoji?: string
}

export interface LootPoolEntry { itemId: string; weight: number }

export interface LootTable { id: string; name: string; pool: LootPoolEntry[] }

export interface LootEntryReq { coins: number; items: { itemId: string; qty: number }[]; minExtracts: number; groups: string[] }
export interface LootMapCtn { containerId: string; count: number }

export interface LootMap {
  id: string
  name: string
  timeLimitSec: number
  riskLimit: number
  valueMult: number
  tierBoost: number
  entry: LootEntryReq
  containers: LootMapCtn[]
  extractPoints: number
}

export interface LootBalance {
  recycleRate: number
  extractRate: number
  backpackCap: number
  initialCoins: number
  rescueCoins: number
  rescueCooldownSec: number
  extractHoldMs: number
  riskPerSlot: number
  evWarnRatio: number
  evRejectRatio: number
}

export interface LootContent {
  items: LootItem[]
  containers: LootContainer[]
  tables: LootTable[]
  maps: LootMap[]
  balance: LootBalance
}

// ---------------- RNG（确定性：同 seed 同序列） ----------------

/** mulberry32：小、快、可复现的 32 位 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 由字符串生成 32 位种子（无 crypto 依赖，同串同值） */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 开局种子（展示用：给「本局种子」按钮复现用） */
export function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0
}

// ---------------- 抽取 ----------------

/** 稀有度轮盘：容器权重为底，tierBoost 只抬 rare/epic/legendary */
export function rollRarity(w: RarityWeights, rng: () => number, tierBoost = 0): Rarity {
  const boosted: RarityWeights = { ...w }
  if (tierBoost > 0) {
    for (const r of RARITY_ORDER) {
      if (r === "common" || r === "uncommon") continue
      boosted[r] = (boosted[r] || 0) * (1 + tierBoost)
    }
  }
  const total = RARITY_ORDER.reduce((s, r) => s + Math.max(0, boosted[r] || 0), 0)
  if (total <= 0) return "common"
  let x = rng() * total
  for (const r of RARITY_ORDER) {
    x -= Math.max(0, boosted[r] || 0)
    if (x < 0) return r
  }
  return "common"
}

/**
 * 该容器当前该用哪一档：先按容器权重抽一档 → 若该档在掉落表里没有候选，则**降档找最近的有货档**
 * （避免"高频空手"这种体感极差的结果；池子真为空则返回 null = 空手）。
 */
export function resolveRarity(
  w: RarityWeights, table: LootTable | undefined, itemsById: Map<string, LootItem>,
  rng: () => number, tierBoost = 0,
): Rarity | null {
  if (!table || table.pool.length === 0) return null
  const drawn = rollRarity(w, rng, tierBoost)
  const has = (r: Rarity) => table.pool.some((p) => itemsById.get(p.itemId)?.rarity === r)
  if (has(drawn)) return drawn
  // 从抽中的档往下找（更低的档更容易"有货"），再往上找
  const idx = RARITY_ORDER.indexOf(drawn)
  for (let i = idx; i >= 0; i--) if (has(RARITY_ORDER[i])) return RARITY_ORDER[i]
  for (let i = idx + 1; i < RARITY_ORDER.length; i++) if (has(RARITY_ORDER[i])) return RARITY_ORDER[i]
  return null
}

/** 在「属于指定档」的池子里按 weight 轮盘抽 1 件 */
export function rollItem(pool: LootPoolEntry[], rarity: Rarity, itemsById: Map<string, LootItem>, rng: () => number): LootItem | null {
  const cands = pool.filter((p) => itemsById.get(p.itemId)?.rarity === rarity && (p.weight || 0) > 0)
  if (cands.length === 0) return null
  const total = cands.reduce((s, p) => s + p.weight, 0)
  let x = rng() * total
  for (const p of cands) {
    x -= p.weight
    if (x < 0) return itemsById.get(p.itemId) ?? null
  }
  return itemsById.get(cands[cands.length - 1].itemId) ?? null
}

export interface SearchInput {
  container: LootContainer
  table: LootTable | undefined
  itemsById: Map<string, LootItem>
  rng: () => number
  /** 地图的稀有度加成 */
  tierBoost?: number
  /** 保底强制出档（由 applyPity 计算后传入）；本次第 1 槽生效 */
  forceRarity?: Rarity | null
}

export interface SearchResult {
  /** 逐槽产出（null = 空手） */
  picks: (LootItem | null)[]
  /** 本次开出的最高档（保底计数用） */
  maxRarity: Rarity | null
}

/** 开一个容器：逐槽抽取；forceRarity 时第 1 槽强制出该档 */
export function searchContainer(input: SearchInput): SearchResult {
  const { container, table, itemsById, rng, tierBoost = 0, forceRarity = null } = input
  const picks: (LootItem | null)[] = []
  let maxIdx = -1
  const n = Math.max(1, container.slots)
  for (let i = 0; i < n; i++) {
    let pick: LootItem | null = null
    if (i === 0 && forceRarity) {
      pick = rollItem(table?.pool ?? [], forceRarity, itemsById, rng)
    } else {
      const r = resolveRarity(container.rarityWeights, table, itemsById, rng, tierBoost)
      pick = r ? rollItem(table?.pool ?? [], r, itemsById, rng) : null
    }
    if (pick) maxIdx = Math.max(maxIdx, RARITY_ORDER.indexOf(pick.rarity))
    picks.push(pick)
  }
  return { picks, maxRarity: maxIdx >= 0 ? RARITY_ORDER[maxIdx] : null }
}

// ---------------- 保底 ----------------
export type PityState = Record<string, number>

/**
 * 保底计数更新：
 * 本次最高档 < pity.minRarity → 计数 +1；达到 afterRuns → 返回 forceRarity 并把计数清零；否则清零。
 * 仅对配了 pity 的容器有作用。
 */
export function applyPity(
  state: PityState, container: LootContainer, maxRarity: Rarity | null,
): { state: PityState; force: Rarity | null } {
  const p = container.pity
  if (!p) return { state, force: null }
  const cur = state[container.id] || 0
  const met = maxRarity != null && RARITY_ORDER.indexOf(maxRarity) >= RARITY_ORDER.indexOf(p.minRarity)
  if (met) {
    if (cur === 0) return { state, force: null }
    return { state: { ...state, [container.id]: 0 }, force: null }
  }
  const next = cur + 1
  if (next >= p.afterRuns) return { state: { ...state, [container.id]: 0 }, force: p.minRarity }
  return { state: { ...state, [container.id]: next }, force: null }
}

// ---------------- 结算 ----------------

/** 回收价 = 物品覆盖值，否则 round(baseValue × recycleRate) */
export function recycleValue(item: LootItem, balance: LootBalance): number {
  if (item.recycleValue != null && Number.isFinite(item.recycleValue)) return Math.round(item.recycleValue)
  return Math.round(item.baseValue * balance.recycleRate)
}

/** 结算展示价 = baseValue × 地图价值倍率 */
export function displayValue(item: LootItem, map: LootMap): number {
  return Math.round(item.baseValue * map.valueMult)
}

/** 某档的候选物品（掉落表池子 ∩ 该档） */
export function poolItemsOfRarity(table: LootTable | undefined, itemsById: Map<string, LootItem>, rarity: Rarity): LootItem[] {
  if (!table) return []
  return table.pool.map((p) => itemsById.get(p.itemId)).filter((x): x is LootItem => !!x && x.rarity === rarity)
}

/** 索引工具 */
export function indexItems(items: LootItem[]): Map<string, LootItem> {
  return new Map(items.map((i) => [i.id, i]))
}
export function findContainer(cs: LootContainer[], id: string): LootContainer | undefined {
  return cs.find((c) => c.id === id)
}
export function findTable(ts: LootTable[], id: string): LootTable | undefined {
  return ts.find((t) => t.id === id)
}

/** 把地图的容器配比展开成实例列表（每张图的固定配比，可复现） */
export function expandMapContainers(map: LootMap, containers: LootContainer[]): LootContainer[] {
  const out: LootContainer[] = []
  for (const mc of map.containers) {
    const def = findContainer(containers, mc.containerId)
    if (!def) continue
    for (let i = 0; i < mc.count; i++) out.push(def)
  }
  return out
}
