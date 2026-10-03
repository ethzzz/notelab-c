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
  RARITY_ORDER,
  type LootContent, type LootItem, type LootContainer, type LootTable, type LootMap, type LootBalance, type Rarity,
} from "./loot-engine"

const W = (c: number, u: number, r: number, e: number, l: number) => ({ common: c, uncommon: u, rare: r, epic: e, legendary: l })

const DEFAULT_ITEM_LIST: LootItem[] = [
  { id: "it-001", name: "旧手表", rarity: "common", baseValue: 60, stack: 1, emoji: "⌚", tags: ["junk"] },
  { id: "it-002", name: "生锈扳手", rarity: "common", baseValue: 55, stack: 1, emoji: "🔧", tags: ["junk"] },
  { id: "it-003", name: "罐头食品", rarity: "common", baseValue: 45, stack: 3, emoji: "🥫", tags: ["supply"] },
  { id: "it-004", name: "铜线卷", rarity: "common", baseValue: 70, stack: 2, emoji: "🔌", tags: ["mat"] },
  { id: "it-005", name: "军用水壶", rarity: "common", baseValue: 50, stack: 1, emoji: "🍶", tags: ["supply"] },
  { id: "it-006", name: "破旧地图", rarity: "common", baseValue: 85, stack: 1, emoji: "🗺️", tags: ["info"] },
  { id: "it-007", name: "打火机", rarity: "common", baseValue: 65, stack: 1, emoji: "🔥", tags: ["supply"] },
  { id: "it-008", name: "零件盒", rarity: "common", baseValue: 95, stack: 2, emoji: "🧰", tags: ["mat"] },
  { id: "it-009", name: "急救包", rarity: "uncommon", baseValue: 220, stack: 2, emoji: "🩹", tags: ["med"] },
  { id: "it-010", name: "便携电台", rarity: "uncommon", baseValue: 260, stack: 1, emoji: "📻", tags: ["tech"] },
  { id: "it-011", name: "军用望远镜", rarity: "uncommon", baseValue: 300, stack: 1, emoji: "🔭", tags: ["optics"] },
  { id: "it-012", name: "精钢匕首", rarity: "uncommon", baseValue: 180, stack: 1, emoji: "🗡️", tags: ["weapon"] },
  { id: "it-013", name: "防毒面具", rarity: "uncommon", baseValue: 340, stack: 1, emoji: "😷", tags: ["gear"] },
  { id: "it-014", name: "加密硬盘", rarity: "uncommon", baseValue: 380, stack: 1, emoji: "💽", tags: ["tech", "info"] },
  { id: "it-015", name: "夜视仪", rarity: "rare", baseValue: 850, stack: 1, emoji: "🕶️", tags: ["optics", "gear"] },
  { id: "it-016", name: "金条", rarity: "rare", baseValue: 1000, stack: 5, emoji: "🧱", tags: ["treasure"] },
  { id: "it-017", name: "稀有电路板", rarity: "rare", baseValue: 620, stack: 3, emoji: "🔲", tags: ["tech", "mat"] },
  { id: "it-018", name: "古董怀表", rarity: "rare", baseValue: 700, stack: 1, emoji: "🕰️", tags: ["treasure"] },
  { id: "it-019", name: "军用手枪", rarity: "rare", baseValue: 1150, stack: 1, emoji: "🔫", tags: ["weapon"] },
  { id: "it-020", name: "黄金雕像", rarity: "epic", baseValue: 2200, stack: 1, emoji: "🗿", tags: ["treasure"] },
  { id: "it-021", name: "实验样本", rarity: "epic", baseValue: 1800, stack: 1, emoji: "🧪", tags: ["tech"] },
  { id: "it-022", name: "稀有芯片组", rarity: "epic", baseValue: 2700, stack: 2, emoji: "💠", tags: ["tech"] },
  { id: "it-023", name: "黑箱核心", rarity: "legendary", baseValue: 6000, stack: 1, emoji: "⬛", tags: ["artifact"] },
  { id: "it-024", name: "王冠宝石", rarity: "legendary", baseValue: 8500, stack: 1, emoji: "👑", tags: ["treasure"] },
]

