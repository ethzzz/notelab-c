"use client"

import { useEffect, useRef, useState } from "react"
import {
  newRun, playCard, endTurn, useSkill, resolveEcho, resolveScry, echoCopyCard,
  chooseReward, buyCard, removeCard, leaveShop, buyPotion,
  enterNode, restHeal, restUpgrade, usePotion, leaveEvent, nextAct,
  POTION_DEFS, MAX_POTIONS,
  enemyAtkPreview, REMOVE_COST, MAX_FLOOR, TOTAL_ACTS, runDepth, CHARACTERS, characterOf, applyCustomContent,
  type RunState, type Move, type FxEvent, type FxTarget, type PotionKind, type CardCategory,
} from "@/lib/spire-engine"
import { SpireCardView as CardView } from "@/components/SpireCardView"
import SpireMap, { actThemeName, actAccent } from "@/components/SpireMap"
import { SpireSprite, hasSpireSprite } from "@/components/SpireSprites"
import { loadSpireContent } from "@/lib/spire-content"
import { sfx, unlockSpireAudio, isSpireMuted, setSpireMuted, type SpireSfx } from "@/lib/spire-audio"
import { fetchMe } from "@/lib/auth"

// ---------------- 跨幕进度显示 ----------------
/** 综合进度（层数）→ 「第 N 幕 · 第 M 层」；兼容旧纪录（老值按第 1 幕层数读） */
function depthLabel(depth: number): string {
  if (!Number.isFinite(depth) || depth <= 0) return "—"
  const act = Math.min(TOTAL_ACTS, Math.floor((depth - 1) / MAX_FLOOR) + 1)
  const floor = depth - (act - 1) * MAX_FLOOR
  return `第 ${act} 幕 · 第 ${floor} 层`
}

// ---------------- 出牌动作：按角色区分的形态与配色 ----------------
/** proj 决定攻击牌飞出的弹道形态：slash=斜向刀光 / orb=法术弹 / bash=冲击块 / seal=符纸 */
const CHAR_FX: Record<string, { color: string; glow: string; proj: "slash" | "orb" | "bash" | "seal" }> = {
  blade:   { color: "#a9e6ff", glow: "rgba(169,230,255,.85)", proj: "slash" },
  guard:   { color: "#f0c46a", glow: "rgba(240,196,106,.85)", proj: "bash" },
  mage:    { color: "#c9a8ff", glow: "rgba(201,168,255,.85)", proj: "orb" },
  wuzhuge: { color: "#7fe0c8", glow: "rgba(127,224,200,.85)", proj: "seal" },
}
const DEFAULT_FX = { color: "#dbe4ff", glow: "rgba(219,228,255,.85)", proj: "orb" as const }

// ---------------- 音效：引擎事件 / 卡牌类型 → 音色 ----------------
/** 四种卡牌类型各有一套辨识度（攻击=挥砍、防御=举盾、增益=上行琶音、特殊=上滑颤音） */
const CARD_SFX: Record<CardCategory, SpireSfx> = {
  attack: "card-attack", defense: "card-defense", buff: "card-buff", special: "card-special",
}

/**
 * 非伤害事件 → 音效 + 优先级。一次结算里同类事件可能连发（多段攻击、群体 debuff），
 * 因此只挑 rank 最高的一个出声，避免叠成噪音墙。
 */
const EVENT_SFX: Partial<Record<FxEvent["kind"], { name: SpireSfx; rank: number }>> = {
  heal: { name: "heal", rank: 6 },
  "gain-block": { name: "block", rank: 5 },
  debuff: { name: "debuff", rank: 4 },
  "gain-str": { name: "card-buff", rank: 3 },
  energy: { name: "energy", rank: 2 },
  draw: { name: "draw", rank: 1 },
  generate: { name: "generate", rank: 1 },
}

/** 把一次结算的事件压成最多两声：一声命中（按总伤害变调）+ 一声最有存在感的其它事件 */
function voiceForEvents(events: FxEvent[]): void {
  if (events.length === 0) return
  let dmg = 0
  let best: SpireSfx | null = null
  let bestRank = 0
  for (const ev of events) {
    if (ev.kind === "hit") { dmg += ev.dmg; continue }
    if (ev.kind === "self-dmg") { dmg += ev.amt; continue }
    const m = EVENT_SFX[ev.kind]
    if (m && m.rank > bestRank) { bestRank = m.rank; best = m.name }
  }
  if (dmg > 0) sfx("hit", dmg >= 12 ? 0.82 : 1)
  if (best) sfx(best)
}


// ---------------- 角色授权（按 C 端用户组前置筛选） ----------------
/** 未登录/未知组一律按 default 处理 */
const FALLBACK_GROUP = "default"
/** 用户组文案：后端只给 code，这里映射展示名（未知组回落显示 code 本身） */
const GROUP_LABEL: Record<string, string> = { default: "普通用户", vip: "VIP用户" }
const groupLabel = (code: string) => GROUP_LABEL[code] || code

/**
 * 计算某组的可选角色白名单：
 * charAccess 缺失 / 该组无键 → 返回 null，表示不筛选（fail-open，全部角色可选）。
 */
function allowListOf(charAccess: Record<string, string[]> | undefined, group: string): string[] | null {
  if (!charAccess) return null
  const v = charAccess[group]
  return Array.isArray(v) ? v : null
}

/** 音效开关：状态落 localStorage，跨局持久（顶栏与地图页共用） */
function SfxToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-pressed={muted}
      title={muted ? "音效已关闭（点击开启）" : "音效已开启（点击关闭）"}
      className={`rounded-lg border px-2.5 py-1 text-xs hover:bg-white/10 ${muted ? "border-white/10 text-zinc-500" : "border-white/15 text-zinc-200"}`}>
      {muted ? "🔇 静音" : "🔊 音效"}
    </button>
  )
}

function HpBar({ hp, maxHp, color = "bg-gradient-to-r from-emerald-500 to-lime-400" }: { hp: number; maxHp: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
      <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
    </div>
  )
}

/** 敌方意图：伤害数字必须与引擎结算完全一致（含逐幕倍率），否则玩家会被头顶数字骗到 */
function IntentView({ move, str, weak, atkScale }: { move: Move; str: number; weak: number; atkScale: number }) {
  if (move.kind === "atk") {
    let d = Math.round(move.amt * atkScale) + str
    if (weak > 0) d = Math.floor(d * 0.75)
    return <span className="text-rose-300">⚔️ 攻击 {d}{move.hits > 1 ? ` ×${move.hits}` : ""}</span>
  }
  if (move.kind === "block") return <span className="text-sky-300">🛡️ 格挡 {move.amt}</span>
  if (move.kind === "buff") return <span className="text-amber-300">💪 强化 +{move.amt}</span>
  return <span className="text-fuchsia-300">🕸️ 施加{move.debuffKind === "weak" ? "虚弱" : "易伤"} {move.amt}</span>
}

