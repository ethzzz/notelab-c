// 摸金行动：C 端内容加载（匿名接口 /api/c/loot/content） + 内置默认包兜底
//
// fail-open 口径（与爬塔 spire 同）：
//   - 接口挂掉 / 未发布 / 任一关键切片为空 → 用内置 DEFAULT_LOOT（保证"没配置也能玩"）；
//   - 只对 published 快照做**结构性**收敛，不做数值裁决（Java 保存时已净化过）。
//
// ⚠️ DEFAULT_LOOT 必须与 notelab-java 的 LootContentController 里的 BASE_* **逐字段一致**，
//    否则"未发布时的手感"与"发布一套默认值后的手感"会不同。
import { apiJson } from "./api"
import {
  DEFAULT_RARITIES, SHAPE_IDS,
  type LootBalance, type LootContainer, type LootContent, type LootItem, type LootMap, type LootTable, type RarityDef,
} from "./loot-engine"

const W = (c: number, u: number, r: number, e: number, l: number) => ({ common: c, uncommon: u, rare: r, epic: e, legendary: l })

/**
 * 内置物品面值 = 该稀有度的每格基准价 × 占格数（见 RarityDef.unitValue），
 * 也就是把「同等稀有度下占格越多越值钱」落到了默认数据上。
 * ⚠️ 唯一的**故意**例外是「王冠宝石」：1×1 却是传说档 —— 保留"小而极贵"的幻想，
 *    也顺带让玩家明白规则是"一般来说"，不是死的。
 */
const DEFAULT_ITEM_LIST: LootItem[] = [
  { id: "it-001", name: "旧手表", rarity: "common", baseValue: 60, stack: 1, emoji: "⌚", shape: "1x1", tags: ["junk"] },
  { id: "it-002", name: "生锈扳手", rarity: "common", baseValue: 110, stack: 1, emoji: "🔧", shape: "1x2", tags: ["junk"] },
  { id: "it-003", name: "罐头食品", rarity: "common", baseValue: 45, stack: 3, emoji: "🥫", shape: "1x1", tags: ["supply"] },
  { id: "it-004", name: "铜线卷", rarity: "common", baseValue: 140, stack: 2, emoji: "🔌", shape: "1x2", tags: ["mat"] },
  { id: "it-005", name: "军用水壶", rarity: "common", baseValue: 50, stack: 1, emoji: "🍶", shape: "1x1", tags: ["supply"] },
  { id: "it-006", name: "破旧地图", rarity: "common", baseValue: 85, stack: 1, emoji: "🗺️", shape: "1x1", tags: ["info"] },
  { id: "it-007", name: "打火机", rarity: "common", baseValue: 65, stack: 1, emoji: "🔥", shape: "1x1", tags: ["supply"] },
  { id: "it-008", name: "零件盒", rarity: "common", baseValue: 380, stack: 2, emoji: "🧰", shape: "2x2", tags: ["mat"] },
  { id: "it-009", name: "急救包", rarity: "uncommon", baseValue: 440, stack: 2, emoji: "🩹", shape: "1x2", tags: ["med"] },
  { id: "it-010", name: "便携电台", rarity: "uncommon", baseValue: 520, stack: 1, emoji: "📻", shape: "1x2", tags: ["tech"] },
  { id: "it-011", name: "军用望远镜", rarity: "uncommon", baseValue: 900, stack: 1, emoji: "🔭", shape: "1x3", tags: ["optics"] },
  { id: "it-012", name: "精钢匕首", rarity: "uncommon", baseValue: 360, stack: 1, emoji: "🗡️", shape: "1x2", tags: ["weapon"] },
  { id: "it-013", name: "防毒面具", rarity: "uncommon", baseValue: 1360, stack: 1, emoji: "😷", shape: "2x2", tags: ["gear"] },
  { id: "it-014", name: "加密硬盘", rarity: "uncommon", baseValue: 380, stack: 1, emoji: "💽", shape: "1x1", tags: ["tech", "info"] },
  { id: "it-015", name: "夜视仪", rarity: "rare", baseValue: 1700, stack: 1, emoji: "🕶️", shape: "1x2", tags: ["optics", "gear"] },
  { id: "it-016", name: "金条", rarity: "rare", baseValue: 2000, stack: 5, emoji: "🧱", shape: "1x2", tags: ["treasure"] },
  { id: "it-017", name: "稀有电路板", rarity: "rare", baseValue: 1240, stack: 3, emoji: "🔲", shape: "1x2", tags: ["tech", "mat"] },
  { id: "it-018", name: "古董怀表", rarity: "rare", baseValue: 700, stack: 1, emoji: "🕰️", shape: "1x1", tags: ["treasure"] },
  { id: "it-019", name: "军用手枪", rarity: "rare", baseValue: 3450, stack: 1, emoji: "🔫", shape: "1x3", tags: ["weapon"] },
  { id: "it-020", name: "黄金雕像", rarity: "epic", baseValue: 8800, stack: 1, emoji: "🗿", shape: "2x2", tags: ["treasure"] },
  { id: "it-021", name: "实验样本", rarity: "epic", baseValue: 3600, stack: 1, emoji: "🧪", shape: "1x2", tags: ["tech"] },
  { id: "it-022", name: "稀有芯片组", rarity: "epic", baseValue: 2700, stack: 2, emoji: "💠", shape: "1x1", tags: ["tech"] },
  { id: "it-023", name: "黑箱核心", rarity: "legendary", baseValue: 24000, stack: 1, emoji: "⬛", shape: "2x2", tags: ["artifact"] },
  { id: "it-024", name: "王冠宝石", rarity: "legendary", baseValue: 8500, stack: 1, emoji: "👑", shape: "1x1", tags: ["treasure"] },
]

