// —— 爬塔尖塔（杀戮尖塔 lite）引擎：纯逻辑，不依赖 DOM ——
// 数据驱动设计：卡牌由 CardEffect 效果列表组成（可自定义增改），角色带被动/主动技能，
// 技能与被动通过触发时机钩子（全局生效 / 打出卡片 / 回合开始）作用于效果数值，方便后续拓展。

// 地图生成规则（类型权重 / 最小层数 / 揭示池 / 最大列数 / 路径条数）全部来自素材包随附的
// map-gen.config.json —— 调平衡改 JSON，不要在这里写魔数，避免两份真相各自漂移。
// 路径之所以指向 public/：素材包要求「配置 + manifest + 样例 + 素材」同目录自包含，
// 另存副本就会漂移，所以宁可让代码从 public 里取。
import MAP_GEN from "@/public/spire/map-gen.config.json"

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
  /** 当前幕的伤害倍率（= actScale(act)）：意图预览与敌方出手都用它，保证数字一致 */
  atkScale: number
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
  // 第 2 幕 BOSS：厚甲 + 格挡，靠"晶簇崩落"多段磨血，逼玩家在爆发与防御间取舍
  {
    id: "jadeGolem", name: "青玉魔像", icon: "💠", hp: 165, boss: true, moves: [
      { name: "碎岩重拳", kind: "atk", amt: 18, hits: 1, icon: "🪨" },
      { name: "晶簇崩落", kind: "atk", amt: 9, hits: 2, icon: "💠" },
      { name: "青玉壁障", kind: "block", amt: 14, hits: 1, icon: "🛡️" },
      { name: "共鸣", kind: "buff", amt: 3, hits: 1, icon: "🔮" },
    ],
  },
  // 终幕 BOSS：单段重击 + 三段连击 + 双 debuff，覆盖全部四种意图
  {
    id: "spireLord", name: "尖塔之主", icon: "🔺", hp: 200, boss: true, moves: [
      { name: "终焉裁决", kind: "atk", amt: 22, hits: 1, icon: "⚔️" },
      { name: "万钧坠击", kind: "atk", amt: 10, hits: 3, icon: "🌩️" },
      { name: "邪能灌注", kind: "buff", amt: 4, hits: 1, icon: "🔺" },
      { name: "王座威压", kind: "debuff", amt: 2, hits: 1, icon: "🌀", debuffKind: "weak" },
      { name: "绝望凝视", kind: "debuff", amt: 2, hits: 1, icon: "👁️", debuffKind: "vuln" },
    ],
  },
]

// ---------------- 状态与特效事件 ----------------
/** act-clear = 中途幕 BOSS 已击败、等待进入下一幕的幕间整备界面 */
export type Phase = "map" | "combat" | "reward" | "rest" | "shop" | "event" | "act-clear" | "over" | "win"

// ---------------- 地图：纺锤形随机 DAG，所有路径汇聚于 BOSS ----------------
/**
 * random = **未揭示**节点：踏入那一刻才按揭示池 roll 出真实类型（见 revealRandomNode）。
 * 它和 event 是两个不同的东西，别合并：event 进节点直接触发事件内容，
 * random 是"这一格到底是什么还不知道"，揭示后才分流到战斗/商店/营地。
 */
export type NodeType = "enemy" | "elite" | "boss" | "rest" | "shop" | "event" | "random"
export interface MapNode {
  id: string; row: number; col: number; type: NodeType; next: string[]
  /** 仅 random 节点使用：踏入后揭示出的真实类型。写进状态，重渲染/读档都不会再 roll 一次 */
  revealedType?: NodeType
}
export interface SpireMap { nodes: MapNode[]; layers: number }
/**
 * 每幕层数。**层数由前端写死在这里**，generateMap 只把它当参数消费——
 * 素材包 map-gen.config.json 里的 layers:16 是结构 demo，不是本项目的层数来源。
 */
export const MAP_ROWS = 16
/** 幕数：每一幕一张独立地图、顶端一个专属 BOSS；只有打完最后一幕的 BOSS 才算通关 */
export const TOTAL_ACTS = 3
/** 各幕 BOSS（下标 = 幕序 - 1）；取不到时回退到最后一幕的 BOSS */
export const ACT_BOSS_IDS = ["king", "jadeGolem", "spireLord"]
/**
 * 逐幕难度系数：第 1 幕 ×1.0、第 2 幕 ×1.3、第 3 幕 ×1.6。
 * 同时作用于敌方**血量**与**攻击伤害**（意图预览与实际结算共用，保证头顶数字不撒谎）。
 * 数值取舍：让三幕 BOSS 的实际血量落在 ~180 / ~290 / ~435，终幕需要认真构筑才打得过。
 */
