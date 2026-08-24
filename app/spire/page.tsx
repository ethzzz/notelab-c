"use client"

import { useEffect, useRef, useState } from "react"
import {
  newRun, playCard, endTurn, useSkill, resolveEcho, resolveScry, echoCopyCard,
  chooseReward, buyCard, removeCard, leaveShop, buyPotion,
  enterNode, restHeal, restUpgrade, usePotion, leaveEvent,
  mapRows, reachableIds, NODE_META, POTION_DEFS, MAX_POTIONS,
  enemyAtkPreview, REMOVE_COST, MAX_FLOOR, CHARACTERS, characterOf, applyCustomContent,
  type RunState, type Move, type FxEvent, type FxTarget, type PotionKind,
} from "@/lib/spire-engine"
import { SpireCardView as CardView } from "@/components/SpireCardView"
import { loadSpireContent } from "@/lib/spire-content"

function HpBar({ hp, maxHp, color = "bg-gradient-to-r from-emerald-500 to-lime-400" }: { hp: number; maxHp: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
      <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
    </div>
  )
}

function IntentView({ move, str, weak }: { move: Move; str: number; weak: number }) {
  if (move.kind === "atk") {
    let d = move.amt + str
    if (weak > 0) d = Math.floor(d * 0.75)
    return <span className="text-rose-300">⚔️ 攻击 {d}</span>
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
  const bump = () => setTick((t) => t + 1)

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

  useEffect(() => { setBest(Number(localStorage.getItem("spire-best") || 0)) }, [])

  // 加载工坊自定义卡/角色并注册进引擎
  useEffect(() => {
    loadSpireContent().then((c) => { applyCustomContent(c.cards, c.characters); bump() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = sp.current

  const recordBest = (floor: number) => {
    if (floor > best) { setBest(floor); localStorage.setItem("spire-best", String(floor)) }
  }

  const start = () => {
    setPickOpen(true)
  }

  const pickCharacter = (charId: string) => {
    sp.current = newRun(charId)
    setPickOpen(false); setShowDeck(false); setRemoveMode(false); setCopyPick(false); setUpgradePick(false)
    bump()
  }

  // 结束时记录最佳层数
  useEffect(() => {
    if (!s) return
    if (s.phase === "over") recordBest(s.floor)
    if (s.phase === "win") recordBest(s.maxFloor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const backToMenu = () => { sp.current = null; setShowDeck(false); setRemoveMode(false); setPickOpen(false); setCopyPick(false); setUpgradePick(false); bump() }

  // ---------------- 角色选择 ----------------
  if (!s && pickOpen) {
    return (
      <div className="relative h-[calc(100vh-6.5rem)] overflow-y-auto rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] select-none">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-8">
          <h2 className="text-2xl font-black text-white">选择你的角色</h2>
          <p className="mt-1 text-xs text-zinc-400">每个角色拥有独特的被动与主动技能</p>
          <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHARACTERS.map((ch) => (
              <button key={ch.id} onClick={() => pickCharacter(ch.id)}
                className="group flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition-all hover:border-indigo-400/60 hover:bg-indigo-400/10 hover:shadow-lg hover:shadow-indigo-900/30">
                <div className="text-5xl drop-shadow-[0_0_14px_rgba(129,140,248,0.35)]">{ch.icon}</div>
                <div className="mt-2 text-base font-bold text-white">{ch.name}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{ch.desc}</div>
                <div className="mt-1 text-[11px] text-emerald-300">❤️ {ch.maxHp} 生命</div>
                <div className="mt-3 w-full rounded-xl bg-black/30 p-2.5 text-left">
                  {ch.passives.map((p, i) => (
                    <div key={i} className={`${i > 0 ? "mt-1.5" : ""} text-[11px] leading-relaxed text-amber-200/90`}>{p.icon} 被动·{p.name}<br /><span className="text-zinc-400">{p.desc}</span></div>
                  ))}
                  <div className="mt-1.5 text-[11px] leading-relaxed text-violet-200/90">{ch.skill.icon} 技能·{ch.skill.name}{ch.skill.kind === "echo-copy" ? "（每轮对战限一次）" : `（冷却 ${ch.skill.cooldown} 回合）`}<br /><span className="text-zinc-400">{ch.skill.desc}</span></div>
                </div>
                <div className="mt-3 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-5 py-1.5 text-xs font-bold text-white opacity-90 group-hover:opacity-100">选择 {ch.name}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPickOpen(false)} className="mt-6 rounded-xl border border-white/20 px-6 py-2 text-sm text-zinc-300 hover:bg-white/10">返回菜单</button>
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
          <p className="mt-1 text-sm text-zinc-400">杀戮尖塔 lite · 构筑卡组，击败魔王，登顶 {MAX_FLOOR} 层</p>
          {best > 0 && <div className="mt-3 rounded-full bg-amber-500/15 px-4 py-1 text-sm text-amber-300">🏆 最佳纪录：第 {best} 层</div>}
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
              每局生成 {MAX_FLOOR} 层路线：自选路径前进，途经普通/精英敌人、补给营地、商店与幸运事件，所有路线最终汇聚 BOSS。
            </div>
          </div>
          <div className="mt-4 text-[11px] text-zinc-500">状态说明：💪力量 提升攻击 · 🌀虚弱 造成伤害 -25% · 🎯易伤 受到伤害 +50%</div>
        </div>
      </div>
    )
  }

  const over = s.phase === "over" || s.phase === "win"

  // ---------------- 结算（胜利 / 失败） ----------------
  if (over) {
    const win = s.phase === "win"
    return (
      <div className="relative flex h-[calc(100vh-6.5rem)] flex-col items-center justify-center rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] px-4 text-center select-none">
        <div className="text-6xl">{win ? "👑" : "💀"}</div>
        <h2 className={`mt-3 text-3xl font-black ${win ? "text-amber-300" : "text-rose-400"}`}>{win ? "登顶成功！" : "止步于此"}</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {win ? `你击败了史莱姆之王，征服了 ${MAX_FLOOR} 层高塔` : `你在第 ${s.floor} 层倒下（共 ${MAX_FLOOR} 层）`}
        </p>
        <div className="mt-4 flex gap-6 text-sm text-zinc-300">
          <span>⚔️ 击败 {s.kills} 敌人</span>
          <span>🪙 余 {s.gold} 金币</span>
          <span>🎴 卡组 {s.deck.length} 张</span>
        </div>
        {best >= (win ? s.maxFloor : s.floor) && <div className="mt-2 text-xs text-amber-300">🏆 刷新/保持最佳纪录：第 {best} 层</div>}
        <div className="mt-6 flex gap-3">
          <button onClick={start} className="rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-6 py-2.5 font-bold text-white hover:brightness-110">🔄 再来一局</button>
          <button onClick={backToMenu} className="rounded-xl border border-white/20 px-6 py-2.5 font-bold text-zinc-200 hover:bg-white/10">返回菜单</button>
        </div>
      </div>
    )
  }

  const e = s.enemy
  const ch = characterOf(s)

  // ---------------- 路线图：选择下一节点前进 ----------------
  if (s.phase === "map") {
    const rows = mapRows(s)
    const reach = new Set(reachableIds(s))
    return (
      <div className="relative flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#141021] to-[#0b0e1a] select-none">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-2 text-sm">
          <div className="flex items-center gap-3 text-zinc-200">
            <span className="font-bold text-amber-300">🗼 路线图</span>
            <span>🪙 {s.gold}</span>
            <span className="text-rose-300">❤️ {s.hp}/{s.maxHp}</span>
            <PotionsBar potions={s.potions} onUse={(i) => { fireFx(usePotion(sp.current!, i)); bump() }} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowDeck(true)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10">🎴 卡组 {s.deck.length}</button>
            <button onClick={backToMenu} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/10">🏳️ 放弃</button>
          </div>
        </div>
        <div className="text-center text-xs text-zinc-400">{s.pos ? "选择一个亮起的节点继续前进，所有路线最终汇聚 BOSS" : "从起点选择一条路线出发"}</div>
        {/* 地图：首行起点在上，末行 BOSS 在下 */}
        <div className="flex flex-1 flex-col justify-evenly overflow-y-auto px-4 py-3">
          {rows.map((row, r) => (
            <div key={r} className="flex items-center justify-center gap-5">
              {row.map((n) => {
                const meta = NODE_META[n.type]
                const isCur = s.pos === n.id
                const done = s.visited.includes(n.id) && !isCur
                const can = reach.has(n.id)
                const isBoss = n.type === "boss"
                return (
                  <button key={n.id} disabled={!can}
                    onClick={() => { enterNode(sp.current!, n.id); bump() }}
                    title={meta.name}
                    className={`flex flex-col items-center rounded-xl border transition-all ${isBoss ? "px-6 py-2.5" : "px-3 py-1.5"} ${
                      isCur ? "border-amber-400 bg-amber-500/20 shadow-[0_0_14px_rgba(251,191,36,.35)]"
                      : can ? "border-emerald-400/70 bg-emerald-500/10 hover:bg-emerald-500/25 hover:shadow-[0_0_12px_rgba(52,211,153,.35)]"
                      : done ? "border-white/10 bg-white/5 opacity-35"
                      : "border-white/15 bg-white/5 opacity-70"}`}>
                    <span className={isBoss ? "text-4xl" : "text-2xl"}>{meta.icon}</span>
                    <span className={`mt-0.5 ${isBoss ? "text-xs font-bold text-rose-300" : "text-[10px] text-zinc-300"}`}>
                      {meta.name}{done ? " ✓" : ""}{isCur ? " 📍" : ""}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
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
    <div key={screenShake} className="relative flex h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-300/60 bg-gradient-to-b from-[#1a1230] to-[#0b0e1a] select-none"
      style={screenShake ? { animation: "spire-screenshake .4s ease" } : undefined}>
      <style>{`
        @keyframes spire-float-up { 0% { opacity:0; transform:translateY(8px) scale(.7) } 18% { opacity:1; transform:translateY(0) scale(1.2) } 70% { opacity:1 } 100% { opacity:0; transform:translateY(-48px) scale(1) } }
        @keyframes spire-shake { 0%,100% { transform:translateX(0) } 20% { transform:translateX(-8px) rotate(-2deg) } 40% { transform:translateX(7px) rotate(2deg) } 60% { transform:translateX(-5px) } 80% { transform:translateX(3px) } }
        @keyframes spire-flash { 0% { filter:brightness(1) } 30% { filter:brightness(2.2) drop-shadow(0 0 16px rgba(244,63,94,.95)) } 100% { filter:brightness(1) } }
        @keyframes spire-pop { 0% { transform:scale(0) } 65% { transform:scale(1.35) } 100% { transform:scale(1) } }
        @keyframes spire-screenshake { 0%,100% { transform:translate(0,0) } 25% { transform:translate(-6px,3px) } 50% { transform:translate(5px,-4px) } 75% { transform:translate(-3px,2px) } }
      `}</style>
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <div className="flex items-center gap-3 text-zinc-200">
          <span className="font-bold text-amber-300">🗼 第 {s.floor}/{s.maxFloor} 层</span>
          <span>🪙 {s.gold}</span>
          <PotionsBar potions={s.potions} onUse={(i) => { fireFx(usePotion(sp.current!, i)); bump() }} />
          <span className="text-zinc-400">回合 {s.turn}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDeck(true)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10">🎴 卡组 {s.deck.length}</button>
          <button onClick={backToMenu} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:bg-white/10">🏳️ 放弃</button>
        </div>
      </div>

      {/* 战斗区：左侧玩家形象 / 右侧怪物形象 */}
      <div className="relative flex flex-1 items-center px-4 sm:px-10">
        {/* 左：玩家 */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5">
          {/* 玩家飘字（受击 / 格挡 / 力量 / debuff / 回血 / 能量） */}
          {floats.filter((f) => f.target === "player").map((f) => (
            <div key={f.id} className={`pointer-events-none absolute top-[16%] z-30 text-2xl font-black drop-shadow-[0_2px_6px_rgba(0,0,0,.8)] ${f.cls}`}
              style={{ animation: "spire-float-up 1.05s ease-out both", animationDelay: `${f.delay}s`, marginLeft: f.dx }}>
              {f.text}
            </div>
          ))}
          <div key={playerHit} className="text-7xl drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]"
            style={playerHit ? { animation: "spire-shake .45s ease, spire-flash .45s ease" } : undefined}>{ch.icon}</div>
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
                意图：<IntentView move={e.move} str={e.str} weak={e.weak} />
              </div>
              <div key={enemyHit} className="text-7xl drop-shadow-[0_0_18px_rgba(244,63,94,0.35)]"
                style={enemyHit ? { animation: "spire-shake .45s ease, spire-flash .45s ease" } : undefined}>{e.def.icon}</div>
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
      </div>

      {/* 最近日志 */}
      <div className="h-8 text-center text-[11px] leading-4 text-zinc-500">
        {s.log.slice(-2).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* 玩家血量 + 操作 + 手牌 */}
      <div className="border-t border-white/10 bg-black/30 px-4 pt-2 pb-3">
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
              if (ch.skill.kind === "echo-copy") { setCopyPick(true); return }
              fireFx(useSkill(sp.current!)); bump()
            }}
            disabled={s.phase !== "combat" || (ch.skill.kind === "echo-copy" ? s.echoCopyUsed : s.skillCd > 0) || !!s.pendingEcho || !!s.pendingScry}
            title={`${ch.skill.name}：${ch.skill.desc}`}
            className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2 text-sm font-bold text-white enabled:hover:brightness-110 disabled:opacity-40">
            {ch.skill.icon} {ch.skill.name}
            {ch.skill.kind === "echo-copy"
              ? (s.echoCopyUsed ? "（已用）" : "")
              : (s.skillCd > 0 ? `（${s.skillCd}）` : "")}
          </button>
          <button onClick={() => { fireFx(endTurn(sp.current!)); bump() }} disabled={s.phase !== "combat" || !!s.pendingEcho || !!s.pendingScry}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white enabled:hover:brightness-110 disabled:opacity-40">
            结束回合 ▶
          </button>
        </div>

        <div className="mt-2 flex min-h-[8.5rem] flex-wrap items-end justify-center gap-2">
          {s.hand.map((c) => {
            const isCopy = c.uid === s.echoCopyUid
            return (
              <div key={c.uid} className="relative">
                {isCopy && <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-violet-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">📜 复制牌</div>}
                <CardView def={c.def} disabled={c.def.cost > s.energy || !!s.pendingEcho || !!s.pendingScry}
                  onClick={() => { fireFx(playCard(sp.current!, c.uid)); bump() }} />
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
              <CardView key={c.uid} def={c.def} onClick={() => { chooseReward(sp.current!, c.uid); bump() }} />
            ))}
          </div>
          <button onClick={() => { chooseReward(sp.current!, null); bump() }}
            className="mt-4 rounded-lg border border-white/20 px-5 py-1.5 text-sm text-zinc-300 hover:bg-white/10">跳过奖励</button>
        </Overlay>
      )}

      {/* -------- 覆盖层：补给营地 -------- */}
      {s.phase === "rest" && (
        <Overlay title="🔥 补给营地" sub={`抵达第 ${s.floor} 层，选择一种休整方式`}>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => { fireFx(restHeal(sp.current!)); bump() }}
              className="w-44 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-4 text-center hover:bg-emerald-500/20">
              <div className="text-3xl">🔥</div>
              <div className="mt-1 font-bold text-emerald-300">营地休息</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">回复 30% 最大生命</div>
            </button>
            <button onClick={() => setUpgradePick(true)}
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
                onClick={() => { restUpgrade(sp.current!, i); setUpgradePick(false); bump() }} />
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
                onClick={() => { buyCard(sp.current!, it.uid); bump() }} />
            ))}
            {s.shopCards.length === 0 && <div className="text-xs text-zinc-500">卡牌已售罄</div>}
          </div>
          {/* 药水货架 */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {s.shopPotions.map((p, i) => (
              <button key={i} onClick={() => { buyPotion(sp.current!, i); bump() }}
                disabled={s.gold < p.price || s.potions.length >= MAX_POTIONS}
                title={POTION_DEFS[p.kind].desc}
                className="rounded-xl border border-sky-400/50 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 enabled:hover:bg-sky-500/20 disabled:opacity-40">
                {POTION_DEFS[p.kind].icon} {POTION_DEFS[p.kind].name} · 🪙{p.price}
              </button>
            ))}
            {s.potions.length >= MAX_POTIONS && <span className="self-center text-[11px] text-zinc-500">药水架已满（{MAX_POTIONS} 格）</span>}
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button onClick={() => setRemoveMode(true)}
              disabled={s.shopRemoveUsed || s.gold < REMOVE_COST || s.deck.length <= 5}
              className="rounded-lg border border-rose-400/50 px-4 py-1.5 text-sm text-rose-300 enabled:hover:bg-rose-500/10 disabled:opacity-40">
              🗑️ 移除一张卡（🪙{REMOVE_COST}）{s.shopRemoveUsed ? "·已使用" : ""}
            </button>
            <button onClick={() => { leaveShop(sp.current!); bump() }}
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
          <button onClick={() => { leaveEvent(sp.current!); bump() }}
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
              <CardView key={i} def={d} small onClick={() => { removeCard(sp.current!, i); setRemoveMode(false); bump() }} />
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