// 状态徽章悬浮提示：具体数值与剩余回合
const STATUS_TIPS: Record<"block" | "str" | "weak" | "vuln", (n: number) => string> = {
  block: (n) => `格挡：优先吸收受到的伤害，你的下回合开始时清零（当前 ${n} 点）`,
  str: (n) => `力量：攻击伤害 +${n}，永久生效`,
  weak: (n) => `虚弱：造成的伤害降低 25%，持续 ${n} 回合`,
  vuln: (n) => `易伤：受到的伤害增加 50%，持续 ${n} 回合`,
}

function StatusBadge({ tip, cls, children }: { tip: string; cls: string; children: React.ReactNode }) {
  return (
    <span className={`group relative cursor-help rounded-full px-2 py-0.5 ${cls}`} style={{ animation: "spire-pop .3s ease" }}>
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/15 bg-black/95 px-2.5 py-1.5 text-[10px] font-normal leading-relaxed text-zinc-200 shadow-xl group-hover:block">
        {tip}
      </span>
    </span>
  )
}

function StatusBadges({ block, str, weak, vuln }: { block?: number; str?: number; weak?: number; vuln?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
      {!!block && <StatusBadge key={`b${block}`} cls="bg-sky-500/25 text-sky-200" tip={STATUS_TIPS.block(block)}>🛡️ {block}</StatusBadge>}
      {!!str && <StatusBadge key={`s${str}`} cls="bg-amber-500/25 text-amber-200" tip={STATUS_TIPS.str(str)}>💪 {str}</StatusBadge>}
      {!!weak && <StatusBadge key={`w${weak}`} cls="bg-fuchsia-500/25 text-fuchsia-200" tip={STATUS_TIPS.weak(weak)}>🌀 虚弱 {weak}</StatusBadge>}
      {!!vuln && <StatusBadge key={`v${vuln}`} cls="bg-orange-500/25 text-orange-200" tip={STATUS_TIPS.vuln(vuln)}>🎯 易伤 {vuln}</StatusBadge>}
    </div>
  )
}

