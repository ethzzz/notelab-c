// —— 爬塔尖塔（杀戮尖塔 lite）引擎：纯逻辑，不依赖 DOM ——
// 数据驱动设计：卡牌由 CardEffect 效果列表组成（可自定义增改），角色带被动/主动技能，
// 技能与被动通过触发时机钩子（全局生效 / 打出卡片 / 回合开始）作用于效果数值，方便后续拓展。

// ---------------- 卡牌效果系统 ----------------
export type CardCategory = "attack" | "defense" | "buff" | "special"

export type EffectType =
  | "damage"          // 伤害
  | "block"           // 获得格挡
  | "draw"            // 抽牌
  | "energy"          // 获得能量
  | "heal"            // 治疗
  | "self-damage"     // 失去生命
  | "apply-vuln"      // 施加易伤（敌方减益）
  | "apply-weak"      // 施加虚弱（敌方减益）
  | "gain-str"        // 获得力量（自身增益，永久）
  | "gain-temp-str"   // 获得本回合力量（自身增益，回合结束消失）
  | "copy-to-discard" // 将本卡复制一张进弃牌堆

/** 作用对象：自身 / 敌方 */
export type EffectTarget = "self" | "enemy"
/** 作用范围：单体 / 群体 / 随机 N（当前单层单敌战斗，all/random 暂按单体结算，为多敌人拓展预留） */
export type EffectScope = { kind: "single" } | { kind: "all" } | { kind: "random"; count: number }

export interface CardEffect {
  type: EffectType
  amount: number
  hits?: number         // 伤害段数（默认 1）
  target?: EffectTarget // 缺省按效果类型取合理方
  scope?: EffectScope
}

// 效果速记构造器（便于卡牌表书写与自定义拓展）
const dm = (amount: number, extra?: Partial<CardEffect>): CardEffect => ({ type: "damage", amount, target: "enemy", scope: { kind: "single" }, ...extra })
const bl = (amount: number): CardEffect => ({ type: "block", amount, target: "self" })
const dr = (amount: number): CardEffect => ({ type: "draw", amount, target: "self" })
const en = (amount: number): CardEffect => ({ type: "energy", amount, target: "self" })
const sd = (amount: number): CardEffect => ({ type: "self-damage", amount, target: "self" })
const vu = (amount: number): CardEffect => ({ type: "apply-vuln", amount, target: "enemy", scope: { kind: "single" } })
const wk = (amount: number): CardEffect => ({ type: "apply-weak", amount, target: "enemy", scope: { kind: "single" } })
const ts = (amount: number): CardEffect => ({ type: "gain-temp-str", amount, target: "self" })
const cp = (): CardEffect => ({ type: "copy-to-discard", amount: 1, target: "self" })

export interface CardDef {
  id: string
  name: string
  icon?: string         // 卡面插画（emoji）
  cost: number          // 能量消耗
  category: CardCategory
  rarity: 0 | 1 | 2     // 0 普通 1 稀有 2 史诗
  effects: CardEffect[] // 按序结算的效果列表
  desc?: string         // 缺省时由 effects 自动生成描述
  spawnOnly?: boolean   // 仅由技能凭空生成，不进入奖励/商店池
  upgraded?: boolean    // 已强化（补给营地/事件强化，效果数值提升）
}

export interface Card { uid: number; def: CardDef }

/** 效果 → 文案：修改卡牌数值后描述自动同步 */
const EFFECT_TEXT: Record<EffectType, (e: CardEffect) => string> = {
  "damage": (e) => (e.hits && e.hits > 1 ? `造成 ${e.amount} 点伤害 ${e.hits} 次` : `造成 ${e.amount} 点伤害`),
  "block": (e) => `获得 ${e.amount} 点格挡`,
  "draw": (e) => `抽 ${e.amount} 张牌`,
  "energy": (e) => `获得 ${e.amount} 点能量`,
  "heal": (e) => `回复 ${e.amount} 点生命`,
  "self-damage": (e) => `失去 ${e.amount} 点生命`,
  "apply-vuln": (e) => `施加 ${e.amount} 层易伤`,
  "apply-weak": (e) => `施加 ${e.amount} 层虚弱`,
  "gain-str": (e) => `获得 ${e.amount} 点力量`,
  "gain-temp-str": (e) => `本回合力量 +${e.amount}`,
  "copy-to-discard": () => `将一张本卡放入弃牌堆`,
}

export function cardDesc(def: CardDef): string {
  return def.desc || def.effects.map((e) => EFFECT_TEXT[e.type](e)).join("，")
}

// ---------------- 卡牌表（自定义新卡：追加一条即可，效果/描述全数据驱动） ----------------
const BASE_CARDS: CardDef[] = [
  { id: "strike", name: "打击", icon: "⚔️", cost: 1, category: "attack", rarity: 0, effects: [dm(6)] },
  { id: "defend", name: "防御", icon: "🛡️", cost: 1, category: "defense", rarity: 0, effects: [bl(5)] },
  { id: "bash", name: "痛击", icon: "🔨", cost: 2, category: "attack", rarity: 0, effects: [dm(8), vu(2)] },
  { id: "flex", name: "爆发", icon: "💪", cost: 0, category: "buff", rarity: 0, effects: [ts(2)] },
  { id: "anger", name: "怒火", icon: "😡", cost: 0, category: "attack", rarity: 0, effects: [dm(6), cp()] },
  { id: "heavy", name: "重锤", icon: "🪨", cost: 2, category: "attack", rarity: 1, effects: [dm(14)] },
  { id: "twin", name: "双重打击", icon: "⚡", cost: 1, category: "attack", rarity: 1, effects: [dm(4, { hits: 2 })] },
  { id: "wave", name: "铁壁波动", icon: "🌊", cost: 1, category: "attack", rarity: 1, effects: [dm(5), bl(5)] },
  { id: "shrug", name: "耸肩防御", icon: "🤷", cost: 1, category: "defense", rarity: 1, effects: [bl(8), dr(1)] },
  { id: "blood", name: "放血", icon: "🩸", cost: 0, category: "special", rarity: 1, effects: [sd(3), en(2)] },
  { id: "pommel", name: "剑柄打击", icon: "🗡️", cost: 1, category: "attack", rarity: 1, effects: [dm(9), dr(1)] },
  { id: "armament", name: "武装", icon: "⚙️", cost: 1, category: "defense", rarity: 1, effects: [bl(5), en(1)] },
  { id: "uppercut", name: "上勾拳", icon: "🥊", cost: 2, category: "attack", rarity: 2, effects: [dm(13), wk(1), vu(1)] },
  { id: "carnage", name: "大屠杀", icon: "☠️", cost: 2, category: "attack", rarity: 2, effects: [dm(20)] },
  // 技能生成的专属卡（不进奖励/商店池）
  { id: "shadowstrike", name: "影袭", icon: "🌑", cost: 0, category: "attack", rarity: 1, spawnOnly: true, effects: [dm(10)] },
]
/** 生效卡牌池 = 基础卡 + 工坊自定义卡（同 id 时自定义覆盖基础） */
export let CARDS: CardDef[] = [...BASE_CARDS]
let CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]))