export const actScale = (act: number) => 1 + (Math.max(1, act) - 1) * 0.3
/** 综合进度（跨幕），用于最佳纪录 —— 避免多幕后只记层数导致语义错乱；兼容旧值（层数） */
export const runDepth = (s: { act: number; floor: number }) => (s.act - 1) * MAP_ROWS + s.floor
/**
 * 节点形象。art = 素材包 `public/spire/art/` 下的**整幅圆形美术**（路径**必须带 basePath 前缀 `/games`**，
 * 与 spire-audio 的 SOUND_DIR 同一套约定）—— 直接铺满节点，画面自带的石质外环 + 外沿烟雾就是底框。
 * null = 素材包没有对应整图（现在只有 event），回落到 SpireMap 的「圆盘 + 自绘线描图标」老画法。
 * icon 字段是历史遗留的 emoji，当前已无人引用，仅为兼容保留。
 */
export const NODE_META: Record<NodeType, { icon: string; name: string; art: string | null }> = {
  enemy:  { icon: "⚔️", name: "普通敌人", art: "/games/spire/art/icon-normal.png" },
  elite:  { icon: "👹", name: "精英敌人", art: "/games/spire/art/icon-elite.png" },
  boss:   { icon: "👑", name: "BOSS",     art: "/games/spire/art/icon-boss.png" },
  rest:   { icon: "🔥", name: "补给营地", art: "/games/spire/art/icon-rest.png" },
  shop:   { icon: "🛒", name: "商店",     art: "/games/spire/art/icon-shop.png" },
  random: { icon: "❓", name: "未知",     art: "/games/spire/art/icon-random.png" },
  // 素材包没有「事件」整图。若让 event 也指向 icon-random.png，会和未揭示节点完全撞脸，
  // 玩家无法区分"进去触发事件"和"进去才知道是什么"，故 event 沿用自绘问号（art = null）
  event:  { icon: "❓", name: "未知事件", art: null },
}

/** 节点对外的有效类型：random 未揭示时就是 random，揭示后按 revealedType 走（决定图标与结算） */
export const nodeTypeOf = (n: MapNode): NodeType =>
  n.type === "random" ? (n.revealedType ?? "random") : n.type

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
  act: number             // 当前幕（1 基）
  totalActs: number       // 总幕数
  floor: number           // **当前幕内**层进度（1 基，0 = 尚未出发）
  maxFloor: number        // 每幕层数（= MAP_ROWS）
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
  actKills: number        // 本幕击杀数（幕间界面展示）
  lastActKills: number    // 上一幕击杀数（进入新幕后保留，供幕间结算展示）
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
    act: 1, totalActs: TOTAL_ACTS,
    floor: 0, maxFloor: MAP_ROWS,
    hp: ch.maxHp, maxHp: ch.maxHp, gold: 60,
    deck: [],
    map: generateMap(MAP_ROWS), pos: null, visited: [], potions: [], eventResult: null,
    draw: [], hand: [], discard: [],
    energy: 3, block: 0, str: 0, tempStr: 0,
    weak: 0, vuln: 0, turn: 1,
    playedThisTurn: 0, skillCd: 0,
    pendingScry: null, scryTop: [], pendingEcho: null,
    echoCopyUid: null, echoCopyPlayed: null, echoCopyUsed: false,
    enemy: null,
    rewardCards: [], lastGold: 0,
    shopCards: [], shopPotions: [], shopRemoveUsed: false,
    log: [], uidSeq: 1, kills: 0, actKills: 0, lastActKills: 0,
  }
  for (const id of ch.startDeck) s.deck.push(CARD_BY_ID[id])
  log(s, `第 1/${TOTAL_ACTS} 幕启程：从起点选择一条路线，向尖塔顶端进发！`)
  return s
}

// ---------------- 地图生成：纺锤形随机 DAG，所有路线最终汇聚 BOSS ----------------
// 规则来源 public/spire/map-gen.config.json：数值取配置，硬约束逐条在下面实现。
// 与旧实现（每层随机 2~4 列 + 随机连边，靠事后补救）的关键差别：
// 新实现**从构造上**就保证同层不交叉、无死路、无孤立节点，不依赖"生成完再修"。