/**
 * 内置容器：网格尺寸给的是**区间**，开局按 seed 掷（这就是"物资箱几×几是随机的"）。
 * fillRate < 1 才会出现"这格是空的"，别设成 1（那样永远是满的，摸空这条线就没有了）。
 */
const DEFAULT_CONTAINER_LIST: LootContainer[] = [
  { id: "ct-crate", name: "木箱", colsMin: 2, colsMax: 3, rowsMin: 2, rowsMax: 2, fillRate: 0.8, slotMs: 600, rarityWeights: W(55, 28, 12, 4.5, 0.5), riskCost: 1, pity: null, tableId: "lt-crate", emoji: "📦" },
  { id: "ct-tool", name: "工具柜", colsMin: 3, colsMax: 3, rowsMin: 2, rowsMax: 2, fillRate: 0.75, slotMs: 1000, rarityWeights: W(45, 33, 15, 6, 1), riskCost: 2, pity: null, tableId: "lt-tool", emoji: "🔧" },
  { id: "ct-ammo", name: "弹药箱", colsMin: 2, colsMax: 2, rowsMin: 2, rowsMax: 3, fillRate: 0.8, slotMs: 800, rarityWeights: W(50, 30, 14, 5, 1), riskCost: 2, pity: null, tableId: "lt-ammo", emoji: "🧨" },
  { id: "ct-med", name: "医疗柜", colsMin: 2, colsMax: 3, rowsMin: 2, rowsMax: 2, fillRate: 0.75, slotMs: 1200, rarityWeights: W(48, 32, 14, 5, 1), riskCost: 2, pity: null, tableId: "lt-med", emoji: "🩺" },
  { id: "ct-safe", name: "保险柜", colsMin: 2, colsMax: 2, rowsMin: 2, rowsMax: 2, fillRate: 0.9, slotMs: 3000, rarityWeights: W(20, 30, 30, 15, 5), riskCost: 3, pity: { afterRuns: 12, minRarity: "epic" }, tableId: "lt-safe", emoji: "🔐" },
  { id: "ct-cage", name: "储物笼", colsMin: 3, colsMax: 4, rowsMin: 2, rowsMax: 3, fillRate: 0.7, slotMs: 500, rarityWeights: W(70, 20, 8, 1.5, 0.5), riskCost: 1, pity: null, tableId: "lt-cage", emoji: "🗄️" },
]