// ---------------- 角色与技能 ----------------
/** 被动触发时机：atk-bonus 全局生效（打出伤害时加成）；block-on-turn-start 回合开始；energy-on-play-count 打出卡片计数；
 *  start-hand-7 尽瘁（开局摸至 7 张 + 每回合准备阶段按卡组攻击卡数回血并观牌重排）；echo-on-play 打出卡片时同调三选一 */
export type PassiveKind =
  | "atk-bonus" | "block-on-turn-start" | "energy-on-play-count"
  | "start-hand-7" | "echo-on-play"
export interface PassiveDef { kind: PassiveKind; name: string; icon: string; desc: string; value: number }

/** 主动技能：冷却就绪后可在战斗中释放；echo-copy 为每轮对战限一次的选牌复制 */
export type SkillKind = "generate-card" | "gain-block" | "draw-cards" | "echo-copy"
export interface SkillDef { kind: SkillKind; name: string; icon: string; desc: string; cooldown: number; value: number; cardId?: string }

export interface CharacterDef {
  id: string
  name: string
  icon: string
  desc: string
  maxHp: number
  startDeck: string[] // 初始卡组（卡牌 id）
  passives: PassiveDef[]
  skill: SkillDef
}

const BASE_CHARACTERS: CharacterDef[] = [
  {
    id: "blade", name: "刃影", icon: "🥷", maxHp: 80,
    desc: "磨砺锋刃的刺客，攻伐凌厉",
    startDeck: ["strike", "strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bash"],
    passives: [{ kind: "atk-bonus", name: "淬锋", icon: "🗡️", desc: "攻击卡伤害 +1（全局生效）", value: 1 }],
    skill: { kind: "generate-card", name: "影分身", icon: "🌑", desc: "凭空生成一张 0 费【影袭】加入手牌", cooldown: 3, value: 1, cardId: "shadowstrike" },
  },
  {
    id: "guard", name: "铁壁守卫", icon: "🛡️", maxHp: 90,
    desc: "岿然不动的前卫，铜墙铁壁",
    startDeck: ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "defend", "bash", "shrug"],
    passives: [{ kind: "block-on-turn-start", name: "甲铸", icon: "⚒️", desc: "每回合开始时获得 2 点格挡", value: 2 }],
    skill: { kind: "gain-block", name: "钢铁壁垒", icon: "🏰", desc: "立即获得 10 点格挡", cooldown: 3, value: 10 },
  },
  {
    id: "mage", name: "秘法编织者", icon: "🔮", maxHp: 72,
    desc: "编织奥术的智者，牌流不竭",
    startDeck: ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bash", "flex"],
    passives: [{ kind: "energy-on-play-count", name: "奥术涌动", icon: "✨", desc: "每打出 3 张牌获得 1 点能量", value: 3 }],
    skill: { kind: "draw-cards", name: "灵感迸发", icon: "📖", desc: "立即抽 2 张牌", cooldown: 3, value: 2 },
  },
  {
    id: "wuzhuge", name: "武诸葛", icon: "🪶", maxHp: 76,
    desc: "鞠躬尽瘁的谋主，运筹帷幄，牌随势动",
    startDeck: ["strike", "strike", "strike", "strike", "strike", "defend", "defend", "defend", "bash", "anger"],
    passives: [
      { kind: "start-hand-7", name: "尽瘁", icon: "🕯️", desc: "开局摸至 7 张手牌；每回合准备阶段回复生命（= 卡组中攻击卡数量，至少 1），并观看牌堆顶 7 张牌任意安排到顶/底", value: 7 },
      { kind: "echo-on-play", name: "情势", icon: "🀄", desc: "打出卡片时，若手牌中还有同类型（攻击/防御/增益/特殊）的牌，可三选一：效果×同类数量 / 抽同类数量张牌 / 回复同类数量点生命", value: 0 },
    ],
    skill: { kind: "echo-copy", name: "锦囊复刻", icon: "📜", desc: "每轮对战限一次：选择手牌中一张牌生成其原始复制；复制牌打出后会在回合结束时回到手中，未打出则留在手牌", cooldown: 0, value: 1 },
  },
]
/** 生效角色池 = 基础角色 + 工坊自定义角色（同 id 时自定义覆盖基础） */
export let CHARACTERS: CharacterDef[] = [...BASE_CHARACTERS]

export function characterOf(s: RunState): CharacterDef {
  return CHARACTERS.find((c) => c.id === s.charId) || CHARACTERS[0]
}

/** 角色是否带某个被动（多被动架构） */
export function hasPassive(s: RunState, kind: PassiveKind): PassiveDef | undefined {
  return characterOf(s).passives.find((p) => p.kind === kind)
}

// ---------------- 内容工坊：自定义卡/角色的净化与注册（编辑器与游戏共用） ----------------
export const CATEGORIES: CardCategory[] = ["attack", "defense", "buff", "special"]
export const EFFECT_TYPES: EffectType[] = [
  "damage", "block", "draw", "energy", "heal", "self-damage",
  "apply-vuln", "apply-weak", "gain-str", "gain-temp-str", "copy-to-discard",
]
export const EFFECT_TYPE_LABEL: Record<EffectType, string> = {
  "damage": "伤害", "block": "格挡", "draw": "抽牌", "energy": "能量", "heal": "治疗",
  "self-damage": "自伤", "apply-vuln": "施加易伤", "apply-weak": "施加虚弱",
  "gain-str": "获得力量", "gain-temp-str": "本回合力量", "copy-to-discard": "复制入弃牌堆",
}
export const PASSIVE_KINDS: PassiveKind[] = ["atk-bonus", "block-on-turn-start", "energy-on-play-count", "start-hand-7", "echo-on-play"]
export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  "atk-bonus": "攻击伤害 +N（全局）", "block-on-turn-start": "回合开始 +N 格挡",
  "energy-on-play-count": "每打 N 张牌 +1 能量", "start-hand-7": "尽瘁套（开局摸 7 + 准备阶段回血观牌）",
  "echo-on-play": "情势（同类牌三选一）",
}
export const SKILL_KINDS: SkillKind[] = ["generate-card", "gain-block", "draw-cards", "echo-copy"]
export const SKILL_KIND_LABEL: Record<SkillKind, string> = {
  "generate-card": "凭空生成指定卡", "gain-block": "立即获得 N 格挡",
  "draw-cards": "立即抽 N 张牌", "echo-copy": "锦囊复刻（每轮限一次选牌复制）",
}

const clampInt = (v: any, lo: number, hi: number, dft: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dft
}

/** 净化单条效果：类型/数值非法则丢弃 */
export function sanitizeEffect(raw: any): CardEffect | null {
  if (!raw || !EFFECT_TYPES.includes(raw.type)) return null
  const e: CardEffect = { type: raw.type, amount: clampInt(raw.amount, 0, 99, 1) }
  if (raw.type === "damage") e.hits = clampInt(raw.hits, 1, 9, 1)
  if (raw.target === "self" || raw.target === "enemy") e.target = raw.target
  e.scope = { kind: "single" }
  return e
}

