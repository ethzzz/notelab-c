// 摸金行动 · 存档读写
// 复用 C 端现成的 gameSave 分流：登录态落 MySQL（/api/c/game/save?game=loot），游客态落 localStorage。
import { loadGame, saveGame } from "./gameSave"

export const LOOT_GAME_CODE = "loot"

/** 仓库一行。`unit` = 入库时钉住的回收单价（含当时地图的价值倍率）；旧档没有则按标准倍率折算。 */
export interface LootStackItem { itemId: string; qty: number; unit?: number }

/** 存档结构（version 变更时需写迁移函数：读旧版补默认值） */
export interface LootSave {
  version: number
  coins: number
  stash: LootStackItem[]
  stats: { runs: number; extracts: number; failed: number; bestHaul: number }
  /** 容器级保底计数 {容器 id: 计数} */
  pity: Record<string, number>
  /** 上次领救济金的时间戳（ms），用于 24h 冷却 */
  rescueAt: number
  updatedAt: number
}

export function blankSave(initialCoins: number): LootSave {
  return {
    version: 1,
    coins: initialCoins,
    stash: [],
    stats: { runs: 0, extracts: 0, failed: 0, bestHaul: 0 },
    pity: {},
    rescueAt: 0,
    updatedAt: Date.now(),
  }
}

/** 补默认值（防旧档缺字段） */
export function normalizeSave(raw: any, initialCoins: number): LootSave {
  const b = blankSave(initialCoins)
  if (!raw || typeof raw !== "object") return b
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    coins: typeof raw.coins === "number" && Number.isFinite(raw.coins) ? raw.coins : b.coins,
    stash: Array.isArray(raw.stash)
      ? raw.stash.filter((s: any) => s && typeof s.itemId === "string").map((s: any) => ({
          itemId: s.itemId, qty: typeof s.qty === "number" ? s.qty : 1,
          unit: typeof s.unit === "number" && Number.isFinite(s.unit) ? Math.round(s.unit) : undefined,
        }))
      : [],
    stats: {
      runs: raw.stats?.runs ?? 0, extracts: raw.stats?.extracts ?? 0,
      failed: raw.stats?.failed ?? 0, bestHaul: raw.stats?.bestHaul ?? 0,
    },
    pity: raw.pity && typeof raw.pity === "object" ? raw.pity : {},
    rescueAt: typeof raw.rescueAt === "number" ? raw.rescueAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  }
}

export async function loadLootSave(initialCoins: number): Promise<LootSave> {
  return normalizeSave(await loadGame(LOOT_GAME_CODE), initialCoins)
}

export async function saveLootSave(s: LootSave): Promise<void> {
  await saveGame(LOOT_GAME_CODE, { ...s, updatedAt: Date.now() })
}