const DEFAULT_TABLE_LIST: LootTable[] = [
  { id: "lt-crate", name: "木箱掉落", pool: [
    { itemId: "it-001", weight: 22 }, { itemId: "it-002", weight: 20 }, { itemId: "it-003", weight: 24 }, { itemId: "it-004", weight: 16 },
    { itemId: "it-009", weight: 10 }, { itemId: "it-012", weight: 12 },
    { itemId: "it-017", weight: 6 }, { itemId: "it-021", weight: 2 }, { itemId: "it-023", weight: 1 }] },
  { id: "lt-tool", name: "工具柜掉落", pool: [
    { itemId: "it-002", weight: 20 }, { itemId: "it-004", weight: 22 }, { itemId: "it-008", weight: 18 },
    { itemId: "it-010", weight: 14 }, { itemId: "it-012", weight: 10 }, { itemId: "it-014", weight: 8 },
    { itemId: "it-017", weight: 8 }, { itemId: "it-022", weight: 2 }, { itemId: "it-023", weight: 1 }] },
  { id: "lt-ammo", name: "弹药箱掉落", pool: [
    { itemId: "it-002", weight: 30 }, { itemId: "it-008", weight: 26 },
    { itemId: "it-011", weight: 16 }, { itemId: "it-012", weight: 14 },
    { itemId: "it-019", weight: 10 }, { itemId: "it-021", weight: 2 }, { itemId: "it-024", weight: 1 }] },
  { id: "lt-med", name: "医疗柜掉落", pool: [
    { itemId: "it-003", weight: 28 }, { itemId: "it-005", weight: 26 },
    { itemId: "it-009", weight: 24 }, { itemId: "it-013", weight: 18 },
    { itemId: "it-015", weight: 8 }, { itemId: "it-021", weight: 2 }, { itemId: "it-024", weight: 1 }] },
  { id: "lt-safe", name: "保险柜掉落", pool: [
    { itemId: "it-007", weight: 20 }, { itemId: "it-014", weight: 24 },
    { itemId: "it-015", weight: 20 }, { itemId: "it-016", weight: 22 }, { itemId: "it-018", weight: 18 },
    { itemId: "it-020", weight: 12 }, { itemId: "it-021", weight: 10 }, { itemId: "it-022", weight: 6 },
    { itemId: "it-023", weight: 3 }, { itemId: "it-024", weight: 2 }] },
  { id: "lt-cage", name: "储物笼掉落", pool: [
    { itemId: "it-001", weight: 22 }, { itemId: "it-003", weight: 24 }, { itemId: "it-005", weight: 20 },
    { itemId: "it-006", weight: 18 }, { itemId: "it-007", weight: 22 },
    { itemId: "it-009", weight: 10 }, { itemId: "it-017", weight: 4 }, { itemId: "it-021", weight: 1 }, { itemId: "it-023", weight: 1 }] },
]

const DEFAULT_MAP_LIST: LootMap[] = [
  // ⚠️ port 的门槛 400 是 2026-10-03 W3 模拟（10,000 局）调出来的。
  // ⚠️ 2026-10-06 形状化后两个数值重调：
  //   ① riskLimit：容器变网格后一格一格摸、风险按"占格数"累加，旧上限会开局就爆；
  //   ② valueMult：背包从「8 件」变成「15 格」，能带走的东西多了 ~2.4 倍，
  //      价值倍率必须同比下调，否则 EV 会从 1.7× 飙到 4.2×（远超 [1.5, 3.5] 区间）。
  { id: "depot", name: "仓库区", timeLimitSec: 300, riskLimit: 22, valueMult: 0.18, tierBoost: 0,
    entry: { coins: 200, items: [], minExtracts: 0, groups: [] },
    containers: [{ containerId: "ct-crate", count: 4 }, { containerId: "ct-safe", count: 1 }], extractPoints: 2 },
  { id: "port", name: "港口集装箱", timeLimitSec: 240, riskLimit: 40, valueMult: 0.23, tierBoost: 0.4,
    entry: { coins: 400, items: [], minExtracts: 3, groups: [] },
    containers: [{ containerId: "ct-crate", count: 3 }, { containerId: "ct-tool", count: 3 }, { containerId: "ct-ammo", count: 2 },
      { containerId: "ct-med", count: 2 }, { containerId: "ct-safe", count: 2 }, { containerId: "ct-cage", count: 2 }], extractPoints: 3 },
]

/** 背包 = 5×3 网格（15 格）。旧版 8 件是"件数"，现在是"格数" —— 大件自己会吃掉更多空间 */
export const DEFAULT_BALANCE: LootBalance = {
  recycleRate: 0.6, extractRate: 0.55, backpackCols: 5, backpackRows: 3, initialCoins: 500, rescueCoins: 200,
  // ⚠️ 与设计目标区间 [1.5, 3.5] 自洽：warn = 区间上限，reject = 10× 门槛。三端（Java seed / B model.ts / 此处）必须同值。
  rescueCooldownSec: 86400, extractHoldMs: 5000, riskPerSlot: 1, evWarnRatio: 3.5, evRejectRatio: 10.0,
}