/** 净化自定义卡：id/name/至少一条合法效果 缺一不可 */
export function sanitizeCard(raw: any): CardDef | null {
  if (!raw || typeof raw !== "object") return null
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null
  if (!id || !name) return null
  const effects = (Array.isArray(raw.effects) ? raw.effects : []).map(sanitizeEffect).filter(Boolean) as CardEffect[]
  if (effects.length === 0) return null
  return {
    id, name,
    icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "🎴",
    cost: clampInt(raw.cost, 0, 9, 1),
    category: CATEGORIES.includes(raw.category) ? raw.category : "attack",
    rarity: raw.rarity === 1 || raw.rarity === 2 ? raw.rarity : 0,
    effects,
    spawnOnly: !!raw.spawnOnly,
  }
}

/** 净化自定义角色：startDeck 过滤为卡池存在的 id，被动/技能类型非法时回退默认 */
export function sanitizeCharacter(raw: any, pool: CardDef[]): CharacterDef | null {
  if (!raw || typeof raw !== "object") return null
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null
  if (!id || !name) return null
  const ids = new Set(pool.map((c) => c.id))
  let startDeck = (Array.isArray(raw.startDeck) ? raw.startDeck : []).filter((x: any) => typeof x === "string" && ids.has(x))
  if (startDeck.length < 5) startDeck = ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bash", "bash"]
  const passives = (Array.isArray(raw.passives) ? raw.passives : [])
    .filter((p: any) => p && PASSIVE_KINDS.includes(p.kind))
    .map((p: any) => ({
      kind: p.kind as PassiveKind,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : PASSIVE_KIND_LABEL[p.kind as PassiveKind],
      icon: typeof p.icon === "string" && p.icon.trim() ? p.icon.trim() : "✨",
      desc: typeof p.desc === "string" ? p.desc : "",
      value: clampInt(p.value, 0, 99, 1),
    }))
  const sk = raw.skill && SKILL_KINDS.includes(raw.skill.kind) ? raw.skill : { kind: "draw-cards" }
  const skill: SkillDef = {
    kind: sk.kind,
    name: typeof sk.name === "string" && sk.name.trim() ? sk.name.trim() : SKILL_KIND_LABEL[sk.kind as SkillKind],
    icon: typeof sk.icon === "string" && sk.icon.trim() ? sk.icon.trim() : "🌟",
    desc: typeof sk.desc === "string" ? sk.desc : "",
    cooldown: clampInt(sk.cooldown, 0, 9, 3),
    value: clampInt(sk.value, 0, 99, 2),
  }
  if (skill.kind === "generate-card") {
    const cid = ids.has(sk.cardId) ? sk.cardId : "shadowstrike"
    skill.cardId = cid
  }
  return {
    id, name,
    icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "🧙",
    desc: typeof raw.desc === "string" ? raw.desc : "",
    maxHp: clampInt(raw.maxHp, 30, 200, 80),
    startDeck, passives, skill,
  }
}

/** 注册自定义内容：重建生效卡池/角色池与卡 id 索引（游戏页与编辑器共用） */
export function applyCustomContent(cards: any[], chars: any[]) {
  const cc = (Array.isArray(cards) ? cards : []).map(sanitizeCard).filter(Boolean) as CardDef[]
  const customIds = new Set(cc.map((c) => c.id))
  CARDS = [...BASE_CARDS.filter((c) => !customIds.has(c.id)), ...cc]
  CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]))
  const cch = (Array.isArray(chars) ? chars : []).map((r) => sanitizeCharacter(r, CARDS)).filter(Boolean) as CharacterDef[]
  const charIds = new Set(cch.map((c) => c.id))
  CHARACTERS = [...BASE_CHARACTERS.filter((c) => !charIds.has(c.id)), ...cch]
}

// ---------------- 敌人 ----------------
export interface Move {
  name: string
  kind: "atk" | "block" | "buff" | "debuff"
  amt: number
  hits: number
  icon: string
  debuffKind?: "weak" | "vuln"
}

export interface EnemyDef {
  id: string
  name: string
  icon: string
  hp: number
  elite?: boolean
  boss?: boolean
  moves: Move[]
}

export interface EnemyState {
  def: EnemyDef
  hp: number; maxHp: number
  block: number; str: number; weak: number; vuln: number
  move: Move; moveIdx: number
}

const ENEMIES: EnemyDef[] = [
  {
    id: "cultist", name: "邪教徒", icon: "👤", hp: 30, moves: [
      { name: "嚎叫", kind: "buff", amt: 2, hits: 1, icon: "📣" },
      { name: "黑暗打击", kind: "atk", amt: 6, hits: 1, icon: "🗡️" },
      { name: "黑暗打击", kind: "atk", amt: 6, hits: 1, icon: "🗡️" },
    ],
  },
  {
    id: "worm", name: "颚虫", icon: "🐛", hp: 34, moves: [
      { name: "撕咬", kind: "atk", amt: 11, hits: 1, icon: "👄" },
      { name: "鞭打", kind: "atk", amt: 7, hits: 1, icon: "💥" },
      { name: "盘蜷", kind: "block", amt: 6, hits: 1, icon: "🛡️" },
    ],
  },
  {
    id: "louse", name: "虱子", icon: "🪲", hp: 24, moves: [
      { name: "叮咬", kind: "atk", amt: 6, hits: 1, icon: "🦷" },
      { name: "吐丝", kind: "debuff", amt: 2, hits: 1, icon: "🕸️", debuffKind: "weak" },
      { name: "叮咬", kind: "atk", amt: 6, hits: 1, icon: "🦷" },
    ],
  },
  {
    id: "slime", name: "酸液史莱姆", icon: "🦠", hp: 36, moves: [
      { name: "撞击", kind: "atk", amt: 9, hits: 1, icon: "💢" },
      { name: "重压", kind: "atk", amt: 12, hits: 1, icon: "🫠" },
      { name: "分泌", kind: "buff", amt: 2, hits: 1, icon: "🫧" },
    ],
  },
  {
    id: "fungi", name: "真菌兽", icon: "🍄", hp: 28, moves: [
      { name: "生长", kind: "buff", amt: 3, hits: 1, icon: "🌱" },
      { name: "啃咬", kind: "atk", amt: 7, hits: 1, icon: "🦷" },
      { name: "孢子喷吐", kind: "debuff", amt: 1, hits: 1, icon: "☁️", debuffKind: "vuln" },
    ],
  },
  {
    id: "nob", name: "哥布林头目", icon: "👹", hp: 62, elite: true, moves: [
      { name: "怒吼", kind: "buff", amt: 2, hits: 1, icon: "📣" },
      { name: "冲撞", kind: "atk", amt: 13, hits: 1, icon: "🐂" },
      { name: "碎颅击", kind: "atk", amt: 9, hits: 1, icon: "💀" },
    ],
  },
  {
    id: "sentry", name: "石像哨卫", icon: "🗿", hp: 58, elite: true, moves: [
      { name: "石化凝视", kind: "debuff", amt: 1, hits: 1, icon: "👁️", debuffKind: "vuln" },
      { name: "重拳", kind: "atk", amt: 12, hits: 1, icon: "🪨" },
      { name: "岩甲", kind: "block", amt: 9, hits: 1, icon: "🛡️" },
    ],
  },
  {
    id: "king", name: "史莱姆之王", icon: "👑", hp: 130, boss: true, moves: [
      { name: "王者重击", kind: "atk", amt: 16, hits: 1, icon: "👑" },
      { name: "泰山压顶", kind: "atk", amt: 11, hits: 1, icon: "🌊" },
      { name: "沸腾", kind: "buff", amt: 3, hits: 1, icon: "🫧" },
      { name: "腐蚀喷吐", kind: "debuff", amt: 2, hits: 1, icon: "☠️", debuffKind: "weak" },
    ],
  },
]