/** 参与权重 roll 的类型（boss 由末层固定放置，不参与） */
type RollType = Extract<NodeType, "enemy" | "elite" | "rest" | "shop" | "random" | "event">
const ROLL_TYPES: RollType[] = ["enemy", "elite", "shop", "rest", "random", "event"]
/**
 * 权重：前五项直接取配置（配置里「普通小怪」叫 normal，本引擎沿用历史命名 enemy）。
 * event 是**项目扩展** —— 配置原版没有它（只有 random），但本作已有 6 个事件与一整套结算界面，
 * 按「random 与 event 并存」的决定让它独立参与各层 roll，权重取与 shop 同档。
 */
const EVENT_WEIGHT = 12
const WEIGHT: Record<RollType, number> = {
  enemy: MAP_GEN.nodeTypes.normal.weight,
  elite: MAP_GEN.nodeTypes.elite.weight,
  shop: MAP_GEN.nodeTypes.shop.weight,
  rest: MAP_GEN.nodeTypes.rest.weight,
  random: MAP_GEN.nodeTypes.random.weight,
  event: EVENT_WEIGHT,
}
/** 最小层数（配置 constraints：elite ≥ 3，shop / rest ≥ 2） */
const MIN_LAYER: Record<RollType, number> = {
  enemy: MAP_GEN.nodeTypes.normal.minLayer,
  elite: MAP_GEN.nodeTypes.elite.minLayer,
  shop: MAP_GEN.nodeTypes.shop.minLayer,
  rest: MAP_GEN.nodeTypes.rest.minLayer,
  random: MAP_GEN.nodeTypes.random.minLayer,
  event: 2, // 与 shop / rest 同档：事件同样给资源，不该出现在开局两层
}
const weightedPick = <T,>(list: T[], w: (t: T) => number): T => {
  let total = 0
  for (const t of list) total += w(t)
  let x = rnd(Math.max(1, total))
  for (const t of list) { x -= w(t); if (x < 0) return t }
  return list[list.length - 1]
}
/** 按权重抽类型；ban 用于叠加「开局两层只允许普通 / 未揭示」这类按层的局部限制 */
function rollType(layer: number, ban?: (t: RollType) => boolean): RollType {
  const pool = ROLL_TYPES.filter((t) => layer >= MIN_LAYER[t] && !ban?.(t))
  // 兜底：约束叠加到没有候选时退化为普通敌人，绝不抛错
  return weightedPick(pool.length > 0 ? pool : (["enemy"] as RollType[]), (t) => WEIGHT[t])
}