export const DEFAULT_LOOT: LootContent = {
  rarities: DEFAULT_RARITIES,
  items: DEFAULT_ITEM_LIST,
  containers: DEFAULT_CONTAINER_LIST,
  tables: DEFAULT_TABLE_LIST,
  maps: DEFAULT_MAP_LIST,
  balance: DEFAULT_BALANCE,
}

// ---------------- 轻量净化（只保证"能用"，不做数值裁决） ----------------
const num = (v: any, dft: number) => (typeof v === "number" && Number.isFinite(v) ? v : dft)
const clamp = (v: any, lo: number, hi: number, dft: number) => Math.max(lo, Math.min(hi, num(v, dft)))

function cleanRarities(raw: any): RarityDef[] {
  if (!Array.isArray(raw)) return DEFAULT_RARITIES
  const out: RarityDef[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const key = typeof r.key === "string" ? r.key.trim() : ""
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : key,
      color: typeof r.color === "string" && r.color.trim() ? r.color.trim() : "slate",
      unitValue: clamp(r.unitValue, 0, 9_999_999, 0),
    })
  }
  return out.length ? out : DEFAULT_RARITIES
}

function cleanItems(raw: any): LootItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((i: any) => i && typeof i === "object" && typeof i.id === "string" && i.id && typeof i.rarity === "string")
    .map((i: any) => ({
      id: i.id, name: typeof i.name === "string" ? i.name : i.id, rarity: i.rarity,
      baseValue: num(i.baseValue, 50),
      recycleValue: typeof i.recycleValue === "number" ? i.recycleValue : null,
      stack: num(i.stack, 1), emoji: typeof i.emoji === "string" ? i.emoji : "📦",
      image: typeof i.image === "string" && i.image.trim() ? i.image.trim() : "",
      // 形状必须是已知 id：写错/后台新增了前端还没跟上的形状，一律回落到 1×1，
      // 绝不让它变成 undefined（放置算法会直接炸）
      shape: SHAPE_IDS.includes(i.shape) ? i.shape : "1x1",
      tags: Array.isArray(i.tags) ? i.tags.filter((t: any) => typeof t === "string") : [],
      desc: typeof i.desc === "string" ? i.desc : "",
    }))
}

/**
 * 旧配置（只有标量 slots，没有网格）的迁移。
 * ⚠️ 生产上已发布的那份配置就是这种形态 —— 不迁移的话容器会被整条丢掉，
 *    C 端关键切片为空 → 回落内置默认包，表现为"后台配的东西全没了但没报错"。
 */
function gridFromSlots(slots: number) {
  const n = Math.max(1, Math.floor(num(slots, 1)))
  if (n <= 1) return { colsMin: 1, colsMax: 1, rowsMin: 1, rowsMax: 1 }
  if (n === 2) return { colsMin: 2, colsMax: 2, rowsMin: 1, rowsMax: 1 }
  if (n <= 4) return { colsMin: 2, colsMax: 2, rowsMin: 2, rowsMax: 2 }
  return { colsMin: 3, colsMax: 3, rowsMin: 2, rowsMax: 2 }
}

function cleanWeights(raw: any, order: string[]): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null
  const out: Record<string, number> = {}
  let sum = 0
  for (const r of order) {
    const v = num(raw[r], -1)
    if (v < 0) return null
    out[r] = v; sum += v
  }
  return sum > 0 ? out : null
}

function cleanContainers(raw: any, order: string[]): LootContainer[] {
  if (!Array.isArray(raw)) return []
  const out: LootContainer[] = []
  for (const c of raw) {
    if (!c || typeof c !== "object") continue
    if (typeof c.id !== "string" || !c.id || typeof c.tableId !== "string" || !c.tableId) continue
    const w = cleanWeights(c.rarityWeights, order)
    if (!w) continue
    const legacy = gridFromSlots(c.slots)
    const colsMin = clamp(c.colsMin ?? legacy.colsMin, 1, 8, legacy.colsMin)
    const colsMax = clamp(c.colsMax ?? legacy.colsMax, colsMin, 8, legacy.colsMax)
    const rowsMin = clamp(c.rowsMin ?? legacy.rowsMin, 1, 8, legacy.rowsMin)
    const rowsMax = clamp(c.rowsMax ?? legacy.rowsMax, rowsMin, 8, legacy.rowsMax)
    out.push({
      id: c.id, name: typeof c.name === "string" ? c.name : c.id,
      colsMin, colsMax, rowsMin, rowsMax,
      fillRate: Math.min(1, Math.max(0, num(c.fillRate, 0.75))),
      slotMs: num(c.slotMs, 800), rarityWeights: w,
      riskCost: num(c.riskCost, 1),
      pity: c.pity && typeof c.pity === "object" && typeof c.pity.minRarity === "string"
        ? { afterRuns: num(c.pity.afterRuns, 12), minRarity: c.pity.minRarity } : null,
      tableId: c.tableId, emoji: typeof c.emoji === "string" ? c.emoji : "📦",
    })
  }
  return out
}