// ---------------- 状态与特效事件 ----------------
export type Phase = "map" | "combat" | "reward" | "rest" | "shop" | "event" | "over" | "win"

// ---------------- 地图：随机 DAG 路线图，所有路径汇聚于 BOSS ----------------
export type NodeType = "enemy" | "elite" | "boss" | "rest" | "shop" | "event"
export interface MapNode { id: string; row: number; col: number; type: NodeType; next: string[] }
export interface SpireMap { nodes: MapNode[] }
export const MAP_ROWS = 7
export const NODE_META: Record<NodeType, { icon: string; name: string }> = {
  enemy: { icon: "⚔️", name: "普通敌人" },
  elite: { icon: "👹", name: "精英敌人" },
  boss: { icon: "👑", name: "BOSS" },
  rest: { icon: "🔥", name: "补给营地" },
  shop: { icon: "🛒", name: "商店" },
  event: { icon: "❓", name: "未知事件" },
}

// ---------------- 药水 ----------------
export type PotionKind = "heal" | "block" | "energy" | "str"
export const MAX_POTIONS = 3
export const POTION_DEFS: Record<PotionKind, { name: string; icon: string; desc: string }> = {
  heal: { name: "治疗药水", icon: "❤️", desc: "回复 25% 最大生命" },
  block: { name: "格挡药水", icon: "🛡️", desc: "当前战斗获得 12 点格挡" },
  energy: { name: "能量药水", icon: "⚡", desc: "当前战斗获得 2 点能量" },
  str: { name: "力量药水", icon: "💪", desc: "当前战斗力量 +2" },
}

// 战斗特效事件（引擎只描述发生了什么，动画由前端渲染）
export type FxTarget = "player" | "enemy"
export type FxEvent =
  | { kind: "hit"; target: FxTarget; dmg: number }
  | { kind: "gain-block"; target: FxTarget; amt: number }
  | { kind: "gain-str"; target: FxTarget; amt: number }
  | { kind: "debuff"; target: FxTarget; stat: "weak" | "vuln"; amt: number }
  | { kind: "self-dmg"; amt: number }
  | { kind: "heal"; amt: number }
  | { kind: "energy"; amt: number }
  | { kind: "draw"; amt: number }
  | { kind: "generate"; name: string }

export interface ShopItem { uid: number; def: CardDef; price: number }

export interface RunState {
  phase: Phase
  charId: string
  floor: number
  maxFloor: number
  hp: number; maxHp: number
  gold: number
  deck: CardDef[] // 主卡组
  // 地图进度
  map: SpireMap
  pos: string | null      // 当前所在节点（null = 尚未出发）
  visited: string[]       // 已走过的节点 id
  potions: PotionKind[]   // 携带的药水（上限 MAX_POTIONS）
  eventResult: { icon: string; title: string; desc: string; result: string } | null
  // 战斗内
  draw: Card[]; hand: Card[]; discard: Card[]
  energy: number; block: number; str: number; tempStr: number
  weak: number; vuln: number
  turn: number
  playedThisTurn: number // 本回合已打出牌数（被动钩子用）
  skillCd: number        // 主动技能冷却（0 = 就绪）
  // 武诸葛交互态：观牌重排 / 情势三选一 / 原始复制
  pendingScry: Card[] | null      // 观看中的牌堆顶卡牌
  scryTop: boolean[]              // 与 pendingScry 对应：true 放牌堆顶，false 放牌堆底
  pendingEcho: { uid: number; def: CardDef; count: number } | null
  echoCopyUid: number | null      // 原始复制牌的 uid
  echoCopyPlayed: Card | null     // 已打出的原始复制牌（回合结束时回手）
  echoCopyUsed: boolean           // 本轮对战是否已用过复制技能
  enemy: EnemyState | null
  // 奖励 / 商店
  rewardCards: Card[]
  lastGold: number
  shopCards: ShopItem[]
  shopPotions: { kind: PotionKind; price: number }[]
  shopRemoveUsed: boolean
  log: string[]
  uidSeq: number
  kills: number
}

export const MAX_FLOOR = MAP_ROWS
export const REMOVE_COST = 75
export const REST_RATIO = 0.3

// ---------------- 工具 ----------------
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
const rnd = (n: number) => Math.floor(Math.random() * n)

function log(s: RunState, msg: string) {
  s.log.push(msg)
  if (s.log.length > 30) s.log.shift()
}

// ---------------- 开局 ----------------
export function newRun(charId = "blade"): RunState {
  const ch = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0]
  const s: RunState = {
    phase: "map",
    charId: ch.id,
    floor: 0, maxFloor: MAP_ROWS,
    hp: ch.maxHp, maxHp: ch.maxHp, gold: 60,
    deck: [],
    map: generateMap(), pos: null, visited: [], potions: [], eventResult: null,
    draw: [], hand: [], discard: [],
    energy: 3, block: 0, str: 0, tempStr: 0,
    weak: 0, vuln: 0, turn: 1,
    playedThisTurn: 0, skillCd: 0,
    pendingScry: null, scryTop: [], pendingEcho: null,
    echoCopyUid: null, echoCopyPlayed: null, echoCopyUsed: false,
    enemy: null,
    rewardCards: [], lastGold: 0,
    shopCards: [], shopPotions: [], shopRemoveUsed: false,
    log: [], uidSeq: 1, kills: 0,
  }
  for (const id of ch.startDeck) s.deck.push(CARD_BY_ID[id])
  log(s, "旅途开始：从起点选择一条路线，向尖塔顶端进发！")
  return s
}

// ---------------- 地图生成：随机 DAG，所有路线最终汇聚 BOSS ----------------
export function generateMap(): SpireMap {
  const nodes: MapNode[] = []
  const cols: number[] = [3]
  for (let r = 1; r < MAP_ROWS - 1; r++) cols.push(2 + rnd(3)) // 中间行 2~4 个节点
  cols.push(1)
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < cols[r]; c++) nodes.push({ id: `r${r}c${c}`, row: r, col: c, type: "enemy", next: [] })
  }
  const rowOf = (r: number) => nodes.filter((n) => n.row === r)
  // 特殊节点：商店×2(rows1-4) / 补给×2(rows2-5) / 事件×2(rows1-5) / 精英×1(rows3-5)，其余默认普通敌人
  const assign = (row: number, type: NodeType) => {
    const cands = rowOf(row).filter((n) => n.type === "enemy")
    if (cands.length > 0) cands[rnd(cands.length)].type = type
  }
  assign(1 + rnd(4), "shop"); assign(1 + rnd(4), "shop")
  assign(2 + rnd(4), "rest"); assign(2 + rnd(4), "rest")
  assign(1 + rnd(5), "event"); assign(1 + rnd(5), "event")
  assign(3 + rnd(3), "elite")
  nodes[nodes.length - 1].type = "boss"
  // 边：每节点连下一行 1~2 个，并保证下一行每个节点至少一条入边（任何路线都能走到 BOSS）
  for (let r = 0; r < MAP_ROWS - 1; r++) {
    const cur = rowOf(r), nxt = rowOf(r + 1)
    const hasIn = new Set<string>()
    for (const n of cur) {
      const picks = shuffle(nxt.slice()).slice(0, Math.min(nxt.length, 1 + rnd(2)))
      for (const p of picks) { n.next.push(p.id); hasIn.add(p.id) }
    }
    for (const p of nxt) if (!hasIn.has(p.id)) cur[rnd(cur.length)].next.push(p.id)
  }
  return { nodes }
}

