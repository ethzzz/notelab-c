"use client"
import { useEffect, useRef, useState } from "react"
import {
  createState, update, rollChoices, applyChoice, WEAPON_DEFS,
  type GameState, type Choice, type MetaUpg,
} from "@/lib/vs-engine"

type Phase = "menu" | "play" | "levelup" | "pause" | "over" | "win"

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`

interface Meta { gold: number; upg: MetaUpg }
const ZERO_UPG: MetaUpg = { hp: 0, sp: 0, pow: 0, mag: 0 }
function loadMeta(): Meta {
  if (typeof window === "undefined") return { gold: 0, upg: { ...ZERO_UPG } }
  try {
    const m = JSON.parse(localStorage.getItem("c_vs-meta") || "")
    return { gold: Number(m.gold) || 0, upg: { ...ZERO_UPG, ...m.upg } }
  } catch { return { gold: 0, upg: { ...ZERO_UPG } } }
}
const SHOP: { id: keyof MetaUpg; icon: string; name: string; desc: string }[] = [
  { id: "hp", icon: "❤️", name: "坚韧", desc: "初始生命 +15" },
  { id: "sp", icon: "👟", name: "身法", desc: "初始速度 +8" },
  { id: "pow", icon: "💪", name: "武力", desc: "初始伤害 +6%" },
  { id: "mag", icon: "🧲", name: "吸星", desc: "拾取范围 +15%" },
]

export default function VsPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const phaseRef = useRef<Phase>("menu")
  const keysRef = useRef<Set<string>>(new Set())
  const joyRef = useRef({ active: false, ox: 0, oy: 0, dx: 0, dy: 0 })
  const endRef = useRef(false)

  const [phase, setPhaseState] = useState<Phase>("menu")
  const [hud, setHud] = useState({ t: 0, kills: 0, level: 1, hp: 100, maxHp: 100, xp: 0, xpNext: 9, weapons: [] as { icon: string; lv: number }[] })
  const [choices, setChoices] = useState<Choice[]>([])
  const [best, setBest] = useState(0)
  const [meta, setMeta] = useState<Meta>(() => loadMeta())
  const [earned, setEarned] = useState(0)

  const setPhase = (ph: Phase) => { phaseRef.current = ph; setPhaseState(ph) }
  const togglePause = () => {
    if (phaseRef.current === "play") setPhase("pause")
    else if (phaseRef.current === "pause") setPhase("play")
  }
  const start = () => {
    stateRef.current = createState(meta.upg)
    endRef.current = false
    setHud({ t: 0, kills: 0, level: 1, hp: 100, maxHp: 100, xp: 0, xpNext: 9, weapons: [{ icon: "🪄", lv: 1 }] })
    setPhase("play")
  }
  const pick = (c: Choice) => {
    const s = stateRef.current
    if (!s) return
    applyChoice(s, c)
    setPhase("play")
  }
  const buy = (id: keyof MetaUpg) => {
    setMeta(m => {
      const lv = m.upg[id]
      const cost = (lv + 1) * 40
      if (lv >= 5 || m.gold < cost) return m
      const next = { gold: m.gold - cost, upg: { ...m.upg, [id]: lv + 1 } }
      localStorage.setItem("c_vs-meta", JSON.stringify(next))
      return next
    })
  }

  // 键盘
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault()
      if (k === "p" || k === "escape") { togglePause(); return }
      keysRef.current.add(k)
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { setBest(Number(localStorage.getItem("c_vs-best") || 0)) }, [])

  // 画布尺寸
  useEffect(() => {
    const cv = canvasRef.current, wrap = wrapRef.current
    if (!cv || !wrap) return
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.floor(wrap.clientWidth * dpr)
      cv.height = Math.floor(wrap.clientHeight * dpr)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // 触屏虚拟摇杆
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const place = (dx = 0, dy = 0) => {
      const j = joyRef.current
      if (baseRef.current) { baseRef.current.style.display = "block"; baseRef.current.style.left = `${j.ox}px`; baseRef.current.style.top = `${j.oy}px` }
      if (knobRef.current) { knobRef.current.style.display = "block"; knobRef.current.style.left = `${j.ox + dx}px`; knobRef.current.style.top = `${j.oy + dy}px` }
    }
    const hide = () => { if (baseRef.current) baseRef.current.style.display = "none"; if (knobRef.current) knobRef.current.style.display = "none" }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      const r = cv.getBoundingClientRect(), t = e.touches[0], j = joyRef.current
      j.active = true; j.ox = t.clientX - r.left; j.oy = t.clientY - r.top; j.dx = 0; j.dy = 0
      place()
    }
    const onMove = (e: TouchEvent) => {
      const j = joyRef.current
      if (!j.active || e.touches.length !== 1) return
      e.preventDefault()
      const r = cv.getBoundingClientRect(), t = e.touches[0]
      let dx = t.clientX - r.left - j.ox, dy = t.clientY - r.top - j.oy
      const d = Math.hypot(dx, dy)
      if (d > 48) { dx = (dx / d) * 48; dy = (dy / d) * 48 }
      j.dx = dx / 48; j.dy = dy / 48
      place(dx, dy)
    }
    const onEnd = () => { const j = joyRef.current; j.active = false; j.dx = 0; j.dy = 0; hide() }
    cv.addEventListener("touchstart", onStart, { passive: false })
    cv.addEventListener("touchmove", onMove, { passive: false })
    cv.addEventListener("touchend", onEnd)
    return () => { cv.removeEventListener("touchstart", onStart); cv.removeEventListener("touchmove", onMove); cv.removeEventListener("touchend", onEnd) }
  }, [])

  // 主循环
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0
    const emo = (ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, flip = false) => {
      ctx.save(); ctx.translate(x, y)
      if (flip) ctx.scale(-1, 1)
      ctx.font = `${size}px system-ui`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(e, 0, 2)
      ctx.restore()
    }
    const draw = () => {
      const cv = canvasRef.current
      if (!cv) return
      const ctx = cv.getContext("2d")
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.width / dpr, h = cv.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#0b0e1a"
      ctx.fillRect(0, 0, w, h)
      const s = stateRef.current
      if (!s) return
      const p = s.player
      const shx = (Math.random() - 0.5) * 6 * s.shake, shy = (Math.random() - 0.5) * 6 * s.shake
      const cx = p.x - w / 2 + shx, cy = p.y - h / 2 + shy
      ctx.strokeStyle = "#161b2d"
      ctx.lineWidth = 1
      const g = 48
      ctx.beginPath()
      for (let x = -(((cx % g) + g) % g); x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      for (let y = -(((cy % g) + g) % g); y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
      ctx.stroke()
      const X = (x: number) => x - cx, Y = (y: number) => y - cy
      // 蒜香力场
      if (s.weapons.aura) {
        const R = 60 + s.weapons.aura * 14
        ctx.fillStyle = "rgba(163,230,53,0.07)"
        ctx.strokeStyle = "rgba(163,230,53,0.25)"
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), R, 0, 7); ctx.fill(); ctx.stroke()
      }
      // 宝石
      for (const gm of s.gems) {
        const x = X(gm.x), y = Y(gm.y)
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4)
        ctx.fillStyle = gm.v >= 3 ? "#facc15" : "#22d3ee"
        const r = gm.v >= 3 ? 6 : 4
        ctx.fillRect(-r / 2, -r / 2, r, r)
        ctx.restore()
      }
      // 道具
      for (const pk of s.picks) {
        const bob = Math.sin(s.t * 5 + pk.x) * 3
        emo(ctx, pk.kind === "heart" ? "❤️" : pk.kind === "bomb" ? "💣" : "🎁", X(pk.x), Y(pk.y) + bob, 20)
      }
      // 闪电
      for (const z of s.zaps) {
        ctx.strokeStyle = `rgba(253,224,71,${Math.min(1, z.t * 6)})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        const seg = 4
        ctx.moveTo(X(z.x1), Y(z.y1))
        for (let i = 1; i < seg; i++) {
          const f = i / seg
          ctx.lineTo(X(z.x1 + (z.x2 - z.x1) * f + (Math.random() - 0.5) * 22), Y(z.y1 + (z.y2 - z.y1) * f + (Math.random() - 0.5) * 22))
        }
        ctx.lineTo(X(z.x2), Y(z.y2))
        ctx.stroke()
      }
      // 敌人（emoji 贴图）
      for (const e of s.enemies) {
        const x = X(e.x), y = Y(e.y)
        if (x < -80 || y < -80 || x > w + 80 || y > h + 80) continue
        if (e.elite) {
          ctx.strokeStyle = e.boss ? "rgba(248,113,113,0.7)" : "rgba(250,204,21,0.6)"
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(x, y, e.r + 5, 0, 7); ctx.stroke()
        }
        const size = e.boss ? 62 : e.type === 2 ? 34 : e.type === 1 ? 20 : e.type === 4 ? 22 : 26
        const icon = e.boss ? "🐲" : e.type === 1 ? "🦇" : e.type === 2 ? "👹" : e.type === 3 ? "🧙" : e.type === 4 ? "💣" : "🧟"
        emo(ctx, icon, x, y, e.elite && !e.boss ? size + 8 : size)
        if (e.flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${e.flash * 6})`
          ctx.beginPath(); ctx.arc(x, y, e.r, 0, 7); ctx.fill()
        }
        if (e.elite && !e.boss) {
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 24, y - e.r - 12, 48, 5)
          ctx.fillStyle = "#f87171"; ctx.fillRect(x - 24, y - e.r - 12, 48 * Math.max(0, e.hp / e.maxHp), 5)
        }
      }
      // 敌方弹体
      for (const b of s.ebullets) {
        ctx.fillStyle = "#f87171"
        ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), 5, 0, 7); ctx.fill()
      }
      // 我方弹体
      for (const pr of s.projs) {
        const x = X(pr.x), y = Y(pr.y)
        if (pr.kind === 0) {
          ctx.fillStyle = "#60a5fa"
          ctx.beginPath(); ctx.arc(x, y, pr.r, 0, 7); ctx.fill()
        } else if (pr.kind === 1) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(pr.spin)
          emo(ctx, "🔪", 0, 0, 16)
          ctx.restore()
        } else {
          ctx.save(); ctx.translate(x, y); ctx.rotate(pr.spin)
          emo(ctx, "🪓", 0, 0, 24)
          ctx.restore()
        }
      }
      // 圣典环绕刃
      if (s.weapons.bible) {
        const lv = s.weapons.bible, R = 70 + lv * 8
        for (let i = 0; i < lv + 1; i++) {
          const a = s.orbAngle + (i * Math.PI * 2) / (lv + 1)
          emo(ctx, "📖", X(p.x + Math.cos(a) * R), Y(p.y + Math.sin(a) * R), 20)
        }
      }
      // 玩家
      const px = X(p.x), py = Y(p.y)
      if (p.hurt > 0) { ctx.strokeStyle = `rgba(248,113,113,${p.hurt})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 18, 0, 7); ctx.stroke() }
      emo(ctx, "🥷", px, py, 28, p.faceX < 0)
      // 粒子
      for (const pt of s.parts) {
        ctx.globalAlpha = pt.life / pt.max
        ctx.fillStyle = pt.color
        ctx.beginPath(); ctx.arc(X(pt.x), Y(pt.y), pt.r, 0, 7); ctx.fill()
      }
      ctx.globalAlpha = 1
      // 浮字（伤害数字等）
      ctx.font = "bold 13px system-ui"
      ctx.textAlign = "center"
      for (const tx of s.texts) {
        ctx.globalAlpha = Math.min(1, tx.t)
        ctx.fillStyle = tx.color
        ctx.fillText(tx.text, X(tx.x), Y(tx.y))
      }
      ctx.globalAlpha = 1
      // Boss 血条
      const boss = s.enemies.find(e => e.boss)
      if (boss) {
        const bw = w * 0.6
        ctx.fillStyle = "rgba(0,0,0,0.55)"
        ctx.fillRect((w - bw) / 2, 34, bw, 10)
        ctx.fillStyle = "#dc2626"
        ctx.fillRect((w - bw) / 2, 34, bw * Math.max(0, boss.hp / boss.maxHp), 10)
        ctx.font = "bold 12px system-ui"
        ctx.fillStyle = "#fca5a5"
        ctx.textAlign = "center"
        ctx.fillText("🐲 魔王", w / 2, 28)
      }
    }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (s && phaseRef.current === "play") {
        const j = joyRef.current
        let dx = j.active ? j.dx : 0, dy = j.active ? j.dy : 0
        if (!j.active) {
          const k = keysRef.current
          dx = ((k.has("d") || k.has("arrowright")) ? 1 : 0) - ((k.has("a") || k.has("arrowleft")) ? 1 : 0)
          dy = ((k.has("s") || k.has("arrowdown")) ? 1 : 0) - ((k.has("w") || k.has("arrowup")) ? 1 : 0)
        }
        update(s, dt, dx, dy)
        if (s.pending > 0) {
          s.pending--
          setChoices(rollChoices(s))
          setPhase("levelup")
        } else if ((s.over || s.win) && !endRef.current) {
          endRef.current = true
          const gain = Math.floor(s.kills * 0.5 + s.t + (s.win ? 100 : 0))
          setEarned(gain)
          setMeta(m => {
            const next = { ...m, gold: m.gold + gain }
            localStorage.setItem("c_vs-meta", JSON.stringify(next))
            return next
          })
          setBest(b => {
            const nb = Math.max(b, Math.floor(s.t))
            localStorage.setItem("c_vs-best", String(nb))
            return nb
          })
          setPhase(s.win ? "win" : "over")
        }
        acc += dt
        if (acc > 0.12) {
          acc = 0
          setHud({
            t: s.t, kills: s.kills, level: s.player.level, hp: Math.max(0, Math.round(s.player.hp)),
            maxHp: s.player.maxHp, xp: s.player.xp, xpNext: s.player.xpNext,
            weapons: Object.entries(s.weapons).map(([id, lv]) => ({ icon: WEAPON_DEFS[id]?.icon ?? "❓", lv })),
          })
        }
      }
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={wrapRef} className="relative h-[calc(100vh-6.5rem)] overflow-hidden rounded-2xl border border-zinc-300/60 bg-[#0b0e1a] select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* HUD */}
      {phase !== "menu" && (
        <>
          <div className="absolute top-0 left-0 right-0 h-2 bg-black/40">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.min(100, (hud.xp / hud.xpNext) * 100)}%` }} />
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-2 text-xs text-white/90">
            <span className="rounded-md bg-black/45 px-2 py-1">Lv {hud.level}</span>
            <span className="rounded-md bg-black/45 px-2 py-1">❤️ {hud.hp}/{hud.maxHp}</span>
          </div>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/45 px-3 py-1 font-mono text-sm text-white/90">{fmt(hud.t)}</div>
          <div className="absolute top-3 right-3 flex items-center gap-2 text-xs text-white/90">
            <span className="rounded-md bg-black/45 px-2 py-1">💀 {hud.kills}</span>
            <button onClick={togglePause} className="rounded-md bg-black/45 px-2.5 py-1 hover:bg-black/70">{phase === "pause" ? "▶" : "⏸"}</button>
          </div>
          <div className="absolute bottom-2 left-3 flex gap-1.5">
            {hud.weapons.map((wp, i) => (
              <span key={i} className="rounded-md bg-black/45 px-1.5 py-0.5 text-xs text-white/90">{wp.icon}<span className="ml-0.5 text-amber-300">Lv{wp.lv}</span></span>
            ))}
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/30 px-2 py-0.5 text-[10px] text-white/40">WASD/方向键移动 · 自动攻击 · P 暂停 · 5 分钟魔王降临</div>
        </>
      )}

      {/* 虚拟摇杆 */}
      <div ref={baseRef} className="pointer-events-none absolute hidden h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25 bg-white/5" />
      <div ref={knobRef} className="pointer-events-none absolute hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />

      {/* 开始菜单 + 强化商店 */}
      {phase === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="text-4xl">🧛</div>
          <h1 className="text-2xl font-bold text-white">吸血鬼幸存者 · lite</h1>
          <p className="max-w-md text-center text-sm text-white/60">在敌潮中活下去，5 分钟后击败魔王获胜。拾取 🎁❤️💣 道具 · 升级三选一 · 金币永久强化</p>
          <div className="flex items-center gap-2 rounded-xl bg-amber-400/15 px-4 py-1.5 text-sm text-amber-300">🪙 金币 {meta.gold}</div>
          <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4">
            {SHOP.map(sh => {
              const lv = meta.upg[sh.id]
              const cost = (lv + 1) * 40
              return (
                <div key={sh.id} className="w-36 rounded-xl border border-white/15 bg-white/10 p-2.5 text-center">
                  <div className="text-lg">{sh.icon}</div>
                  <div className="text-xs font-semibold text-white">{sh.name} <span className="text-amber-300">Lv{lv}</span></div>
                  <div className="mt-0.5 text-[10px] text-white/50">{sh.desc}</div>
                  <button onClick={() => buy(sh.id)} disabled={lv >= 5 || meta.gold < cost}
                    className="mt-1.5 w-full rounded-md bg-indigo-600 py-1 text-[11px] text-white enabled:hover:brightness-110 disabled:opacity-35">
                    {lv >= 5 ? "已满级" : `升级 🪙${cost}`}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="text-xs text-white/50">WASD / 方向键移动（手机：触屏摇杆）· P 或 Esc 暂停</div>
          {best > 0 && <div className="text-xs text-amber-300/90">🏆 最佳纪录 {fmt(best)}</div>}
          <button onClick={start} className="rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-8 py-3 text-white shadow-lg shadow-indigo-900/40 hover:brightness-110">开始游戏</button>
        </div>
      )}

      {/* 升级三选一 */}
      {phase === "levelup" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 backdrop-blur-sm">
          <div className="text-xl font-bold text-amber-300">⬆ 升级！选择一项强化</div>
          <div className="flex flex-wrap items-stretch justify-center gap-3 px-4">
            {choices.map((c, i) => (
              <button key={i} onClick={() => pick(c)}
                className="w-44 rounded-2xl border border-white/15 bg-white/10 p-4 text-left transition hover:border-amber-300/60 hover:bg-white/20">
                <div className="text-2xl">{c.icon}</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                  {c.title}
                  {c.isNew && <span className="rounded bg-amber-400/90 px-1 text-[10px] font-bold text-black">NEW</span>}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-white/60">{c.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 暂停 */}
      {phase === "pause" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">⏸ 已暂停</div>
          <div className="flex gap-3">
            <button onClick={togglePause} className="rounded-xl bg-indigo-600 px-6 py-2.5 text-white hover:brightness-110">继续</button>
            <button onClick={start} className="rounded-xl bg-white/15 px-6 py-2.5 text-white hover:bg-white/25">重新开始</button>
          </div>
        </div>
      )}

      {/* 结算 */}
      {(phase === "over" || phase === "win") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <div className="text-4xl">{phase === "win" ? "🏆" : "💀"}</div>
          <div className="text-2xl font-bold text-white">{phase === "win" ? "胜利！魔王已被击败" : "你倒下了"}</div>
          <div className="flex gap-6 text-center text-sm text-white/80">
            <div><div className="text-lg font-bold text-amber-300">{fmt(hud.t)}</div>存活时间</div>
            <div><div className="text-lg font-bold text-fuchsia-300">{hud.kills}</div>击杀</div>
            <div><div className="text-lg font-bold text-cyan-300">Lv {hud.level}</div>等级</div>
          </div>
          <div className="text-sm text-amber-300">+🪙 {earned} 金币（当前 {meta.gold}）</div>
          <div className="text-xs text-white/50">🏆 最佳纪录 {fmt(best)}</div>
          <button onClick={start} className="rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-8 py-2.5 text-white hover:brightness-110">再来一局</button>
        </div>
      )}
    </div>
  )
}