export default function SpirePage() {
  const sp = useRef<RunState | null>(null)
  const [, setTick] = useState(0)
  const [best, setBest] = useState(0)
  const [showDeck, setShowDeck] = useState(false)
  const [removeMode, setRemoveMode] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [copyPick, setCopyPick] = useState(false) // 锦囊复刻：选择要复制的手牌
  const [upgradePick, setUpgradePick] = useState(false) // 补给营地：选择要强化的卡
  // 出牌动作：按「卡牌类型 + 当前角色」触发一段 ~0.5s 的短动画。
  // 只做前端表现（读点击处的卡牌对象即可，引擎无需知情）；不阻塞 playCard，连点按 seq 重触发。
  const [action, setAction] = useState<{ kind: CardCategory; charId: string; seq: number } | null>(null)
  const actionSeq = useRef(1)
  const actionTimer = useRef<number | null>(null)
  // 角色授权：当前玩家所属 C 端用户组 + 已发布的授权白名单
  const [userGroup, setUserGroup] = useState<string>(FALLBACK_GROUP)
  const [charAccess, setCharAccess] = useState<Record<string, string[]>>({})
  // 音效开关：状态存 localStorage，跨局持久
  const [muted, setMuted] = useState(false)
  const bump = () => setTick((t) => t + 1)

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setSpireMuted(next)
    // 开启时给一声即时反馈，顺便在用户手势里唤醒 AudioContext
    if (!next) { unlockSpireAudio(); sfx("select") }
  }

  /** 触发一次出牌动作动画：新动作会顶掉上一次（不排队，保证连点跟手） */
  const triggerAction = (kind: CardCategory) => {
    if (!sp.current) return
    sfx(CARD_SFX[kind])
    setAction({ kind, charId: sp.current.charId, seq: actionSeq.current++ })
    if (actionTimer.current) window.clearTimeout(actionTimer.current)
    actionTimer.current = window.setTimeout(() => setAction(null), 560)
  }

  // ---------------- 战斗特效 ----------------
  type FloatFx = { id: number; target: FxTarget; text: string; cls: string; dx: number; delay: number }
  const [floats, setFloats] = useState<FloatFx[]>([])
  const [enemyHit, setEnemyHit] = useState(0)
  const [playerHit, setPlayerHit] = useState(0)
  const [screenShake, setScreenShake] = useState(0)
  const floatSeq = useRef(1)

  /** 消费引擎返回的特效事件：伤害飘字、受击抖动、状态图标飘字、重击屏震 */
  const fireFx = (events: FxEvent[]) => {
    if (!events || events.length === 0) return
    voiceForEvents(events)
    const added: FloatFx[] = []
    let eh = false, ph = false, big = false, hitIdx = 0
    for (const ev of events) {
      const push = (target: FxTarget, text: string, cls: string, delay = 0) =>
        added.push({ id: floatSeq.current++, target, text, cls, dx: Math.round(Math.random() * 56 - 28), delay })
      switch (ev.kind) {
        case "hit":
          if (ev.dmg <= 0) break
          if (ev.target === "enemy") eh = true; else ph = true
          if (ev.dmg >= 12) big = true
          push(ev.target, `-${ev.dmg}`, "text-rose-300", hitIdx++ * 0.14)
          break
        case "self-dmg":
          ph = true
          push("player", `-${ev.amt}`, "text-rose-400")
          break
        case "gain-block": push(ev.target, `+${ev.amt} 🛡️`, "text-sky-300"); break
        case "gain-str": push(ev.target, `+${ev.amt} 💪`, "text-amber-300"); break
        case "debuff":
          push(ev.target, ev.stat === "vuln" ? `🎯 易伤 +${ev.amt}` : `🌀 虚弱 +${ev.amt}`, ev.stat === "vuln" ? "text-orange-300" : "text-fuchsia-300")
          break
        case "heal": push("player", `+${ev.amt} ❤️`, "text-emerald-300"); break
        case "energy": push("player", `+${ev.amt} ⚡`, "text-yellow-300"); break
        case "draw": push("player", `抽 ${ev.amt} 张牌`, "text-indigo-300"); break
        case "generate": push("player", `🎴 ${ev.name}`, "text-violet-300"); break
      }
    }
    if (added.length) {
      setFloats((f) => [...f, ...added])
      const ids = new Set(added.map((a) => a.id))
      window.setTimeout(() => setFloats((f) => f.filter((x) => !ids.has(x.id))), 1400)
    }
    if (eh) setEnemyHit((t) => t + 1)
    if (ph) setPlayerHit((t) => t + 1)
    if (big) setScreenShake((t) => t + 1)
  }

  useEffect(() => {
    setBest(Number(localStorage.getItem("spire-best") || 0))
    setMuted(isSpireMuted())
  }, [])

  // 相位切换音效：幕间号角 / 通关凯歌 / 失败下行，以及商店与事件的进场音。
  // 用「上一次相位」比对而非依赖数组 —— s 存在 ref 里，不会触发重渲染，只能靠每轮渲染轮询。
  const lastPhase = useRef<string | null>(null)
  useEffect(() => {
    const ph = sp.current?.phase ?? null
    if (ph === lastPhase.current) return
    lastPhase.current = ph
    if (ph === "act-clear") sfx("act-clear")
    else if (ph === "win") sfx("win")
    else if (ph === "over") sfx("lose")
    else if (ph === "event") sfx("event")
    else if (ph === "shop") sfx("shop")
  })

  // 加载工坊自定义卡/角色并注册进引擎，同时取回角色授权白名单（charAccess）
  useEffect(() => {
    loadSpireContent().then((c) => {
      applyCustomContent(c.cards, c.characters)
      setCharAccess(c.charAccess || {})
      bump()
    })
    // 静默取当前登录用户（未登录/无 group_code 返回 null）→ 按 default 组处理；
    // 本页不新增登录墙（路由级 RequireAuth 守卫在 app/spire/layout.tsx，维持现状）
    fetchMe().then((me) => { if (me?.group_code) setUserGroup(me.group_code) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 当前玩家可选角色白名单；null = 不筛选（charAccess 未配置或该组无键） */
  const allowList = allowListOf(charAccess, userGroup)

  const s = sp.current

  // 最佳纪录按「跨幕综合进度」记（旧版只记层数，depthLabel 已做向后兼容拆解）
  const recordBest = (depth: number) => {
    if (depth > best) { setBest(depth); localStorage.setItem("spire-best", String(depth)) }
  }

  const start = () => {
    // 首次用户手势：唤醒音频上下文（浏览器自动播放策略），并给一声点击反馈
    unlockSpireAudio()
    sfx("select")
    setPickOpen(true)
  }

  const pickCharacter = (charId: string) => {
    // 双保险：白名单存在且不含该角色 → 拒绝开局（UI 上锁定卡片本就不触发点击）
    if (allowList && !allowList.includes(charId)) return
    sfx("select")
    sp.current = newRun(charId)
    setPickOpen(false); setShowDeck(false); setRemoveMode(false); setCopyPick(false); setUpgradePick(false); setAction(null)
    bump()
  }

  // 结束时记录最佳进度（综合跨幕层数）
  useEffect(() => {
    if (!s) return
    if (s.phase === "over") recordBest(runDepth(s))
    if (s.phase === "win") recordBest(runDepth(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const backToMenu = () => { sfx("select"); sp.current = null; setShowDeck(false); setRemoveMode(false); setPickOpen(false); setCopyPick(false); setUpgradePick(false); setAction(null); bump() }

  // ---------------- 角色选择 ----------------
  if (!s && pickOpen) {
    return (
      <div className="relative h-[calc(100vh-6.5rem)] overflow-y-auto rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] select-none">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-8">
          <h2 className="text-2xl font-black text-white">选择你的角色</h2>
          <p className="mt-1 text-xs text-zinc-400">每个角色拥有独特的被动与主动技能</p>
          <p className="mt-1.5 text-[11px] text-indigo-300/90">
            当前身份：<span className="font-bold">{groupLabel(userGroup)}</span>
            {allowList ? "　·　部分角色需授权解锁（灰色锁定项为 VIP 专属）" : "　·　全部角色可选"}
          </p>
          <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHARACTERS.map((ch) => {
              // 白名单存在且不含该角色 → 锁定：置灰 + 🔒 角标 + 点击不触发开局
              const locked = allowList ? !allowList.includes(ch.id) : false
              return (
                <button key={ch.id}
                  onClick={() => { if (!locked) pickCharacter(ch.id) }}
                  aria-disabled={locked || undefined}
                  title={locked ? "该角色未解锁 · VIP 专属/联系管理员" : `选择 ${ch.name}`}
                  className={`group relative flex flex-col items-center rounded-2xl border p-4 text-center transition-all ${
                    locked
                      ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50 grayscale"
                      : "border-white/10 bg-white/5 hover:border-indigo-400/60 hover:bg-indigo-400/10 hover:shadow-lg hover:shadow-indigo-900/30"
                  }`}>
                  {locked && <span className="absolute right-2.5 top-2.5 text-lg" aria-hidden>🔒</span>}
                  {hasSpireSprite("player", ch.id)
                    ? <SpireSprite kind="player" id={ch.id} className="h-20 w-20 drop-shadow-[0_0_14px_rgba(129,140,248,0.35)]" />
                    : <div className="text-5xl drop-shadow-[0_0_14px_rgba(129,140,248,0.35)]">{ch.icon}</div>}
                  <div className="mt-2 text-base font-bold text-white">{ch.name}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">{ch.desc}</div>
                  <div className="mt-1 text-[11px] text-emerald-300">❤️ {ch.maxHp} 生命</div>
                  <div className="mt-3 w-full rounded-xl bg-black/30 p-2.5 text-left">
                    {ch.passives.map((p, i) => (
                      <div key={i} className={`${i > 0 ? "mt-1.5" : ""} text-[11px] leading-relaxed text-amber-200/90`}>{p.icon} 被动·{p.name}<br /><span className="text-zinc-400">{p.desc}</span></div>
                    ))}
                    <div className="mt-1.5 text-[11px] leading-relaxed text-violet-200/90">{ch.skill.icon} 技能·{ch.skill.name}{ch.skill.kind === "echo-copy" ? "（每轮对战限一次）" : `（冷却 ${ch.skill.cooldown} 回合）`}<br /><span className="text-zinc-400">{ch.skill.desc}</span></div>
                  </div>
                  {locked
                    ? <div className="mt-3 rounded-full bg-zinc-700/60 px-5 py-1.5 text-xs font-bold text-zinc-300">未解锁</div>
                    : <div className="mt-3 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-5 py-1.5 text-xs font-bold text-white opacity-90 group-hover:opacity-100">选择 {ch.name}</div>}
                  {locked && <div className="mt-1.5 text-[10px] leading-snug text-zinc-400">该角色未解锁 · VIP 专属/联系管理员</div>}
                </button>
              )
            })}
          </div>
          <button onClick={() => { sfx("select"); setPickOpen(false) }} className="mt-6 rounded-xl border border-white/20 px-6 py-2 text-sm text-zinc-300 hover:bg-white/10">返回菜单</button>
        </div>
      </div>
    )
  }

  // ---------------- 主菜单 ----------------
  if (!s) {
    return (
      <div className="relative h-[calc(100vh-6.5rem)] overflow-y-auto rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] select-none">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-10 text-center">
          <div className="text-6xl">🗼</div>
          <h1 className="mt-2 text-3xl font-black text-white">爬塔尖塔</h1>
          <p className="mt-1 text-sm text-zinc-400">杀戮尖塔 lite · 构筑卡组，连破 {TOTAL_ACTS} 幕，登顶 {TOTAL_ACTS * MAX_FLOOR} 层</p>
          {best > 0 && <div className="mt-3 rounded-full bg-amber-500/15 px-4 py-1 text-sm text-amber-300">🏆 最深纪录：{depthLabel(best)}</div>}
          <button onClick={start}
            className="mt-6 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 px-10 py-3 text-lg font-bold text-white shadow-lg shadow-rose-900/40 hover:brightness-110">
            ⚔️ 选择角色，开始爬塔
          </button>
          <div className="mt-8 grid w-full grid-cols-1 gap-3 text-left text-xs text-zinc-300 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 font-bold text-white">🎴 卡牌战斗</div>
              每回合 3 点能量、抽 5 张牌。打出攻击与技能，格挡敌方伤害，回合结束手牌全部弃置。
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 font-bold text-white">👁️ 敌方意图</div>
              敌人头顶显示下一步行动：攻击 / 格挡 / 强化 / 施毒，看穿意图再决定攻防。
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-1 font-bold text-white">🗺️ 随机路线图</div>
              共 {TOTAL_ACTS} 幕，每幕生成 {MAX_FLOOR} 层路线：自选路径前进，途经普通/精英敌人、补给营地、商店、幸运事件与封印石门（踏入的那一刻才揭晓里面是什么），所有路线最终汇聚本幕 BOSS。击败本幕 BOSS 进入下一幕并回满生命，打通终幕才算登顶。
            </div>
          </div>
          <div className="mt-4 text-[11px] text-zinc-500">状态说明：💪力量 提升攻击 · 🌀虚弱 造成伤害 -25% · 🎯易伤 受到伤害 +50%</div>
        </div>
      </div>
    )
  }

  const over = s.phase === "over" || s.phase === "win"

  // ---------------- 幕间整备：中途幕 BOSS 已击败，等待进入下一幕 ----------------
  if (s.phase === "act-clear") {
    const cleared = s.act - 1
    const isFinalNext = s.act >= s.totalActs
    return (
      <div className="relative flex h-[calc(100vh-6.5rem)] flex-col items-center justify-center overflow-y-auto rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] px-4 text-center select-none">
        <div className="text-6xl">🏆</div>
        <h2 className="mt-3 text-3xl font-black text-amber-300">第 {cleared} 幕通关！</h2>
        <p className="mt-2 text-sm text-zinc-300">
          尖塔再上一层 —— 即将进入 <span className="font-bold text-white">第 {s.act}/{s.totalActs} 幕</span>
          {isFinalNext && <span className="ml-1.5 rounded bg-rose-500/25 px-1.5 py-0.5 text-[11px] text-rose-300">终幕</span>}
        </p>
        <p className="mt-1.5 text-sm text-emerald-300">❤️ 生命已回满（{s.hp}/{s.maxHp}），敌人比上一幕更强了</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-zinc-300 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <div className="text-[11px] text-zinc-500">本幕击杀</div>
            <div className="mt-0.5 font-bold text-white">⚔️ {s.lastActKills}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <div className="text-[11px] text-zinc-500">金币</div>
            <div className="mt-0.5 font-bold text-white">🪙 {s.gold}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <div className="text-[11px] text-zinc-500">卡组</div>
            <div className="mt-0.5 font-bold text-white">🎴 {s.deck.length}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <div className="text-[11px] text-zinc-500">累计击杀</div>
            <div className="mt-0.5 font-bold text-white">💀 {s.kills}</div>
          </div>
        </div>
        <p className="mt-4 max-w-md text-[11px] leading-relaxed text-zinc-500">
          金币、卡组、药水与已强化的卡全部保留；下一幕会重新生成一张路线图（第 {s.act} 幕 · {actThemeName(s.act)}）。
        </p>
        <button onClick={() => { sfx("card-buff"); nextAct(sp.current!); bump() }}
          className="mt-6 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-8 py-2.5 font-bold text-white hover:brightness-110">
          继续前进 ▶
        </button>
      </div>
    )
  }

  // ---------------- 结算（胜利 / 失败） ----------------
  if (over) {
    const win = s.phase === "win"
    const depth = runDepth(s)
    return (
      <div className="relative flex h-[calc(100vh-6.5rem)] flex-col items-center justify-center rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] px-4 text-center select-none">
        <div className="text-6xl">{win ? "👑" : "💀"}</div>
        <h2 className={`mt-3 text-3xl font-black ${win ? "text-amber-300" : "text-rose-400"}`}>{win ? "登顶成功！" : "止步于此"}</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {win
            ? `你击败了尖塔之主，通关全部 ${TOTAL_ACTS} 幕（共 ${TOTAL_ACTS * MAX_FLOOR} 层）`
            : `你在第 ${s.act}/${s.totalActs} 幕 · 第 ${s.floor} 层倒下（综合进度 ${depth}/${TOTAL_ACTS * MAX_FLOOR} 层）`}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm text-zinc-300">
          <span>⚔️ 击败 {s.kills} 敌人</span>
          <span>🪙 余 {s.gold} 金币</span>
          <span>🎴 卡组 {s.deck.length} 张</span>
        </div>
        {best >= depth && <div className="mt-2 text-xs text-amber-300">🏆 刷新/保持最深纪录：{depthLabel(best)}</div>}
        <div className="mt-6 flex gap-3">
          <button onClick={start} className="rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-6 py-2.5 font-bold text-white hover:brightness-110">🔄 再来一局</button>
          <button onClick={backToMenu} className="rounded-xl border border-white/20 px-6 py-2.5 font-bold text-zinc-200 hover:bg-white/10">返回菜单</button>
        </div>
      </div>
    )
  }

  const e = s.enemy
  const ch = characterOf(s)
  // 幕强调色与动作配色：顶栏、战斗底色、出牌动作共用同一取色来源
  const accent = actAccent(s.act)
  const fxStyle = CHAR_FX[ch.id] ?? DEFAULT_FX
  const actSeq = action?.seq ?? 0
  const actionKind = action?.kind ?? null
  const isAttackAct = actionKind === "attack"

  // ---------------- 路线图：选择下一节点前进 ----------------
  if (s.phase === "map") {
    return (
      <div className="relative flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] select-none">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-2 text-sm">
          <div className="flex items-center gap-3 text-zinc-200">
            <span className="font-bold text-amber-300">🗼 第 {s.act}/{s.totalActs} 幕{s.floor > 0 ? ` · 第 ${s.floor}/${s.maxFloor} 层` : " · 起点"}</span>
            <span>🪙 {s.gold}</span>
            <span className="text-rose-300">❤️ {s.hp}/{s.maxHp}</span>
            <PotionsBar potions={s.potions} onUse={(i) => { sfx("potion"); fireFx(usePotion(sp.current!, i)); bump() }} />
          </div>
          <div className="flex items-center gap-2">
            <SfxToggle muted={muted} onToggle={toggleMute} />
            <button onClick={() => setShowDeck(true)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10">🎴 卡组 {s.deck.length}</button>
            <button onClick={backToMenu} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/10">🏳️ 放弃</button>
          </div>
        </div>
        <div className="text-center text-xs text-zinc-400">{s.pos ? "沿亮起的路线前进，所有路径最终汇聚于 BOSS" : "从起点选择一条路线出发"}</div>
        {/* 地图：网状连线图，每一节点连向上一/下一节点；block 流保证图例在地图下方，overflow-auto 兼顾小屏纵/横滚动 */}
        <div className="flex-1 overflow-auto px-2 py-3">
          <SpireMap s={s} onEnter={(id) => { unlockSpireAudio(); sfx("select"); enterNode(sp.current!, id); bump() }} />
        </div>
        {/* 弹层：查看卡组 */}
        {showDeck && (
          <Overlay title="🎴 我的卡组" sub={`共 ${s.deck.length} 张`} onClose={() => setShowDeck(false)}>
            <div className="flex max-h-[50vh] flex-wrap justify-center gap-2 overflow-y-auto">
              {s.deck.map((d, i) => <CardView key={i} def={d} small />)}
            </div>
          </Overlay>
        )}
      </div>
    )
  }

  return (
    <div key={screenShake} className="relative flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-300/60 select-none"
      style={{ background: `linear-gradient(180deg, ${accent}26 0%, #0b0e1a 62%)`, ...(screenShake ? { animation: "spire-screenshake .4s ease" } : {}) }}>
      <style>{`
        @keyframes spire-float-up { 0% { opacity:0; transform:translateY(8px) scale(.7) } 18% { opacity:1; transform:translateY(0) scale(1.2) } 70% { opacity:1 } 100% { opacity:0; transform:translateY(-48px) scale(1) } }
        @keyframes spire-shake { 0%,100% { transform:translateX(0) } 20% { transform:translateX(-8px) rotate(-2deg) } 40% { transform:translateX(7px) rotate(2deg) } 60% { transform:translateX(-5px) } 80% { transform:translateX(3px) } }
        @keyframes spire-flash { 0% { filter:brightness(1) } 30% { filter:brightness(2.2) drop-shadow(0 0 16px rgba(244,63,94,.95)) } 100% { filter:brightness(1) } }
        @keyframes spire-pop { 0% { transform:scale(0) } 65% { transform:scale(1.35) } 100% { transform:scale(1) } }
        @keyframes spire-screenshake { 0%,100% { transform:translate(0,0) } 25% { transform:translate(-6px,3px) } 50% { transform:translate(5px,-4px) } 75% { transform:translate(-3px,2px) } }
        /* 待机：极缓呼吸浮动（形象精灵专用，受击抖动在外层元素上，二者不冲突） */
        @keyframes spire-idle { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-5px) } }
        /* 攻击牌：玩家向敌人侧突进 */
        @keyframes spire-lunge { 0% { transform:translateX(0) } 28% { transform:translateX(14px) rotate(2deg) } 100% { transform:translateX(0) } }
        /* 弹道横移（left/opacity 由 keyframes 驱动，transform 不受影响） */
        @keyframes spire-shot-move { 0% { left:24%; opacity:0 } 14% { opacity:1 } 82% { opacity:1 } 100% { left:76%; opacity:0 } }
        /* 防御：护盾环外扩闪现 */
        @keyframes spire-ring { 0% { opacity:0; transform:scale(.55) } 22% { opacity:.95 } 100% { opacity:0; transform:scale(1.6) } }
        /* 增益：能量粒子上升 */
        @keyframes spire-rise { 0% { opacity:0; transform:translateY(14px) scale(.6) } 35% { opacity:.9 } 100% { opacity:0; transform:translateY(-40px) scale(1) } }
        /* 特殊：符能脉冲外扩 */
        @keyframes spire-pulse-out { 0% { opacity:.9; transform:scale(.4) } 100% { opacity:0; transform:scale(1.5) } }
      `}</style>
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <div className="flex items-center gap-3 text-zinc-200">
          <span className="font-bold" style={{ color: accent }}>🗼 第 {s.act}/{s.totalActs} 幕 · 第 {s.floor}/{s.maxFloor} 层</span>
          <span>🪙 {s.gold}</span>
          <PotionsBar potions={s.potions} onUse={(i) => { sfx("potion"); fireFx(usePotion(sp.current!, i)); bump() }} />
          <span className="text-zinc-400">回合 {s.turn}</span>
        </div>
        <div className="flex items-center gap-2">
          <SfxToggle muted={muted} onToggle={toggleMute} />
          <button onClick={() => setShowDeck(true)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10">🎴 卡组 {s.deck.length}</button>
          <button onClick={backToMenu} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/10">🏳️ 放弃</button>
        </div>
      </div>

      {/* 战斗区：左侧玩家形象 / 右侧怪物形象（min-h-0 使 flex-1 可收缩，为手牌换行腾出空间） */}
      <div className="relative flex min-h-0 flex-1 items-center px-4 sm:px-10">
        {/* 左：玩家 */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5">
          {/* 玩家飘字（受击 / 格挡 / 力量 / debuff / 回血 / 能量） */}
          {floats.filter((f) => f.target === "player").map((f) => (
            <div key={f.id} className={`pointer-events-none absolute top-[16%] z-30 text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] ${f.cls}`}
              style={{ animation: "spire-float-up 1.05s ease-out both", animationDelay: `${f.delay}s`, marginLeft: f.dx }}>
              {f.text}
            </div>
          ))}
          {/* 玩家形象：外层=受击抖动/闪白，中层=出牌突进，内层=待机浮动；动作层全部 pointer-events-none，不吞点击 */}
          <div key={playerHit} className="relative"
            style={playerHit ? { animation: "spire-shake .45s ease, spire-flash .45s ease" } : undefined}>
            {/* 防御牌：护盾环外扩 */}
            {actionKind === "defense" && (
              <span key={`sh${actSeq}`} className="pointer-events-none absolute left-1/2 top-1/2 z-10 rounded-full"
                style={{ width: 128, height: 128, marginLeft: -64, marginTop: -64, border: `2px solid ${fxStyle.color}`, boxShadow: `0 0 22px ${fxStyle.glow}`, animation: "spire-ring .5s ease-out both" }} />
            )}
            {/* 增益牌：能量粒子上升 */}
            {actionKind === "buff" && (
              <span key={`bu${actSeq}`} className="pointer-events-none absolute inset-0 z-10">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="absolute rounded-full"
                    style={{
                      left: `${26 + i * 16}%`, bottom: "26%", width: 6, height: 6,
                      background: fxStyle.color, boxShadow: `0 0 8px ${fxStyle.glow}`,
                      animation: "spire-rise .55s ease-out both", animationDelay: `${i * 0.05}s`,
                    }} />
                ))}
              </span>
            )}
            {/* 特殊牌：符能脉冲 */}
            {actionKind === "special" && (
              <span key={`sp${actSeq}`} className="pointer-events-none absolute left-1/2 top-1/2 z-10 rounded-full"
                style={{ width: 122, height: 122, marginLeft: -61, marginTop: -61, border: `2px dashed ${fxStyle.color}`, animation: "spire-pulse-out .55s ease-out both" }} />
            )}
            <div key={`lg${actSeq}`} style={isAttackAct ? { animation: "spire-lunge .42s ease" } : undefined}>
              <div className="flex flex-col items-center" style={{ animation: "spire-idle 2.8s ease-in-out infinite" }}>
                {hasSpireSprite("player", ch.id)
                  ? <SpireSprite kind="player" id={ch.id} className="h-28 w-28 drop-shadow-[0_0_18px_rgba(52,211,153,0.28)] sm:h-32 sm:w-32" />
                  : <div className="text-7xl drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]">{ch.icon}</div>}
              </div>
            </div>
          </div>
          <div className="text-sm font-bold text-zinc-100">{ch.name}</div>
          <div className="flex flex-wrap justify-center gap-1">
            {ch.passives.map((p, i) => (
              <span key={i} className="text-[10px] text-amber-300/70" title={`${p.name}：${p.desc}`}>{p.icon} {p.name}</span>
            ))}
          </div>
          <StatusBadges block={s.block} str={s.str + s.tempStr} weak={s.weak} vuln={s.vuln} />
        </div>

        {/* 中间分隔 */}
        <div className="px-2 text-2xl opacity-40 sm:px-6">⚔️</div>

        {/* 右：怪物 */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5">
          {/* 敌方飘字（伤害 / 格挡 / 力量 / debuff） */}
          {floats.filter((f) => f.target === "enemy").map((f) => (
            <div key={f.id} className={`pointer-events-none absolute top-[16%] z-30 text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] ${f.cls}`}
              style={{ animation: "spire-float-up 1.05s ease-out both", animationDelay: `${f.delay}s`, marginLeft: f.dx }}>
              {f.text}
            </div>
          ))}
          {e ? (
            <>
              <div className="rounded-full bg-black/40 px-3 py-1 text-xs">
                意图：<IntentView move={e.move} str={e.str} weak={e.weak} atkScale={e.atkScale} />
              </div>
              <div key={enemyHit} className="relative"
                style={enemyHit ? { animation: "spire-shake .45s ease, spire-flash .45s ease" } : undefined}>
                <div className="flex flex-col items-center" style={{ animation: "spire-idle 3.1s ease-in-out infinite" }}>
                  {hasSpireSprite("enemy", e.def.id) ? (
                    <SpireSprite kind="enemy" id={e.def.id}
                      className={`${e.def.boss ? "h-40 w-40 sm:h-48 sm:w-48" : e.def.elite ? "h-32 w-32 sm:h-36 sm:w-36" : "h-28 w-28 sm:h-32 sm:w-32"} drop-shadow-[0_0_18px_rgba(244,63,94,0.28)]`} />
                  ) : (
                    <div className={`${e.def.boss ? "text-8xl" : "text-7xl"} drop-shadow-[0_0_18px_rgba(244,63,94,0.35)]`}>{e.def.icon}</div>
                  )}
                </div>
              </div>
              <div className="text-sm font-bold text-zinc-100">
                {e.def.name}
                {e.def.elite && <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">精英</span>}
                {e.def.boss && <span className="ml-1.5 rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] text-rose-300">BOSS</span>}
              </div>
              <div className="w-44">
                <HpBar hp={e.hp} maxHp={e.maxHp} color="bg-gradient-to-r from-rose-600 to-orange-500" />
                <div className="mt-0.5 text-center text-[11px] text-zinc-300">❤️ {e.hp}/{e.maxHp}</div>
              </div>
              <StatusBadges block={e.block} str={e.str} weak={e.weak} vuln={e.vuln} />
            </>
          ) : (
            <div className="text-sm text-zinc-500">…</div>
          )}
        </div>

        {/* 攻击弹道：从玩家侧飞向敌人侧，形态与配色按角色区分（纯表现层，不影响结算） */}
        {isAttackAct && (
          <span key={`proj${actSeq}`} className="pointer-events-none absolute top-1/2 z-20"
            style={{ left: "24%", transform: "translateY(-50%)", animation: "spire-shot-move .46s ease-out both" }}>
            {fxStyle.proj === "slash" && (
              <>
                <span className="block rounded-full" style={{ width: 4, height: 58, background: `linear-gradient(180deg, transparent, ${fxStyle.color}, transparent)`, boxShadow: `0 0 14px ${fxStyle.glow}`, transform: "rotate(26deg)" }} />
                <span className="absolute left-1 top-3 block rounded-full" style={{ width: 2, height: 34, background: fxStyle.color, opacity: .5, transform: "rotate(26deg)" }} />
              </>
            )}
            {fxStyle.proj === "orb" && (
              <>
                <span className="block rounded-full" style={{ width: 22, height: 22, background: `radial-gradient(circle at 38% 34%, #ffffff, ${fxStyle.color} 55%, transparent 78%)`, boxShadow: `0 0 20px ${fxStyle.glow}` }} />
                <span className="absolute top-1/2 block h-[3px] w-7 -translate-y-1/2 rounded-full" style={{ left: -28, background: `linear-gradient(270deg, transparent, ${fxStyle.glow})` }} />
              </>
            )}
            {fxStyle.proj === "bash" && (
              <span className="block" style={{ width: 30, height: 12, borderRadius: 4, background: fxStyle.color, boxShadow: `0 0 16px ${fxStyle.glow}`, transform: "rotate(-12deg)" }} />
            )}
            {fxStyle.proj === "seal" && (
              <>
                <span className="block" style={{ width: 20, height: 26, borderRadius: 3, background: fxStyle.color, border: `1px solid ${fxStyle.color}`, boxShadow: `0 0 16px ${fxStyle.glow}`, transform: "rotate(-18deg)" }} />
                <span className="absolute left-1/2 top-2 block h-[16px] w-[2px] rounded-full" style={{ background: "#0b0e1a", opacity: .6, transform: "translateX(-50%) rotate(-18deg)" }} />
              </>
            )}
          </span>
        )}
      </div>

      {/* 最近日志 */}
      <div className="h-8 text-center text-[11px] leading-4 text-zinc-500">
        {s.log.slice(-2).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* 玩家血量 + 操作 + 手牌（shrink-0 保证手牌区不被战斗区挤压裁切） */}
      <div className="shrink-0 border-t border-white/10 bg-black/30 px-4 pt-2 pb-3">
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-orange-600 text-sm font-black text-white shadow">{s.energy}</span>
            <span className="text-[10px] text-zinc-400">能量</span>
          </div>
          <div className="w-44">
            <HpBar hp={s.hp} maxHp={s.maxHp} />
            <div className="mt-0.5 text-center text-[11px] text-zinc-300">{ch.icon} {s.hp}/{s.maxHp}</div>
          </div>
            <button onClick={() => {
              if (ch.skill.kind === "echo-copy") { sfx("select"); setCopyPick(true); return }
              sfx("skill"); fireFx(useSkill(sp.current!)); bump()
            }}
            disabled={s.phase !== "combat" || (ch.skill.kind === "echo-copy" ? s.echoCopyUsed : s.skillCd > 0) || !!s.pendingEcho || !!s.pendingScry}
            title={`${ch.skill.name}：${ch.skill.desc}`}
            className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-bold text-white enabled:hover:brightness-110 disabled:opacity-40">
            {ch.skill.icon} {ch.skill.name}
            {ch.skill.kind === "echo-copy"
              ? (s.echoCopyUsed ? "（已用）" : "")
              : (s.skillCd > 0 ? `（${s.skillCd}）` : "")}
          </button>
          <button onClick={() => { sfx("turn-end"); fireFx(endTurn(sp.current!)); bump() }} disabled={s.phase !== "combat" || !!s.pendingEcho || !!s.pendingScry}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white enabled:hover:brightness-110 disabled:opacity-40">
            结束回合 ▶
          </button>
        </div>

        <div className="mt-2 flex max-h-[42vh] min-h-[8.5rem] flex-wrap items-end justify-center gap-2 overflow-y-auto">
          {s.hand.map((c) => {
            const isCopy = c.uid === s.echoCopyUid
            return (
              <div key={c.uid} className="relative">
                {isCopy && <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-violet-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">📜 复制牌</div>}
                <CardView def={c.def} disabled={c.def.cost > s.energy || !!s.pendingEcho || !!s.pendingScry}
                  onClick={() => {
                    // 先结算引擎，再播动作动画：动画纯表现层，绝不参与/阻断玩法逻辑（连点按 seq 重触发）
                    const kind = c.def.category
                    fireFx(playCard(sp.current!, c.uid))
                    triggerAction(kind)
                    bump()
                  }} />
              </div>
            )
          })}
          {s.hand.length === 0 && <div className="pb-8 text-xs text-zinc-600">手牌已空，结束回合吧</div>}
        </div>
        <div className="mt-1 flex justify-center gap-4 text-[11px] text-zinc-500">
          <span>抽牌堆 {s.draw.length}</span>
          <span>弃牌堆 {s.discard.length}</span>
        </div>
      </div>

      {/* -------- 覆盖层：奖励 -------- */}
      {s.phase === "reward" && (
        <Overlay title="⚔️ 战斗胜利" sub={`获得 ${s.lastGold} 金币，选择一张卡牌加入卡组（可跳过）`}>
          <div className="flex flex-wrap justify-center gap-3">
            {s.rewardCards.map((c) => (
              <CardView key={c.uid} def={c.def} onClick={() => { sfx("gold"); chooseReward(sp.current!, c.uid); bump() }} />
            ))}
          </div>
          <button onClick={() => { sfx("select"); chooseReward(sp.current!, null); bump() }}
            className="mt-4 rounded-lg border border-white/20 px-5 py-1.5 text-sm text-zinc-300 hover:bg-white/10">跳过奖励</button>
        </Overlay>
      )}

      {/* -------- 覆盖层：补给营地 -------- */}
      {s.phase === "rest" && (
        <Overlay title="🔥 补给营地" sub={`抵达第 ${s.floor} 层，选择一种休整方式`}>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => { sfx("rest"); fireFx(restHeal(sp.current!)); bump() }}
              className="w-44 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-4 text-center hover:bg-emerald-500/20">
              <div className="text-3xl">🔥</div>
              <div className="mt-1 font-bold text-emerald-300">营地休息</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">回复 30% 最大生命</div>
            </button>
            <button onClick={() => { sfx("select"); setUpgradePick(true) }}
              className="w-44 rounded-xl border border-sky-400/50 bg-sky-500/10 p-4 text-center hover:bg-sky-500/20">
              <div className="text-3xl">⚒️</div>
              <div className="mt-1 font-bold text-sky-300">锻造强化</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">选择卡组中一张卡强化</div>
            </button>
          </div>
        </Overlay>
      )}

      {/* -------- 弹层：选择要强化的卡 -------- */}
      {upgradePick && (
        <Overlay title="⚒️ 选择要强化的卡" sub="强化后效果数值提升、卡名加「·强」（已强化的卡不可再选）" onClose={() => setUpgradePick(false)}>
          <div className="flex max-h-[50vh] flex-wrap justify-center gap-2 overflow-y-auto">
            {s.deck.map((d, i) => (
              <CardView key={i} def={d} small disabled={d.upgraded}
                onClick={() => { sfx("upgrade"); restUpgrade(sp.current!, i); setUpgradePick(false); bump() }} />
            ))}
          </div>
        </Overlay>
      )}

      {/* -------- 覆盖层：商店 -------- */}
      {s.phase === "shop" && (
        <Overlay title="🛒 商店" sub={`金币：🪙 ${s.gold}`}>
          <div className="flex flex-wrap justify-center gap-3">
            {s.shopCards.map((it) => (
              <CardView key={it.uid} def={it.def} price={it.price} disabled={s.gold < it.price}
                onClick={() => { sfx("shop"); buyCard(sp.current!, it.uid); bump() }} />
            ))}
            {s.shopCards.length === 0 && <div className="text-xs text-zinc-500">卡牌已售罄</div>}
          </div>
          {/* 药水货架 */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {s.shopPotions.map((p, i) => (
              <button key={i} onClick={() => { sfx("potion"); buyPotion(sp.current!, i); bump() }}
                disabled={s.gold < p.price || s.potions.length >= MAX_POTIONS}
                title={POTION_DEFS[p.kind].desc}
                className="rounded-xl border border-sky-400/50 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 enabled:hover:bg-sky-500/20 disabled:opacity-40">
                {POTION_DEFS[p.kind].icon} {POTION_DEFS[p.kind].name} · 🪙{p.price}
              </button>
            ))}
            {s.potions.length >= MAX_POTIONS && <span className="self-center text-[11px] text-zinc-500">药水架已满（{MAX_POTIONS} 格）</span>}
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button onClick={() => { sfx("select"); setRemoveMode(true) }}
              disabled={s.shopRemoveUsed || s.gold < REMOVE_COST || s.deck.length <= 5}
              className="rounded-lg border border-rose-400/50 px-4 py-1.5 text-sm text-rose-300 enabled:hover:bg-rose-500/10 disabled:opacity-40">
              🗑️ 移除一张卡（🪙{REMOVE_COST}）{s.shopRemoveUsed ? "·已使用" : ""}
            </button>
            <button onClick={() => { sfx("select"); leaveShop(sp.current!); bump() }}
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-1.5 text-sm font-bold text-white hover:brightness-110">
              离开商店 ▶
            </button>
          </div>
        </Overlay>
      )}

      {/* -------- 覆盖层：幸运事件 -------- */}
      {s.phase === "event" && s.eventResult && (
        <Overlay title={`${s.eventResult.icon} ${s.eventResult.title}`} sub={s.eventResult.desc}>
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-6 py-3 text-sm text-amber-200">🎉 {s.eventResult.result}</div>
          <button onClick={() => { sfx("select"); leaveEvent(sp.current!); bump() }}
            className="mt-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2 text-sm font-bold text-white hover:brightness-110">
            继续前进 ▶
          </button>
        </Overlay>
      )}

      {/* -------- 弹层：查看卡组 -------- */}
      {showDeck && (
        <Overlay title="🎴 我的卡组" sub={`共 ${s.deck.length} 张`} onClose={() => setShowDeck(false)}>
          <div className="flex max-h-[50vh] flex-wrap justify-center gap-2 overflow-y-auto">
            {s.deck.map((d, i) => <CardView key={i} def={d} small />)}
          </div>
        </Overlay>
      )}

      {/* -------- 弹层：移除卡牌 -------- */}
      {removeMode && (
        <Overlay title="🗑️ 选择要移除的卡" sub={`花费 🪙${REMOVE_COST}，点击卡牌即移除`} onClose={() => setRemoveMode(false)}>
          <div className="flex max-h-[50vh] flex-wrap justify-center gap-2 overflow-y-auto">
            {s.deck.map((d, i) => (
              <CardView key={i} def={d} small onClick={() => { sfx("remove"); removeCard(sp.current!, i); setRemoveMode(false); bump() }} />
            ))}
          </div>
        </Overlay>
      )}

      {/* -------- 弹层：情势三选一 -------- */}
      {s.pendingEcho && (
        <Overlay title="🀄 被动【情势】" sub={`手牌中还有 ${s.pendingEcho.count} 张与【${s.pendingEcho.def.name}】同类型的牌，选择一个效果：`}>
          <div className="flex w-full flex-col gap-2">
            <button onClick={() => { fireFx(resolveEcho(sp.current!, 1)); bump() }}
              className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-left hover:bg-rose-500/20">
              <div className="text-sm font-bold text-rose-300">① 乘胜追击</div>
              <div className="text-[11px] text-zinc-400">【{s.pendingEcho.def.name}】的所有效果 ×{s.pendingEcho.count}</div>
            </button>
            <button onClick={() => { fireFx(resolveEcho(sp.current!, 2)); bump() }}
              className="rounded-xl border border-indigo-400/50 bg-indigo-500/10 px-4 py-3 text-left hover:bg-indigo-500/20">
              <div className="text-sm font-bold text-indigo-300">② 顺势摸牌</div>
              <div className="text-[11px] text-zinc-400">抽 {s.pendingEcho.count} 张牌</div>
            </button>
            <button onClick={() => { fireFx(resolveEcho(sp.current!, 3)); bump() }}
              className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-left hover:bg-emerald-500/20">
              <div className="text-sm font-bold text-emerald-300">③ 稳扎稳打</div>
              <div className="text-[11px] text-zinc-400">回复 {s.pendingEcho.count} 点生命</div>
            </button>
          </div>
        </Overlay>
      )}

      {/* -------- 弹层：尽瘁观牌 -------- */}
      {s.pendingScry && (
        <Overlay title="🕯️ 被动【尽瘁】·观牌" sub={`观看牌堆顶 ${s.pendingScry.length} 张牌，点击卡牌切换「置顶 / 压底」，确认后按安排放回牌堆`}>
          <div className="flex flex-wrap justify-center gap-2">
            {s.pendingScry.map((c, i) => (
              <div key={c.uid} className="relative">
                <div className={`absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white shadow ${s.scryTop[i] ? "bg-emerald-600" : "bg-zinc-600"}`}>
                  {s.scryTop[i] ? "⬆ 牌堆顶" : "⬇ 牌堆底"}
                </div>
                <CardView def={c.def} small onClick={() => { s.scryTop[i] = !s.scryTop[i]; bump() }} />
              </div>
            ))}
          </div>
          <button onClick={() => { resolveScry(sp.current!); bump() }}
            className="mt-4 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2 text-sm font-bold text-white hover:brightness-110">
            确认安排（置顶 {s.scryTop.filter(Boolean).length} / 压底 {s.scryTop.filter((t) => !t).length}）
          </button>
        </Overlay>
      )}

      {/* -------- 弹层：锦囊复刻选牌 -------- */}
      {copyPick && (
        <Overlay title="📜 技能【锦囊复刻】" sub="选择手牌中的一张牌生成其原始复制；复制牌打出后回合结束时回到手中，未打出则留在手牌" onClose={() => setCopyPick(false)}>
          <div className="flex flex-wrap justify-center gap-2">
            {s.hand.map((c) => (
              <CardView key={c.uid} def={c.def} onClick={() => { fireFx(echoCopyCard(sp.current!, c.uid)); setCopyPick(false); bump() }} />
            ))}
          </div>
        </Overlay>
      )}
    </div>
  )
}

/** 药水栏：点击使用（治疗随时可用，其余仅战斗中可用，引擎已做守卫） */
function PotionsBar({ potions, onUse }: { potions: PotionKind[]; onUse: (idx: number) => void }) {
  if (potions.length === 0) return null
  return (
    <span className="flex items-center gap-1">
      {potions.map((k, i) => (
        <button key={i} onClick={() => onUse(i)} title={`${POTION_DEFS[k].name}：${POTION_DEFS[k].desc}（点击使用）`}
          className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-xs hover:bg-white/25">
          {POTION_DEFS[k].icon}
        </button>
      ))}
    </span>
  )
}

function Overlay({ title, sub, children, onClose }: { title: string; sub?: string; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[90%] w-full max-w-2xl flex-col items-center overflow-y-auto rounded-2xl border border-white/15 bg-[#151226] p-6 shadow-2xl">
        <div className="flex w-full items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          {onClose && <button onClick={onClose} className="rounded-lg px-2 text-zinc-400 hover:bg-white/10">✕</button>}
        </div>
        {sub && <p className="mt-1 w-full text-left text-xs text-zinc-400">{sub}</p>}
        <div className="mt-4 flex w-full flex-col items-center">{children}</div>
      </div>
    </div>
  )
}
