// 《地牢领主》存档与离线结算（C 端）
//
// 时间基准的设计（长期养成的命门）：
// 客户端**不能**用自己的时钟算离线收益 —— 改系统时间就能刷资源。
// 所以服务端读档时返回 serverNow / lastSeenAt / offlineSec，这里只按**服务端给的秒数**结算。
//
// 收益规则放在客户端、收益上限放在服务端（见 DungeonController 的 MAX_GOLD_PER_SEC）：
// 单机养成这么做最划算；真要彻底反作弊就得把模拟搬进服务端（M4 再评估）。
import { apiJson, postJson } from "@/lib/api"
import { fetchMe } from "@/lib/auth"

const LS_KEY = "c_dungeon_save_v1"
/** 超过这个时长不产出（与服务端 MAX_OFFLINE_SEC 保持一致） */
export const MAX_OFFLINE_SEC = 12 * 3600

export type RoomKey = "barracks" | "forge" | "library" | "market" | "watchtower"

export interface RoomDef {
  key: RoomKey
  name: string
  icon: string
  desc: string
  /** 每级每秒产金（线性递增，数值待平衡沙盘调） */
  rate: (lv: number) => number
  /** 升到下一级的金币消耗 */
  cost: (lv: number) => number
}

export const ROOMS: RoomDef[] = [
  { key: "barracks", name: "营房", icon: "🔥", desc: "英雄休整与招募之所，决定可上阵人数。", rate: (lv) => lv * 0.2, cost: (lv) => 100 * lv + 50 },
  { key: "forge", name: "锻造坊", icon: "⚒️", desc: "打造与强化装备，提升出征战力。", rate: (lv) => lv * 0.15, cost: (lv) => 120 * lv + 60 },
  { key: "library", name: "图书馆", icon: "📚", desc: "研习技能，解锁更高级的战术。", rate: (lv) => lv * 0.1, cost: (lv) => 150 * lv + 80 },
  { key: "market", name: "市集", icon: "💰", desc: "交易战利品，稳定产出金币。", rate: (lv) => lv * 0.35, cost: (lv) => 90 * lv + 40 },
  { key: "watchtower", name: "守卫塔", icon: "👹", desc: "驻守怪物抵御来袭，守护积累。", rate: () => 0, cost: (lv) => 200 * lv + 100 },
]

export const ROOM_BY_KEY: Record<string, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.key, r]))

export interface Hero {
  uid: string
  defId: string
  name: string
  icon: string
  lv: number
  exp: number
  state: "idle" | "dispatch" | "rest"
}

export interface DungeonSave {
  v: number
  res: { gold: number; stone: number }
  rooms: Record<string, { lv: number }>
  heroes: Hero[]
  parties: unknown[]
  stats: { deepestFloor: number; runs: number }
  daily: { date: string; claimed: boolean }
}

/** 首版 3 个英雄：defId 引用爬塔角色（后续接 spire.characters 的真实配置） */
const STARTER: Omit<Hero, "uid">[] = [
  { defId: "blade", name: "刃影", icon: "🗡️", lv: 1, exp: 0, state: "idle" },
  { defId: "guard", name: "铁壁守卫", icon: "🛡️", lv: 1, exp: 0, state: "idle" },
  { defId: "mage", name: "秘法编织者", icon: "🔮", lv: 1, exp: 0, state: "idle" },
]

export function newSave(): DungeonSave {
  return {
    v: 1,
    res: { gold: 120, stone: 0 },
    rooms: Object.fromEntries(ROOMS.map((r) => [r.key, { lv: r.key === "watchtower" ? 0 : 1 }])),
    heroes: STARTER.map((h, i) => ({ ...h, uid: `h${i + 1}` })),
    parties: [],
    stats: { deepestFloor: 0, runs: 0 },
    daily: { date: today(), claimed: false },
  }
}

export const today = () => new Date().toISOString().slice(0, 10)

/** 每秒总产金（离线与在线共用同一套公式，避免两套数值） */
export function goldPerSec(save: DungeonSave): number {
  return ROOMS.reduce((n, r) => n + (save.rooms[r.key]?.lv ? r.rate(save.rooms[r.key].lv) : 0), 0)
}

export interface OfflineResult {
  save: DungeonSave
  seconds: number
  gold: number
  stone: number
}

/**
 * 按服务端给的秒数补算离线收益（纯函数，方便测试与模拟）。
 * 注意：offlineSec 已由服务端 clamp 到 12 小时，这里再兜一次底。
 */
export function applyOffline(save: DungeonSave, offlineSec: number): OfflineResult {
  const sec = Math.max(0, Math.min(offlineSec, MAX_OFFLINE_SEC))
  const gold = Math.floor(goldPerSec(save) * sec)
  const stone = Math.floor(gold / 10)
  if (sec < 60 || (gold === 0 && stone === 0)) return { save, seconds: sec, gold: 0, stone: 0 }
  return {
    save: { ...save, res: { gold: save.res.gold + gold, stone: save.res.stone + stone } },
    seconds: sec,
    gold,
    stone,
  }
}

/** 房间升级：扣钱 + 升一级；返回 null 表示条件不满足 */
export function upgradeRoom(save: DungeonSave, key: RoomKey): DungeonSave | null {
  const def = ROOM_BY_KEY[key]
  if (!def) return null
  const room = save.rooms[key] || { lv: 0 }
  const cost = def.cost(room.lv)
  if (save.res.gold < cost) return null
  return {
    ...save,
    res: { ...save.res, gold: save.res.gold - cost },
    rooms: { ...save.rooms, [key]: { lv: room.lv + 1 } },
  }
}

// ---------------------------------------------------------------- 读写

export interface LoadResult {
  save: DungeonSave
  offline: OfflineResult | null
  guest: boolean
  serverNow: number
}

/** 读档：登录态走服务端（含离线结算），游客态走 localStorage（用本机时间，仅自己承担） */
export async function loadDungeon(): Promise<LoadResult> {
  const user = await fetchMe().catch(() => null)
  if (user) {
    try {
      const j = await apiJson<{ data: DungeonSave | null; offlineSec: number; serverNow: number }>("/api/c/dungeon/save")
      const base = j.data && j.data.v ? j.data : newSave()
      const offline = applyOffline(base, j.offlineSec || 0)
      return { save: offline.save, offline: offline.seconds >= 60 ? offline : null, guest: false, serverNow: j.serverNow || Date.now() }
    } catch {
      /* 登录态失败 → 回落本地档 */
    }
  }
  const local = readLocal()
  return { save: local || newSave(), offline: null, guest: true, serverNow: Date.now() }
}

export async function saveDungeon(save: DungeonSave): Promise<{ ok: boolean; error?: string }> {
  const user = await fetchMe().catch(() => null)
  if (user) {
    try {
      await postJson("/api/c/dungeon/save", { version: save.v, data: save })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(save))
    return { ok: true }
  } catch {
    return { ok: false, error: "本地存储写入失败" }
  }
}

function readLocal(): DungeonSave | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as DungeonSave
    return d && d.v ? d : null
  } catch {
    return null
  }
}

/** 秒 → 「3 分 20 秒」 */
export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} 分`
  const h = Math.floor(m / 60)
  return `${h} 小时 ${m % 60} 分`
}