function cleanTables(raw: any): LootTable[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((t: any) => t && typeof t === "object" && typeof t.id === "string" && t.id)
    .map((t: any) => ({
      id: t.id, name: typeof t.name === "string" ? t.name : t.id,
      pool: Array.isArray(t.pool)
        ? t.pool.filter((p: any) => p && typeof p.itemId === "string" && p.itemId)
          .map((p: any) => ({ itemId: p.itemId, weight: num(p.weight, 1) }))
        : [],
    }))
}

function cleanMaps(raw: any): LootMap[] {
  if (!Array.isArray(raw)) return []
  const out: LootMap[] = []
  for (const m of raw) {
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id) continue
    out.push({
      id: m.id, name: typeof m.name === "string" ? m.name : m.id,
      timeLimitSec: num(m.timeLimitSec, 300), riskLimit: num(m.riskLimit, 20),
      valueMult: num(m.valueMult, 0.35), tierBoost: num(m.tierBoost, 0),
      entry: {
        coins: num(m.entry?.coins, 0),
        items: Array.isArray(m.entry?.items)
          ? m.entry.items.filter((x: any) => x && typeof x.itemId === "string")
            .map((x: any) => ({ itemId: x.itemId, qty: num(x.qty, 1) })) : [],
        minExtracts: num(m.entry?.minExtracts, 0),
        groups: Array.isArray(m.entry?.groups) ? m.entry.groups.filter((g: any) => typeof g === "string") : [],
      },
      containers: Array.isArray(m.containers)
        ? m.containers.filter((c: any) => c && typeof c.containerId === "string" && c.containerId)
          .map((c: any) => ({ containerId: c.containerId, count: num(c.count, 1) })) : [],
      extractPoints: num(m.extractPoints, 2),
    })
  }
  return out
}

function cleanBalance(raw: any): LootBalance {
  if (!raw || typeof raw !== "object") return DEFAULT_BALANCE
  const b = DEFAULT_BALANCE
  return {
    recycleRate: num(raw.recycleRate, b.recycleRate),
    extractRate: num(raw.extractRate, b.extractRate),
    backpackCols: clamp(raw.backpackCols, 1, 8, b.backpackCols),
    backpackRows: clamp(raw.backpackRows, 1, 8, b.backpackRows),
    initialCoins: num(raw.initialCoins, b.initialCoins),
    rescueCoins: num(raw.rescueCoins, b.rescueCoins),
    rescueCooldownSec: num(raw.rescueCooldownSec, b.rescueCooldownSec),
    extractHoldMs: num(raw.extractHoldMs, b.extractHoldMs),
    riskPerSlot: num(raw.riskPerSlot, b.riskPerSlot),
    evWarnRatio: num(raw.evWarnRatio, b.evWarnRatio),
    evRejectRatio: num(raw.evRejectRatio, b.evRejectRatio),
  }
}

export interface LoadedLoot { content: LootContent; source: "published" | "default" }

/** 拉取已发布内容；任一关键切片为空/异常 → 整体回落内置默认包 */
export async function loadLootContent(): Promise<LoadedLoot> {
  try {
    const d: any = await apiJson("/api/c/loot/content")
    const rarities = cleanRarities(d?.rarities)
    const order = rarities.map((r) => r.key)
    const items = cleanItems(d?.items)
    const containers = cleanContainers(d?.containers, order)
    const tables = cleanTables(d?.tables)
    const maps = cleanMaps(d?.maps)
    // 关键切片缺失 → 当作"未发布"，整体回落内置（避免半套内容导致空图/空容器）
    if (!items.length || !containers.length || !maps.length) return { content: DEFAULT_LOOT, source: "default" }
    return {
      content: { rarities, items, containers, tables, maps, balance: cleanBalance(d?.balance) },
      source: "published",
    }
  } catch {
    return { content: DEFAULT_LOOT, source: "default" }
  }
}