export function nodeById(s: RunState, id: string): MapNode | undefined {
  return s.map.nodes.find((n) => n.id === id)
}

/** 下一步可到达的节点 id：尚未出发时为全部起点，否则为当前节点的后继 */
export function reachableIds(s: RunState): string[] {
  if (!s.pos) return s.map.nodes.filter((n) => n.row === 0).map((n) => n.id)
  return nodeById(s, s.pos)?.next.slice() ?? []
}

/** 按行分组的地图节点（第 0 行在前，供 UI 渲染） */
export function mapRows(s: RunState): MapNode[][] {
  const rows: MapNode[][] = Array.from({ length: MAP_ROWS }, () => [])
  for (const n of s.map.nodes) rows[n.row].push(n)
  for (const r of rows) r.sort((a, b) => a.col - b.col)
  return rows
}

/** 进入下一节点：按类型分流（战斗 / 补给 / 商店 / 事件） */
export function enterNode(s: RunState, id: string): FxEvent[] {
  const fx: FxEvent[] = []
  if (s.phase !== "map" || !reachableIds(s).includes(id)) return fx
  const node = nodeById(s, id)
  if (!node) return fx
  s.pos = id
  s.visited.push(id)
  s.floor = node.row + 1
  if (node.type === "rest") { s.phase = "rest"; log(s, `—— 补给营地（${s.floor}/${MAP_ROWS}）——`); return fx }
  if (node.type === "shop") { openShop(s); return fx }
  if (node.type === "event") { resolveEvent(s); return fx }
  startCombat(s, node.type)
  return fx
}

// ---------------- 敌人选择（按节点类型） ----------------
function pickEnemyDef(type: NodeType, floor: number): EnemyDef {
  if (type === "boss") return ENEMIES.find((e) => e.id === "king")!
  if (type === "elite") {
    const pool = ENEMIES.filter((e) => e.elite)
    return pool[rnd(pool.length)]
  }
  const ids = floor <= 3 ? ["cultist", "louse", "worm"] : ["cultist", "worm", "slime", "fungi", "louse"]
  return ENEMIES.find((e) => e.id === ids[rnd(ids.length)])!
}

export function enemyAtkPreview(e: EnemyState): number {
  let d = e.move.amt + e.str
  if (e.weak > 0) d = Math.floor(d * 0.75)
  return d
}

function startCombat(s: RunState, type: NodeType) {
  const def = pickEnemyDef(type, s.floor)
  const hp = Math.round(def.hp * (1 + (s.floor - 1) * 0.06))
  const moveIdx = rnd(def.moves.length)
  s.enemy = { def, hp, maxHp: hp, block: 0, str: 0, weak: 0, vuln: 0, move: def.moves[moveIdx], moveIdx }
  s.phase = "combat"
  s.block = 0; s.str = 0; s.tempStr = 0; s.weak = 0; s.vuln = 0
  s.energy = 3; s.turn = 1; s.playedThisTurn = 0
  s.draw = shuffle(s.deck.map((d) => ({ uid: s.uidSeq++, def: d })))
  s.hand = []; s.discard = []
  s.pendingScry = null; s.scryTop = []; s.pendingEcho = null
  s.echoCopyUid = null; s.echoCopyUsed = false
  // 被动钩子（开局时机）：武诸葛【尽瘁】开局摸至 7 张
  drawCards(s, hasPassive(s, "start-hand-7")?.value ?? 5)
  log(s, `—— 第 ${s.floor} 层：${def.name} 出现了 ——`)
}

function drawCards(s: RunState, n: number) {
  for (let i = 0; i < n; i++) {
    if (s.draw.length === 0) {
      if (s.discard.length === 0) return
      s.draw = shuffle(s.discard)
      s.discard = []
    }
    if (s.hand.length >= 10) { s.discard.push(s.draw.pop()!); continue }
    s.hand.push(s.draw.pop()!)
  }
}

// ---------------- 效果结算 ----------------
/** 被动：攻击伤害加成（全局生效类） */
function passiveAtkBonus(s: RunState): number {
  return hasPassive(s, "atk-bonus")?.value ?? 0
}

/** 对当前敌人结算一次伤害：力量/被动加成 → 虚弱/易伤修正 → 格挡吸收（血量钳制不为负） */
function hitEnemy(s: RunState, base: number, fx: FxEvent[]): number {
  const e = s.enemy!
  let dmg = base + s.str + s.tempStr + passiveAtkBonus(s)
  if (s.weak > 0) dmg = Math.floor(dmg * 0.75)
  if (e.vuln > 0) dmg = Math.floor(dmg * 1.5)
  const absorbed = Math.min(e.block, dmg)
  e.block -= absorbed
  e.hp = Math.max(0, e.hp - (dmg - absorbed))
  fx.push({ kind: "hit", target: "enemy", dmg })
  return dmg
}

/** 统一效果结算：卡牌/技能产生的 CardEffect 都走这里，拓展新效果类型只需加一个 case */
function applyCardEffect(s: RunState, eff: CardEffect, src: CardDef, fx: FxEvent[]) {
  const e = s.enemy!
  switch (eff.type) {
    case "damage": {
      const hits = eff.hits ?? 1
      for (let i = 0; i < hits && e.hp > 0; i++) {
        const dmg = hitEnemy(s, eff.amount, fx)
        log(s, `${src.name} 造成 ${dmg} 伤害`)
      }
      break
    }
    case "block":
      s.block += eff.amount
      log(s, `获得 ${eff.amount} 格挡`)
      fx.push({ kind: "gain-block", target: "player", amt: eff.amount })
      break
    case "draw":
      drawCards(s, eff.amount)
      log(s, `抽 ${eff.amount} 张牌`)
      fx.push({ kind: "draw", amt: eff.amount })
      break
    case "energy":
      s.energy += eff.amount
      fx.push({ kind: "energy", amt: eff.amount })
      break
    case "heal":
      s.hp = Math.min(s.maxHp, s.hp + eff.amount)
      log(s, `回复 ${eff.amount} 生命`)
      fx.push({ kind: "heal", amt: eff.amount })
      break
    case "self-damage":
      s.hp = Math.max(1, s.hp - eff.amount)
      log(s, `你失去 ${eff.amount} 生命`)
      fx.push({ kind: "self-dmg", amt: eff.amount })
      break
    case "apply-vuln":
      if (e.hp > 0) { e.vuln += eff.amount; log(s, `${e.def.name} 易伤 +${eff.amount}`); fx.push({ kind: "debuff", target: "enemy", stat: "vuln", amt: eff.amount }) }
      break
    case "apply-weak":
      if (e.hp > 0) { e.weak += eff.amount; log(s, `${e.def.name} 虚弱 +${eff.amount}`); fx.push({ kind: "debuff", target: "enemy", stat: "weak", amt: eff.amount }) }
      break
    case "gain-str":
      s.str += eff.amount
      log(s, `力量 +${eff.amount}`)
      fx.push({ kind: "gain-str", target: "player", amt: eff.amount })
      break
    case "gain-temp-str":
      s.tempStr += eff.amount
      log(s, `本回合力量 +${eff.amount}`)
      fx.push({ kind: "gain-str", target: "player", amt: eff.amount })
      break
    case "copy-to-discard":
      s.discard.push({ uid: s.uidSeq++, def: src })
      log(s, `一张【${src.name}】进入弃牌堆`)
      break
  }
}

