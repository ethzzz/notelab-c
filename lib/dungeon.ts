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
  /** 养伤结束时间（服务端时间基准）；仅 state==="rest" 时有意义 */
  restUntil?: number
}

/** 一层地牢：难度（需求战力）、耗时、基础战利品 */
export interface FloorDef {
  floor: number
  name: string
  icon: string
  /** 需求战力：队伍战力 / 需求战力 决定成败与伤亡 */
  power: number
  /** 派遣耗时（秒，真实时间，离线也走） */
  seconds: number
  gold: number
  stone: number
  exp: number
}

/** 首版 10 层：难度与耗时同步递增，战利品给得比挂机高，鼓励主动派遣 */
export const FLOORS: FloorDef[] = [
  { floor: 1, name: "苔藓石阶", icon: "🌿", power: 20, seconds: 60, gold: 120, stone: 5, exp: 30 },
  { floor: 2, name: "滴水回廊", icon: "💧", power: 45, seconds: 120, gold: 200, stone: 8, exp: 50 },
  { floor: 3, name: "骸骨墓室", icon: "💀", power: 80, seconds: 240, gold: 320, stone: 12, exp: 80 },
  { floor: 4, name: "蛛网仓库", icon: "🕸️", power: 130, seconds: 360, gold: 480, stone: 18, exp: 120 },
  { floor: 5, name: "熔岩裂隙", icon: "🌋", power: 200, seconds: 480, gold: 700, stone: 25, exp: 170 },
  { floor: 6, name: "腐化圣所", icon: "🕯️", power: 300, seconds: 600, gold: 980, stone: 35, exp: 230 },
  { floor: 7, name: "幽影集市", icon: "🏪", power: 430, seconds: 720, gold: 1350, stone: 48, exp: 300 },
  { floor: 8, name: "深渊回音", icon: "🌀", power: 600, seconds: 900, gold: 1800, stone: 65, exp: 390 },
  { floor: 9, name: "血肉苗床", icon: "🫀", power: 820, seconds: 1200, gold: 2400, stone: 85, exp: 500 },
  { floor: 10, name: "领主王座", icon: "👑", power: 1100, seconds: 1500, gold: 3200, stone: 110, exp: 650 },
]

export const MAX_FLOOR = FLOORS.length
export const FLOOR_BY_ID: Record<number, FloorDef> = Object.fromEntries(FLOORS.map((f) => [f.floor, f]))

/** 受伤后养伤时长（秒） */
export const REST_SEC = 120

export interface PartyResult {
  ok: boolean
  grade: "大胜" | "胜利" | "惨胜" | "失败"
  gold: number
  stone: number
  exp: number
  /** 受伤英雄 uid（会进入养伤状态） */
  wounded: string[]
}

export interface Party {
  id: string
  members: string[]
  floor: number
  /** 服务端时间基准（dispatch 时由服务端时钟给出，改本机时间无效） */
  startedAt: number
  endsAt: number
  /** 服务端闸门已放行（collect 接口盖过章） */
  collected?: boolean
  result?: PartyResult
}

/** 一队最多几人：营房等级 + 1（1 级营房可带 2 人） */
export const partyCap = (save: DungeonSave): number => 1 + (save.rooms.barracks?.lv || 0)