export function generateMap(layers: number = MAP_ROWS): SpireMap {
  const L = Math.max(4, layers | 0)
  const maxCol = Math.max(2, MAP_GEN.map.maxColumns)
  const [pcLo, pcHi] = MAP_GEN.map.pathCount
  // pathCount（配置 4~6）= 并行主干条数，这里用于决定纺锤最宽处宽度，再被 maxColumns 夹住。
  // ⚠️ 当前 maxColumns=4 会把 4~6 全夹成 4，这个区间暂时看不出差别；
  // 想让 5~6 条主干真正生效，需要同时放开配置里的 maxColumns。
  const peak = Math.min(maxCol, Math.max(2, pcLo + rnd(pcHi - pcLo + 1)))

  // ---- 1) 纺锤形铺层：第 0 层单入口、末层单 BOSS，中间按 sin 曲线先变宽后收窄 ----
  const counts: number[] = []
  for (let r = 0; r < L; r++) {
    if (r === 0 || r === L - 1) { counts.push(1); continue }
    const t = r / (L - 1)
    counts.push(Math.max(1, Math.min(peak, 1 + Math.round((peak - 1) * Math.sin(Math.PI * t)))))
  }
  // 曲线本身是确定性的，不抖动的话每张图的骨架完全一样（节点数恒定、层宽序列恒定），
  // 只有连线和类型在变 —— 玩起来像同一张图。这里给中间层做 ±1 抖动，
  // 连边构造对任意 (m,n) 都成立，所以宽度怎么抖都不会破坏不交叉 / 无死路。
  for (let r = 1; r < L - 1; r++) {
    if (Math.random() < 0.4) {
      counts[r] = Math.max(1, Math.min(peak, counts[r] + (Math.random() < 0.5 ? -1 : 1)))
    }
  }

  // ---- 2) 建节点 ----
  const nodes: MapNode[] = []
  const ids: string[][] = []
  for (let r = 0; r < L; r++) {
    ids.push([])
    for (let c = 0; c < counts[r]; c++) {
      const id = `r${r}c${c}`
      ids[r].push(id)
      nodes.push({ id, row: r, col: c, type: "enemy", next: [] })
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n] as const))

  // ---- 3) 连边：不交叉 + 全覆盖 + 无死路 ----
  // 核心构造：把下一层的 n 个节点按列切成 m 段**互不重叠且递增**的连续块，第 i 个源独占第 i 段：
  //   lo_i = floor(i·n/m)，hi_i = max(lo_i, floor((i+1)·n/m) − 1)
  // 于是天然成立 —— 不交叉（a<c ⇒ b<=d）、无死路（每段非空 ⇒ 每个源都有出边）、
  // 全覆盖（各段拼起来正好覆盖 0..n−1 ⇒ 每个目标都有入边）。
  for (let r = 0; r < L - 1; r++) {
    const m = counts[r], n = counts[r + 1]
    const lo = (i: number) => Math.floor((i * n) / m)
    const hi = (i: number) => Math.max(lo(i), Math.floor(((i + 1) * n) / m) - 1)
    const sets: Set<number>[] = Array.from({ length: m }, () => new Set<number>())
    for (let i = 0; i < m; i++) for (let j = lo(i); j <= hi(i); j++) sets[i].add(j)
    // 抖动：补一条斜边，让路线有分叉而不是整齐的梯子。
    // 候选区间被两端夹住 —— 下界 hi(i−1) 保证不越过前一个源的最大目标，
    // 上界 upper 保证不越过后一个源的最小目标；必须**从后往前**推进才能一次把 upper 定死。
    let upper = n - 1
    for (let i = m - 1; i >= 0; i--) {
      const low = i > 0 ? hi(i - 1) : 0
      const cand: number[] = []
      for (let j = low; j <= upper; j++) if (!sets[i].has(j)) cand.push(j)
      if (cand.length > 0 && Math.random() < 0.6) sets[i].add(cand[rnd(cand.length)])
      upper = Math.min(upper, ...Array.from(sets[i]))
    }
    for (let i = 0; i < m; i++) {
      const src = byId.get(ids[r][i])!
      for (const j of [...sets[i]].sort((a, b) => a - b)) src.next.push(ids[r + 1][j])
    }
  }

  // ---- 4) 类型：按权重 roll，再逐条套硬约束 ----
  /** 入口 / BOSS 前一层 / BOSS 层这三行的类型是定死的，冲突时不能拿来重 roll */
  const fixedRow = (r: number) => r === 0 || r === L - 2 || r === L - 1
  for (const n of nodes) {
    if (n.row === 0) { n.type = "enemy"; continue }      // 入口固定普通（配置 entrance）
    if (n.row === L - 1) { n.type = "boss"; continue }   // 末层单 BOSS
    if (n.row === L - 2) { n.type = "rest"; continue }   // BOSS 前一层强制补给：最后的回复窗口
    // 开局两层只允许普通 / 未揭示（配置 early-tiers-safe），避免一上来撞精英
    const ban = n.row < 2 ? (t: RollType) => t !== "enemy" && t !== "random" : undefined
    n.type = rollType(n.row, ban)
  }
  // 商店与营地不得被同一条边直连（配置 shop-rest-not-adjacent）：
  // 冲突时重 roll **可变的那一端**（上面三行是定死的），且排除 shop / rest 本身，兜底退化为普通敌人
  for (let pass = 0; pass < 12; pass++) {
    let changed = 0
    for (const n of nodes) {
      for (const id of n.next) {
        const m = byId.get(id)!
        const bad = (n.type === "shop" && m.type === "rest") || (n.type === "rest" && m.type === "shop")
        if (!bad) continue
        const target = !fixedRow(m.row) ? m : !fixedRow(n.row) ? n : null
        if (!target) continue
        target.type = rollType(target.row, (t) =>
          t === "shop" || t === "rest" || (target.row < 2 && t !== "enemy" && t !== "random"))
        changed++
      }
    }
    if (changed === 0) break
  }
  return { nodes, layers: L }
}