// ---------------- 出牌 ----------------
export function playCard(s: RunState, uid: number): FxEvent[] {
  const fx: FxEvent[] = []
  if (s.phase !== "combat" || !s.enemy || s.pendingEcho || s.pendingScry) return fx
  const idx = s.hand.findIndex((c) => c.uid === uid)
  if (idx < 0) return fx
  const c = s.hand[idx]
  const d = c.def
  if (d.cost > s.energy) return fx
  s.energy -= d.cost
  s.playedThisTurn++

  const isEchoCopy = c.uid === s.echoCopyUid

  // 被动钩子（打出卡片时机）：武诸葛【情势】手牌中有同类型牌时可三选一（在移除手牌前统计）
  const echo = hasPassive(s, "echo-on-play")
  if (echo) {
    const same = s.hand.filter((x) => x.uid !== uid && x.def.category === d.category).length
    if (same > 0) {
      if (same === 1) {
        // 仅 1 张同类时倍率无增益，直接给摸牌/回血
        drawCards(s, 1)
        s.hp = Math.min(s.maxHp, s.hp + 1)
        log(s, `被动【情势】：摸 1 张牌并回复 1 生命`)
        fx.push({ kind: "draw", amt: 1 }, { kind: "heal", amt: 1 })
      } else {
        s.pendingEcho = { uid, def: d, count: same }
      }
    }
  }

  if (!s.pendingEcho) {
    for (const eff of d.effects) applyCardEffect(s, eff, d, fx)
  }

  // 被动钩子（打出卡片时机）：秘法编织者每打出 N 张牌获得 1 能量
  const pe = hasPassive(s, "energy-on-play-count")
  if (pe && s.playedThisTurn % pe.value === 0) {
    s.energy += 1
    log(s, `被动【${pe.name}】：获得 1 点能量`)
    fx.push({ kind: "energy", amt: 1 })
  }

  s.hand.splice(idx, 1)
  if (isEchoCopy) {
    // 原始复制牌：打出后暂存，回合结束时回到手中（不复制回卡组）
    s.echoCopyUid = null
    s.echoCopyPlayed = c
  } else {
    s.discard.push(c)
  }

  if (s.enemy.hp <= 0) victory(s)
  return fx
}

/** 情势三选一：① 本卡效果×同类数量 ② 抽同类数量张牌 ③ 回复同类数量点生命 */
export function resolveEcho(s: RunState, choice: 1 | 2 | 3): FxEvent[] {
  const fx: FxEvent[] = []
  const pe = s.pendingEcho
  if (!pe) return fx
  s.pendingEcho = null
  if (choice === 1) {
    log(s, `情势：【${pe.def.name}】效果 ×${pe.count}`)
    for (const eff of pe.def.effects) {
      applyCardEffect(s, { ...eff, amount: eff.amount * pe.count }, pe.def, fx)
    }
  } else if (choice === 2) {
    drawCards(s, pe.count)
    log(s, `情势：抽 ${pe.count} 张牌`)
    fx.push({ kind: "draw", amt: pe.count })
  } else {
    s.hp = Math.min(s.maxHp, s.hp + pe.count)
    log(s, `情势：回复 ${pe.count} 生命`)
    fx.push({ kind: "heal", amt: pe.count })
  }
  // 修复：情势【乘胜追击】造成的伤害也可能击杀敌人，必须补胜利判定（否则敌方血量成负却不切下一节点）
  if (s.phase === "combat" && s.enemy && s.enemy.hp <= 0) victory(s)
  return fx
}

/** 被动【尽瘁】观牌：取出牌堆顶至多 7 张，由玩家安排放回顶/底 */
export function startScry(s: RunState): boolean {
  if (s.pendingScry) return false
  const n = Math.min(7, s.draw.length)
  if (n === 0) { log(s, "抽牌堆为空，无牌可观看"); return false }
  s.pendingScry = s.draw.slice(s.draw.length - n).reverse() // 牌堆顶在前
  s.scryTop = new Array(n).fill(true)
  return true
}

/** 确认观牌安排：选「顶」的牌按原相对顺序叠回顶部，其余压底（全部压底且观看的是整个牌堆 → 维持原样）
 * 注：s.draw 尾部为牌堆顶；pendingScry[0] 为原牌堆顶 */
export function resolveScry(s: RunState): FxEvent[] {
  const cards = s.pendingScry
  if (!cards) return []
  const tops = cards.filter((_, i) => s.scryTop[i])
  const bottoms = cards.filter((_, i) => !s.scryTop[i])
  const rest = s.draw.slice(0, s.draw.length - cards.length)
  if (bottoms.length === cards.length && rest.length === 0) {
    s.draw = cards.slice().reverse() // 无实质安排，还原
  } else {
    // 压底组反序 unshift → 组内相对抽取顺序不变；置顶组反序 push → 原顶牌仍是顶
    s.draw = [...bottoms.slice().reverse(), ...rest, ...tops.slice().reverse()]
  }
  s.pendingScry = null
  s.scryTop = []
  log(s, `已安排 ${tops.length} 张置顶、${bottoms.length} 张沉底`)
  return []
}

// ---------------- 主动技能 ----------------
export function useSkill(s: RunState): FxEvent[] {
  const fx: FxEvent[] = []
  if (s.phase !== "combat" || s.skillCd > 0 || s.pendingEcho || s.pendingScry) return fx
  const sk = characterOf(s).skill
  if (sk.kind === "echo-copy") return fx // 每轮对战限一次，前端选牌后调用 echoCopyCard
  s.skillCd = sk.cooldown
  if (sk.kind === "generate-card" && sk.cardId) {
    const def = CARD_BY_ID[sk.cardId]
    const card: Card = { uid: s.uidSeq++, def }
    if (s.hand.length < 10) s.hand.push(card)
    else s.discard.push(card)
    log(s, `技能【${sk.name}】：生成【${def.name}】`)
    fx.push({ kind: "generate", name: def.name })
  } else if (sk.kind === "gain-block") {
    s.block += sk.value
    log(s, `技能【${sk.name}】：获得 ${sk.value} 格挡`)
    fx.push({ kind: "gain-block", target: "player", amt: sk.value })
  } else if (sk.kind === "draw-cards") {
    drawCards(s, sk.value)
    log(s, `技能【${sk.name}】：抽 ${sk.value} 张牌`)
    fx.push({ kind: "draw", amt: sk.value })
  }
  return fx
}