export interface DungeonSave {
  v: number
  res: { gold: number; stone: number }
  rooms: Record<string, { lv: number }>
  heroes: Hero[]
  parties: Party[]
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

// ---------------------------------------------------------------- 服务端时钟
//
// 派遣的"何时出发/何时归来"必须用**服务端时间**，否则改本机时间就能让派遣瞬间完成。
// GET /save 会带回 serverNow，这里记下它与本机时钟的偏移，之后一律用 serverNow() 取时间。
// 本地改时间只会骗过本地显示 —— 真到结算时还要过服务端的 collect 闸门（见 collectDispatch）。

let clockOffset = 0

/** 拿到服务端时间后调用一次，校准偏移 */
export function syncServerClock(serverNowMs: number) {
  if (serverNowMs > 0) clockOffset = serverNowMs - Date.now()
}

/** 估算"服务端现在几点"（游客模式没有服务端，退化为本机时间） */
export const serverNow = () => Date.now() + clockOffset

// ---------------------------------------------------------------- 战力与派遣

/** 单个英雄战力：等级为主，锻造坊（装备）与图书馆（技能）给全队加成 */
export function heroPower(save: DungeonSave, h: Hero): number {
  const forge = save.rooms.forge?.lv || 0
  const library = save.rooms.library?.lv || 0
  return 10 * h.lv + 3 * forge + 2 * library
}

export function partyPower(save: DungeonSave, members: string[]): number {
  return save.heroes
    .filter((h) => members.includes(h.uid))
    .reduce((n, h) => n + heroPower(save, h), 0)
}

/** 层是否已解锁：打通第 N 层才开放第 N+1 层 */
export const floorUnlocked = (save: DungeonSave, floor: number) =>
  floor >= 1 && floor <= MAX_FLOOR && floor <= save.stats.deepestFloor + 1

export interface DispatchPlan {
  floor: FloorDef
  power: number
  /** 队伍战力 / 需求战力 */
  ratio: number
  /** 预估评价（与实际结算同源，供出发前参考） */
  grade: PartyResult["grade"]
}

export function planDispatch(save: DungeonSave, members: string[], floor: number): DispatchPlan | null {
  const def = FLOOR_BY_ID[floor]
  if (!def || members.length === 0) return null
  const power = partyPower(save, members)
  const ratio = power / def.power
  return { floor: def, power, ratio, grade: gradeOf(ratio) }
}

function gradeOf(ratio: number): PartyResult["grade"] {
  if (ratio >= 1.5) return "大胜"
  if (ratio >= 1) return "胜利"
  if (ratio >= 0.75) return "惨胜"
  return "失败"
}

export interface StartResult { save: DungeonSave; party: Party }

/** 派出一队：校验后写入 parties 并把成员置为出征中。返回 null 表示条件不满足 */
export function startDispatch(save: DungeonSave, members: string[], floor: number): StartResult | null {
  if (!floorUnlocked(save, floor)) return null
  const ids = Array.from(new Set(members))
  if (ids.length === 0 || ids.length > partyCap(save)) return null
  // 已在进行的派遣里的英雄不能重复上阵
  const busy = new Set(save.parties.filter((p) => !p.collected).flatMap((p) => p.members))
  const picked = save.heroes.filter((h) => ids.includes(h.uid))
  if (picked.length !== ids.length) return null
  if (picked.some((h) => h.state !== "idle" || busy.has(h.uid))) return null

  const now = serverNow()
  const party: Party = {
    id: `p${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    members: ids,
    floor,
    startedAt: now,
    endsAt: now + FLOOR_BY_ID[floor].seconds * 1000,
  }
  return {
    save: {
      ...save,
      heroes: save.heroes.map((h) => (ids.includes(h.uid) ? { ...h, state: "dispatch" as const } : h)),
      parties: [...save.parties.filter((p) => p.collected), party],
      stats: { ...save.stats, runs: save.stats.runs + 1 },
    },
    party,
  }
}

/** 派遣是否已到期（时间到 ≠ 已结算，还要过服务端闸门） */
export const partyReady = (p: Party, now = serverNow()) => !p.collected && now >= p.endsAt

export interface SettleResult { save: DungeonSave; result: PartyResult; party: Party }

/**
 * 结算一队派遣（纯函数，战利品规则只在这里写一份）。
 * 调用前必须已经过服务端 collect 闸门（登录态），否则改本机时间就能提前领。
 */
export function settleDispatch(save: DungeonSave, partyId: string): SettleResult | null {
  const party = save.parties.find((p) => p.id === partyId)
  if (!party || party.collected) return null
  const def = FLOOR_BY_ID[party.floor]
  if (!def) return null

  const power = partyPower(save, party.members)
  const ratio = power / def.power
  const grade = gradeOf(ratio)
  const ok = ratio >= 0.75

  // 战利品倍率：打得越好拿得越多；失败只有一点安慰金
  const mul = grade === "大胜" ? 1.3 : grade === "胜利" ? 1 : grade === "惨胜" ? 0.5 : 0.1
  const gold = Math.floor(def.gold * mul)
  const stone = Math.floor(def.stone * (grade === "大胜" ? 1.2 : grade === "胜利" ? 1 : 0.4))
  const exp = ok ? Math.floor((def.exp * (grade === "大胜" ? 1.2 : grade === "胜利" ? 1 : 0.6)) / Math.max(1, party.members.length)) : 0

  // 伤亡：越勉强越容易受伤；必然受伤时随机挑人
  const wounded: string[] = []
  if (grade === "失败") wounded.push(...party.members)
  else if (grade === "惨胜") wounded.push(...pickSome(party.members, Math.random() < 0.25 ? party.members.length : 1))
  else if (grade === "胜利" && ratio < 1.25 && Math.random() < 0.3) wounded.push(...pickSome(party.members, 1))

  const now = serverNow()
  const result: PartyResult = { ok, grade, gold, stone, exp, wounded }
  return {
    result,
    party: { ...party, collected: true, result },
    save: {
      ...save,
      res: { gold: save.res.gold + gold, stone: save.res.stone + stone },
      heroes: save.heroes.map((h) => {
        if (!party.members.includes(h.uid)) return h
        if (wounded.includes(h.uid)) return { ...h, state: "rest" as const, restUntil: now + REST_SEC * 1000, exp: h.exp + exp }
        return { ...h, state: "idle" as const, exp: h.exp + exp }
      }),
      parties: save.parties.map((p) => (p.id === partyId ? { ...p, collected: true, result } : p)),
      stats: { ...save.stats, deepestFloor: ok ? Math.max(save.stats.deepestFloor, party.floor) : save.stats.deepestFloor },
    },
  }
}

function pickSome(ids: string[], n: number): string[] {
  const pool = [...ids]
  const out: string[] = []
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
  return out
}

/** 养伤到期的英雄转回待命；返回是否有变化（避免无意义的存档写入） */
export function tickSave(save: DungeonSave, now = serverNow()): { save: DungeonSave; changed: boolean } {
  const heroes = save.heroes.map((h) =>
    h.state === "rest" && h.restUntil && now >= h.restUntil ? { ...h, state: "idle" as const, restUntil: undefined } : h)
  const changed = heroes.some((h, i) => h.state !== save.heroes[i].state)
  return { save: changed ? { ...save, heroes } : save, changed }
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
      // 先校准服务端时钟：后面所有派遣时间（出发/归来/养伤）都以它为准
      syncServerClock(j.serverNow || 0)
      const base = j.data && j.data.v ? j.data : newSave()
      const offline = applyOffline(base, j.offlineSec || 0)
      const ticked = tickSave(offline.save)
      return {
        save: ticked.save,
        offline: offline.seconds >= 60 ? offline : null,
        guest: false,
        serverNow: j.serverNow || Date.now(),
      }
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

/**
 * 结算闸门：登录态必须让服务端盖个章 —— 服务端只在 endsAt 真的到了才放行，
 * 所以改本机时间、或者直接伪造一份"已完成"的存档都领不到战利品。
 * 游客模式没有服务端，退回本地自判（进度只影响自己，且只存本地）。
 */
export async function collectDispatch(partyId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await fetchMe().catch(() => null)
  if (!user) return { ok: true }
  try {
    const j = (await postJson("/api/c/dungeon/collect", { id: partyId })) as { ok?: boolean; serverNow?: number } | null
    if (j?.serverNow) syncServerClock(j.serverNow)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}