const DEFAULT_CONTAINER_LIST: LootContainer[] = [
  { id: "ct-crate", name: "木箱", slots: 2, slotMs: 600, rarityWeights: W(55, 28, 12, 4.5, 0.5), riskCost: 1, pity: null, tableId: "lt-crate", emoji: "📦" },
  { id: "ct-tool", name: "工具柜", slots: 3, slotMs: 1000, rarityWeights: W(45, 33, 15, 6, 1), riskCost: 2, pity: null, tableId: "lt-tool", emoji: "🔧" },
  { id: "ct-ammo", name: "弹药箱", slots: 2, slotMs: 800, rarityWeights: W(50, 30, 14, 5, 1), riskCost: 2, pity: null, tableId: "lt-ammo", emoji: "🧨" },
  { id: "ct-med", name: "医疗柜", slots: 2, slotMs: 1200, rarityWeights: W(48, 32, 14, 5, 1), riskCost: 2, pity: null, tableId: "lt-med", emoji: "🩺" },
  { id: "ct-safe", name: "保险柜", slots: 1, slotMs: 3000, rarityWeights: W(20, 30, 30, 15, 5), riskCost: 3, pity: { afterRuns: 12, minRarity: "epic" }, tableId: "lt-safe", emoji: "🔐" },
  { id: "ct-cage", name: "储物笼", slots: 4, slotMs: 500, rarityWeights: W(70, 20, 8, 1.5, 0.5), riskCost: 1, pity: null, tableId: "lt-cage", emoji: "🗄️" },
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
  // ⚠️ port 的门槛 400 是 2026-10-03 W3 模拟（10,000 局）调出来的：原先 900 时
  //「每次成功撤离回收 1671 ÷ 900 × 撤离率 0.55」只有 1.02× —— 打这张图不划算。
  // 背包上限 8 格决定"带得走的"远少于 33 个槽位能给的，所以门槛必须按"能带走的"定。
  { id: "depot", name: "仓库区", timeLimitSec: 300, riskLimit: 20, valueMult: 0.35, tierBoost: 0,
    entry: { coins: 200, items: [], minExtracts: 0, groups: [] },
    containers: [{ containerId: "ct-crate", count: 4 }, { containerId: "ct-safe", count: 1 }], extractPoints: 2 },
  { id: "port", name: "港口集装箱", timeLimitSec: 240, riskLimit: 30, valueMult: 0.50, tierBoost: 0.4,
    entry: { coins: 400, items: [], minExtracts: 3, groups: [] },
    containers: [{ containerId: "ct-crate", count: 3 }, { containerId: "ct-tool", count: 3 }, { containerId: "ct-ammo", count: 2 },
      { containerId: "ct-med", count: 2 }, { containerId: "ct-safe", count: 2 }, { containerId: "ct-cage", count: 2 }], extractPoints: 3 },
]

export const DEFAULT_BALANCE: LootBalance = {
  recycleRate: 0.6, extractRate: 0.55, backpackCap: 8, initialCoins: 500, rescueCoins: 200,
  rescueCooldownSec: 86400, extractHoldMs: 5000, riskPerSlot: 1, evWarnRatio: 1.15, evRejectRatio: 3.0,
}

export const DEFAULT_LOOT: LootContent = {
  items: DEFAULT_ITEM_LIST,
  containers: DEFAULT_CONTAINER_LIST,
  tables: DEFAULT_TABLE_LIST,
  maps: DEFAULT_MAP_LIST,
  balance: DEFAULT_BALANCE,
}

// ---------------- 轻量净化（只保证"能用"，不做数值裁决） ----------------
const isRarity = (v: any): v is Rarity => RARITY_ORDER.includes(v)
const num = (v: any, dft: number) => (typeof v === "number" && Number.isFinite(v) ? v : dft)

function cleanItems(raw: any): LootItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((i: any) => i && typeof i === "object" && typeof i.id === "string" && i.id && isRarity(i.rarity))
    .map((i: any) => ({
      id: i.id, name: typeof i.name === "string" ? i.name : i.id, rarity: i.rarity,
      baseValue: num(i.baseValue, 50),
      recycleValue: typeof i.recycleValue === "number" ? i.recycleValue : null,
      stack: num(i.stack, 1), emoji: typeof i.emoji === "string" ? i.emoji : "📦",
      tags: Array.isArray(i.tags) ? i.tags.filter((t: any) => typeof t === "string") : [],
      desc: typeof i.desc === "string" ? i.desc : "",
    }))
}

function cleanWeights(raw: any): Record<Rarity, number> | null {
  if (!raw || typeof raw !== "object") return null
  const out = {} as Record<Rarity, number>
  let sum = 0
  for (const r of RARITY_ORDER) {
    const v = num(raw[r], -1)
    if (v < 0) return null
    out[r] = v; sum += v
  }
  return sum > 0 ? out : null
}

function cleanContainers(raw: any): LootContainer[] {
  if (!Array.isArray(raw)) return []
  const out: LootContainer[] = []
  for (const c of raw) {
    if (!c || typeof c !== "object") continue
    if (typeof c.id !== "string" || !c.id || typeof c.tableId !== "string" || !c.tableId) continue
    const w = cleanWeights(c.rarityWeights)
    if (!w) continue
    out.push({
      id: c.id, name: typeof c.name === "string" ? c.name : c.id,
      slots: num(c.slots, 1), slotMs: num(c.slotMs, 800), rarityWeights: w,
      riskCost: num(c.riskCost, 1),
      pity: c.pity && typeof c.pity === "object" && isRarity(c.pity.minRarity)
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
    backpackCap: num(raw.backpackCap, b.backpackCap),
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
    const items = cleanItems(d?.items)
    const containers = cleanContainers(d?.containers)
    const tables = cleanTables(d?.tables)
    const maps = cleanMaps(d?.maps)
    // 关键切片缺失 → 当作"未发布"，整体回落内置（避免半套内容导致空图/空容器）
    if (!items.length || !containers.length || !maps.length) return { content: DEFAULT_LOOT, source: "default" }
    return { content: { items, containers, tables, maps, balance: cleanBalance(d?.balance) }, source: "published" }
  } catch {
    return { content: DEFAULT_LOOT, source: "default" }
  }
}