/** 武诸葛【锦囊复刻】：复制手牌中一张牌（每轮对战限一次） */
export function echoCopyCard(s: RunState, uid: number): FxEvent[] {
  const fx: FxEvent[] = []
  if (s.phase !== "combat" || s.echoCopyUsed) return fx
  const src = s.hand.find((c) => c.uid === uid)
  if (!src) return fx
  s.echoCopyUsed = true
  const copy: Card = { uid: s.uidSeq++, def: src.def }
  s.hand.push(copy)
  s.echoCopyUid = copy.uid
  log(s, `技能【锦囊复刻】：复制【${src.def.name}】，回合结束前未打出将留在手中`)
  fx.push({ kind: "generate", name: src.def.name })
  return fx
}

function victory(s: RunState) {
  const e = s.enemy!
  s.pendingEcho = null
  s.kills++
  const gold = 8 + s.floor * 2 + rnd(6) + (e.def.elite ? 15 : 0) + (e.def.boss ? 30 : 0)
  s.gold += gold
  s.lastGold = gold
  log(s, `${e.def.name} 被击败！获得 ${gold} 金币`)
  const isBoss = !!e.def.boss
  s.enemy = null
  if (isBoss) { s.phase = "win"; return }
  s.rewardCards = rollRewardCards(s)
  s.phase = "reward"
}

function rollRewardCards(s: RunState): Card[] {
  const picked: CardDef[] = []
  let guard = 0
  while (picked.length < 3 && guard++ < 100) {
    const r = Math.random()
    const rarity = r < 0.6 ? 0 : r < 0.92 ? 1 : 2
    const pool = CARDS.filter((c) => c.rarity === rarity && !c.spawnOnly && !picked.includes(c))
    if (pool.length === 0) continue
    picked.push(pool[rnd(pool.length)])
  }
  return picked.map((def) => ({ uid: s.uidSeq++, def }))
}

// ---------------- 结束回合 / 敌方行动 ----------------
export function endTurn(s: RunState): FxEvent[] {
  const fx: FxEvent[] = []
  if (s.phase !== "combat" || !s.enemy) return fx
  if (s.pendingEcho || s.pendingScry) return fx // 情势/观牌未决：先完成安排
  // 原始复制牌：未打出则保留在手牌（跳过弃置），已打出则回合结束回手
  if (s.echoCopyPlayed) {
    s.hand.push(s.echoCopyPlayed)
    s.echoCopyPlayed = null
    log(s, "复制牌回到手中")
  }
  s.discard.push(...s.hand)
  s.hand = []
  if (s.weak > 0) s.weak--
  if (s.vuln > 0) s.vuln--
  enemyAct(s, fx)
  if (s.phase !== "combat") return fx
  // 新回合
  s.block = 0
  s.tempStr = 0
  s.energy = 3
  s.turn++
  s.playedThisTurn = 0
  if (s.skillCd > 0) s.skillCd--
  // 被动钩子（回合开始时机）：铁壁守卫获得格挡
  const pb = hasPassive(s, "block-on-turn-start")
  if (pb) {
    s.block += pb.value
    log(s, `被动【${pb.name}】：获得 ${pb.value} 格挡`)
    fx.push({ kind: "gain-block", target: "player", amt: pb.value })
  }
  // 被动钩子（回合准备阶段）：武诸葛【尽瘁】按卡组攻击卡数量回血（至少 1）并观牌
  if (hasPassive(s, "start-hand-7")) {
    const heal = Math.max(1, s.deck.filter((d) => d.category === "attack").length)
    s.hp = Math.min(s.maxHp, s.hp + heal)
    log(s, `尽瘁：回复 ${heal} 生命（卡组攻击卡 ${s.deck.filter((d) => d.category === "attack").length} 张）`)
    fx.push({ kind: "heal", amt: heal })
    startScry(s)
  }
  drawCards(s, 5)
  return fx
}

function enemyAct(s: RunState, fx: FxEvent[]) {
  const e = s.enemy!
  e.block = 0
  const m = e.move
  if (m.kind === "atk") {
    const hits = m.hits
    for (let i = 0; i < hits && s.hp > 0; i++) {
      let dmg = m.amt + e.str
      if (e.weak > 0) dmg = Math.floor(dmg * 0.75)
      if (s.vuln > 0) dmg = Math.floor(dmg * 1.5)
      const absorbed = Math.min(s.block, dmg)
      s.block -= absorbed
      s.hp -= dmg - absorbed
      if (absorbed > 0) log(s, `${m.name}：格挡吸收 ${absorbed}，受到 ${dmg - absorbed} 伤害`)
      else log(s, `${m.name} 对你造成 ${dmg} 伤害`)
      fx.push({ kind: "hit", target: "player", dmg: dmg - absorbed })
    }
  } else if (m.kind === "block") {
    e.block += m.amt
    log(s, `${e.def.name} 获得 ${m.amt} 格挡`)
    fx.push({ kind: "gain-block", target: "enemy", amt: m.amt })
  } else if (m.kind === "buff") {
    e.str += m.amt
    log(s, `${e.def.name} 力量 +${m.amt}`)
    fx.push({ kind: "gain-str", target: "enemy", amt: m.amt })
  } else if (m.kind === "debuff") {
    if (m.debuffKind === "weak") { s.weak += m.amt; log(s, `你被施加 ${m.amt} 层虚弱`); fx.push({ kind: "debuff", target: "player", stat: "weak", amt: m.amt }) }
    else { s.vuln += m.amt; log(s, `你被施加 ${m.amt} 层易伤`); fx.push({ kind: "debuff", target: "player", stat: "vuln", amt: m.amt }) }
  }
  if (s.hp <= 0) { s.hp = 0; s.phase = "over"; log(s, "你倒下了……"); return }
  if (e.weak > 0) e.weak--
  if (e.vuln > 0) e.vuln--
  pickNextMove(e)
}

function pickNextMove(e: EnemyState) {
  const moves = e.def.moves
  if (moves.length <= 1) return
  let idx = rnd(moves.length)
  if (idx === e.moveIdx) idx = (idx + 1) % moves.length
  e.moveIdx = idx
  e.move = moves[idx]
}

// ---------------- 奖励 / 营地 / 商店 ----------------
export function chooseReward(s: RunState, uid: number | null) {
  if (s.phase !== "reward") return
  if (uid != null) {
    const c = s.rewardCards.find((x) => x.uid === uid)
    if (c) { s.deck.push(c.def); log(s, `获得卡牌【${c.def.name}】`) }
  }
  s.phase = "map"
}

// ---------------- 补给营地：回血或强化一张卡 ----------------
export function restHeal(s: RunState): FxEvent[] {
  if (s.phase !== "rest") return []
  const heal = Math.ceil(s.maxHp * REST_RATIO)
  s.hp = Math.min(s.maxHp, s.hp + heal)
  log(s, `营地休整：回复 ${heal} 生命`)
  s.phase = "map"
  return [{ kind: "heal", amt: heal }]
}