/**
 * 未揭示节点：踏入的那一刻才 roll 真实类型。
 * 揭示池取配置 randomNode.revealPool（normal / elite / shop / rest，不含 random 自身 ——
 * 不会揭示成另一个未揭示节点）。
 * ⚠️ 比配置多一道过滤：揭示结果同样要满足 minLayer，否则「开局两层只给低强度节点」
 * 会被一个第 1 层的未揭示节点绕过去。结果写进 revealedType，之后渲染与结算都按它走。
 */
export function revealRandomNode(n: MapNode): NodeType {
  // 元组字面量必须显式断言，否则 TS 会放宽成 (string|number)[][] 而编译失败
  const pool: [NodeType, number][] = ([
    ["enemy", MAP_GEN.randomNode.revealPool.normal],
    ["elite", MAP_GEN.randomNode.revealPool.elite],
    ["shop", MAP_GEN.randomNode.revealPool.shop],
    ["rest", MAP_GEN.randomNode.revealPool.rest],
  ] as [NodeType, number][]).filter(([t]) => n.row >= MIN_LAYER[t as RollType])
  const picked = weightedPick(
    pool.length > 0 ? pool : ([["enemy", 1]] as [NodeType, number][]),
    ([, w]) => w,
  )[0]
  n.revealedType = picked
  return picked
}

export function nodeById(s: RunState, id: string): MapNode | undefined {
  return s.map.nodes.find((n) => n.id === id)
}

/** 下一步可到达的节点 id：尚未出发时为全部起点，否则为当前节点的后继 */
export function reachableIds(s: RunState): string[] {
  if (!s.pos) return s.map.nodes.filter((n) => n.row === 0).map((n) => n.id)
  return nodeById(s, s.pos)?.next.slice() ?? []
}

/** 按行分组的地图节点（第 0 行在前，供 UI 渲染）。行数按实际数据取，兼容自定义层数 */
export function mapRows(s: RunState): MapNode[][] {
  let n = Math.max(1, s.maxFloor)
  for (const x of s.map.nodes) if (x.row + 1 > n) n = x.row + 1
  const rows: MapNode[][] = Array.from({ length: n }, () => [])
  for (const x of s.map.nodes) rows[x.row]?.push(x)
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
  // 未揭示节点：踏入的这一刻才揭晓类型，结果写回节点（之后渲染与结算都按它走，不会再 roll）
  let eff: NodeType = nodeTypeOf(node)
  if (node.type === "random" && !node.revealedType) {
    revealRandomNode(node)
    eff = nodeTypeOf(node)
    log(s, `封印石门开启 —— 揭示为【${NODE_META[eff].name}】`)
  }
  if (eff === "rest") { s.phase = "rest"; log(s, `—— 补给营地（第 ${s.act} 幕 · ${s.floor}/${s.maxFloor} 层）——`); return fx }
  if (eff === "shop") { openShop(s); return fx }
  if (eff === "event") { resolveEvent(s); return fx }
  startCombat(s, eff)
  return fx
}

// ---------------- 敌人选择（按节点类型 + 当前幕） ----------------
function pickEnemyDef(type: NodeType, floor: number, act: number): EnemyDef {
  // 每幕一个专属 BOSS；越界（自定义幕数）一律回退终幕 BOSS
  if (type === "boss") {
    const id = ACT_BOSS_IDS[Math.min(act, ACT_BOSS_IDS.length) - 1] ?? ACT_BOSS_IDS[ACT_BOSS_IDS.length - 1]
    return ENEMIES.find((e) => e.id === id) ?? ENEMIES.find((e) => e.boss)!
  }
  if (type === "elite") {
    const pool = ENEMIES.filter((e) => e.elite)
    return pool[rnd(pool.length)]
  }
  // 普通怪池随幕推进升级：后幕不再出现最弱的虱子/邪教徒杂兵组合
  const pools: Record<number, string[]> = {
    1: ["cultist", "louse", "worm"],
    2: ["cultist", "worm", "slime", "fungi", "louse"],
    3: ["slime", "fungi", "worm", "cultist"],
  }
  const base = pools[Math.min(Math.max(act, 1), 3)] ?? pools[3]
  const ids = floor <= 3 ? base.filter((x) => x !== "slime" || act > 1) : base
  const use = ids.length > 0 ? ids : base
  // 修复：随机抽取必须在 find 谓词之外做一次；写在谓词内时每比对一个敌人都会重摇 id，
  // 全不命中的概率 (2/3)^3≈30%，导致进入战斗时 def=undefined 前端崩溃
  const want = use[rnd(use.length)]
  return ENEMIES.find((e) => e.id === want)!
}