/** 强化主卡组指定下标的卡：效果数值提升、名称加「·强」 */
export function restUpgrade(s: RunState, deckIdx: number) {
  if (s.phase !== "rest") return
  if (deckIdx < 0 || deckIdx >= s.deck.length) return
  if (s.deck[deckIdx].upgraded) return
  upgradeCardDef(s, deckIdx)
  s.phase = "map"
}

function upgradeEffect(e: CardEffect): CardEffect {
  if (e.type === "copy-to-discard") return { ...e }
  return { ...e, amount: Math.max(e.amount + 1, Math.ceil(e.amount * 1.25)) }
}

function upgradeCardDef(s: RunState, deckIdx: number) {
  const def = s.deck[deckIdx]
  const up: CardDef = { ...def, name: `${def.name}·强`, upgraded: true, effects: def.effects.map(upgradeEffect) }
  s.deck[deckIdx] = up
  log(s, `强化【${def.name}】→【${up.name}】`)
}

function openShop(s: RunState) {
  s.shopCards = []
  s.shopPotions = []
  s.shopRemoveUsed = false
  const defs = shuffle(CARDS.filter((c) => !c.spawnOnly)).slice(0, 3)
  for (const def of defs) {
    const price = def.rarity === 0 ? 40 : def.rarity === 1 ? 60 : 90
    s.shopCards.push({ uid: s.uidSeq++, def, price })
  }
  const kinds = shuffle(Object.keys(POTION_DEFS) as PotionKind[]).slice(0, 2)
  for (const kind of kinds) s.shopPotions.push({ kind, price: 35 })
  s.phase = "shop"
  log(s, `—— 商店（${s.floor}/${MAP_ROWS}）：出售卡牌与药水 ——`)
}

export function buyPotion(s: RunState, idx: number) {
  if (s.phase !== "shop") return
  const item = s.shopPotions[idx]
  if (!item || s.gold < item.price || s.potions.length >= MAX_POTIONS) return
  s.gold -= item.price
  s.potions.push(item.kind)
  s.shopPotions.splice(idx, 1)
  log(s, `购入【${POTION_DEFS[item.kind].name}】`)
}

export function buyCard(s: RunState, uid: number) {
  if (s.phase !== "shop") return
  const idx = s.shopCards.findIndex((x) => x.uid === uid)
  if (idx < 0) return
  const item = s.shopCards[idx]
  if (s.gold < item.price) return
  s.gold -= item.price
  s.deck.push(item.def)
  s.shopCards.splice(idx, 1)
  log(s, `购入【${item.def.name}】`)
}

/** 按主卡组下标移除一张卡（每次进店限一次） */
export function removeCard(s: RunState, deckIdx: number) {
  if (s.phase !== "shop" || s.shopRemoveUsed) return
  if (s.gold < REMOVE_COST || s.deck.length <= 5) return
  if (deckIdx < 0 || deckIdx >= s.deck.length) return
  const removed = s.deck.splice(deckIdx, 1)[0]
  s.gold -= REMOVE_COST
  s.shopRemoveUsed = true
  log(s, `移除卡牌【${removed.name}】`)
}

export function leaveShop(s: RunState) {
  if (s.phase !== "shop") return
  s.phase = "map"
}

// ---------------- 药水：治疗随时可用，其余仅战斗中可用 ----------------
export function usePotion(s: RunState, idx: number): FxEvent[] {
  const fx: FxEvent[] = []
  const kind = s.potions[idx]
  if (!kind) return fx
  if (kind !== "heal" && s.phase !== "combat") return fx
  if (kind === "heal") {
    const heal = Math.ceil(s.maxHp * 0.25)
    s.hp = Math.min(s.maxHp, s.hp + heal)
    log(s, `使用【治疗药水】：回复 ${heal} 生命`)
    fx.push({ kind: "heal", amt: heal })
  } else if (kind === "block") {
    s.block += 12
    log(s, `使用【格挡药水】：获得 12 点格挡`)
    fx.push({ kind: "gain-block", target: "player", amt: 12 })
  } else if (kind === "energy") {
    s.energy += 2
    log(s, `使用【能量药水】：获得 2 点能量`)
    fx.push({ kind: "energy", amt: 2 })
  } else {
    s.str += 2
    log(s, `使用【力量药水】：力量 +2`)
    fx.push({ kind: "gain-str", target: "player", amt: 2 })
  }
  s.potions.splice(idx, 1)
  return fx
}

// ---------------- 随机幸运事件（可获得道具/资源） ----------------
type SpireEvent = { icon: string; title: string; desc: string; resolve: (s: RunState) => string }
const EVENTS: SpireEvent[] = [
  { icon: "🎁", title: "被遗忘的宝箱", desc: "一个蒙尘的宝箱静静躺在阴影里。", resolve: (s) => { const gold = 30 + rnd(21); s.gold += gold; return `获得 ${gold} 金币` } },
  { icon: "⚗️", title: "炼金台", desc: "一台被遗弃的炼金装置仍能使用。", resolve: (s) => {
      if (s.potions.length >= MAX_POTIONS) { s.gold += 20; return "药水架已满，材料折算为 20 金币" }
      const kinds: PotionKind[] = ["heal", "block", "energy", "str"]
      const k = kinds[rnd(kinds.length)]
      s.potions.push(k)
      return `酿制出【${POTION_DEFS[k].name}】`
    } },
  { icon: "📜", title: "古老卷轴", desc: "卷轴上的符文微微发光。", resolve: (s) => { const c = rollRewardCards(s)[0]; s.deck.push(c.def); return `领悟卡牌【${c.def.name}】并加入卡组` } },
  { icon: "⛲", title: "治愈之泉", desc: "石缝间涌出清甜的泉水。", resolve: (s) => { const heal = Math.ceil(s.maxHp * 0.2); s.hp = Math.min(s.maxHp, s.hp + heal); return `回复 ${heal} 生命` } },
  { icon: "🎲", title: "赌徒的骰子", desc: "一位神秘赌徒邀你掷骰赌运。", resolve: (s) => {
      if (Math.random() < 0.5) { const gold = 40 + rnd(21); s.gold += gold; return `手气大顺！赢得 ${gold} 金币` }
      const loss = Math.min(20, s.gold); s.gold -= loss
      return `手气不佳，输掉 ${loss} 金币`
    } },
  { icon: "🔨", title: "流浪铁匠", desc: "云游铁匠愿免费为你打磨一件装备。", resolve: (s) => {
      const cands = s.deck.map((_, i) => i).filter((i) => !s.deck[i].upgraded)
      if (cands.length === 0) { s.gold += 25; return "没有可强化的卡，铁匠折算 25 金币材料费" }
      const idx = cands[rnd(cands.length)]
      upgradeCardDef(s, idx)
      return `强化了【${s.deck[idx].name}】`
    } },
]

function resolveEvent(s: RunState) {
  const ev = EVENTS[rnd(EVENTS.length)]
  const result = ev.resolve(s)
  s.eventResult = { icon: ev.icon, title: ev.title, desc: ev.desc, result }
  s.phase = "event"
  log(s, `遭遇【${ev.title}】：${result}`)
}

export function leaveEvent(s: RunState) {
  if (s.phase !== "event") return
  s.eventResult = null
  s.phase = "map"
}