/** 敌方本次攻击的预览伤害（含力量 / 虚弱 / 逐幕倍率）——与实际结算共用同一公式 */
export function enemyAtkPreview(e: EnemyState): number {
  let d = Math.round(e.move.amt * e.atkScale) + e.str
  if (e.weak > 0) d = Math.floor(d * 0.75)
  return d
}

function startCombat(s: RunState, type: NodeType) {
  const def = pickEnemyDef(type, s.floor, s.act)
  const scale = actScale(s.act)
  const hp = Math.round(def.hp * (1 + (s.floor - 1) * 0.06) * scale)
  const moveIdx = rnd(def.moves.length)
  s.enemy = { def, hp, maxHp: hp, block: 0, str: 0, weak: 0, vuln: 0, move: def.moves[moveIdx], moveIdx, atkScale: scale }
  s.phase = "combat"
  s.block = 0; s.str = 0; s.tempStr = 0; s.weak = 0; s.vuln = 0
  s.energy = 3; s.turn = 1; s.playedThisTurn = 0
  s.draw = shuffle(s.deck.map((d) => ({ uid: s.uidSeq++, def: d })))
  s.hand = []; s.discard = []
  s.pendingScry = null; s.scryTop = []; s.pendingEcho = null
  s.echoCopyUid = null; s.echoCopyUsed = false
  // 被动钩子（开局时机）：武诸葛【尽瘁】开局摸至 7 张
  drawCards(s, hasPassive(s, "start-hand-7")?.value ?? 5)
  log(s, `—— 第 ${s.act} 幕 · 第 ${s.floor} 层：${def.name} 出现了 ——`)
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
  s.actKills++
  const gold = 8 + s.floor * 2 + rnd(6) + (e.def.elite ? 15 : 0) + (e.def.boss ? 30 : 0)
  s.gold += gold
  s.lastGold = gold
  log(s, `${e.def.name} 被击败！获得 ${gold} 金币`)
  const isBoss = !!e.def.boss
  s.enemy = null
  if (isBoss) {
    // 中途幕的 BOSS：进入下一幕（新地图 + 回满血 + 幕间界面）；只有终幕 BOSS 才算通关
    if (s.act < s.totalActs) { enterNextAct(s); return }
    s.phase = "win"
    return
  }
  s.rewardCards = rollRewardCards(s)
  s.phase = "reward"
}

/**
 * 幕推进：换一张新地图、幕内进度归零、**血量回满**、清空战斗内状态 → 幕间界面（act-clear）。
 * 金币 / 卡组 / 药水 / 已走过的强化跨幕保留（只有战斗态与幕内进度重置）。
 */
function enterNextAct(s: RunState) {
  const cleared = s.act
  s.lastActKills = s.actKills
  s.actKills = 0
  s.act++
  s.map = generateMap(s.maxFloor)
  s.pos = null
  s.visited = []
  s.floor = 0
  s.hp = s.maxHp                     // 跨幕回满（需求：每进入一张新地图血量恢复满）
  s.block = 0; s.str = 0; s.tempStr = 0; s.weak = 0; s.vuln = 0
  s.enemy = null
  s.hand = []; s.draw = []; s.discard = []
  s.pendingEcho = null; s.pendingScry = null; s.scryTop = []
  s.echoCopyUid = null; s.echoCopyPlayed = null; s.echoCopyUsed = false
  s.rewardCards = []; s.eventResult = null
  s.shopCards = []; s.shopPotions = []; s.shopRemoveUsed = false
  s.turn = 1; s.energy = 3; s.skillCd = 0; s.playedThisTurn = 0
  s.phase = "act-clear"
  log(s, `★ 第 ${cleared} 幕通关！进入第 ${s.act}/${s.totalActs} 幕 · 血量已回满，敌人更强了`)
}

/** 幕间界面 → 继续前进：进入当前幕的路线图 */
export function nextAct(s: RunState): FxEvent[] {
  if (s.phase !== "act-clear") return []
  s.phase = "map"
  return []
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
      let dmg = Math.round(m.amt * e.atkScale) + e.str
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
  log(s, `—— 商店（第 ${s.act} 幕 · ${s.floor}/${s.maxFloor} 层）：出售卡牌与药水 ——`)
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
