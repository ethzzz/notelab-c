"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  mapRows, reachableIds, NODE_META,
  type RunState, type NodeType,
} from "@/lib/spire-engine"

// 桌面基准尺寸；小屏（≤640px）走 compact 覆盖：收窄标签列/节点/行高并隐藏节点文字标签，
// 保证 6 列节点在窄屏不溢出列宽、不被容器裁切（语义由下方图例 + title 兜底）
const MAX_W = 940

// 确定性伪随机（同 id 恒同值）：节点散列抖动用，避免重渲染时位置跳动。
// 收尾用 murmur3 fmix32 雪崩混淆：节点 id 仅末位不同（r2c0/r2c1）也能散开，
// 不加收尾时行内抖动会被压缩约 2000 倍趋近于 0
function hash01(s: string, seed: number): number {
  let h = (seed >>> 0) || 1
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h % 10000) / 10000
}

// 杀戮尖塔风格：暗黑奇幻徽章 + 具象图标 + 衬线装饰字体
const TYPE_STYLE: Record<NodeType, {
  border: string; glow: string; icon: string; grad: string; text: string;
}> = {
  enemy: { border: "#ef4444", glow: "rgba(239,68,68,.65)", icon: "#fecaca", grad: "radial-gradient(circle at 32% 26%, rgba(140,30,34,.96), rgba(46,8,12,.98))", text: "#fecaca" },
  elite: { border: "#f59e0b", glow: "rgba(245,158,11,.75)", icon: "#fde68a", grad: "radial-gradient(circle at 32% 26%, rgba(140,74,12,.96), rgba(54,24,6,.98))", text: "#fde68a" },
  rest:  { border: "#fb923c", glow: "rgba(251,146,60,.7)", icon: "#fed7aa", grad: "radial-gradient(circle at 32% 26%, rgba(150,58,18,.96), rgba(48,18,9,.98))", text: "#fed7aa" },
  shop:  { border: "#2dd4bf", glow: "rgba(45,212,191,.6)", icon: "#99f6e4", grad: "radial-gradient(circle at 32% 26%, rgba(19,90,84,.96), rgba(6,42,40,.98))", text: "#99f6e4" },
  event: { border: "#a78bfa", glow: "rgba(167,139,250,.6)", icon: "#ddd6fe", grad: "radial-gradient(circle at 32% 26%, rgba(88,34,158,.96), rgba(30,14,62,.98))", text: "#ddd6fe" },
  boss:  { border: "#f43f5e", glow: "rgba(244,63,94,.85)", icon: "#fecdd3", grad: "radial-gradient(circle at 32% 26%, rgba(146,21,60,.96), rgba(52,6,22,.98))", text: "#fecdd3" },
}

// 具象 SVG 图标（替代 emoji），fill=currentColor
const SWORD = (
  <>
    <path d="M12 2.5 13.4 4 12.6 13 11.4 13 10.6 4 Z" />
    <rect x="8.6" y="12.6" width="6.8" height="1.8" rx="0.6" />
    <rect x="11.3" y="14.4" width="1.4" height="5" rx="0.5" />
    <circle cx="12" cy="20.3" r="1.3" />
  </>
)
const GLYPHS: Record<NodeType, ReactNode> = {
  enemy: <>{SWORD}</>,
  elite: (
    <>
      <g transform="rotate(22 12 12)">{SWORD}</g>
      <g transform="rotate(-22 12 12)">{SWORD}</g>
    </>
  ),
  rest: (
    <>
      <path d="M12 3.5 C 9 8 14.5 9 12 14 C 13.6 11.4 10.4 11 11.5 7.8 C 12.6 10 13.6 10 12 3.5 Z" />
      <rect x="8.4" y="16.6" width="7.2" height="2.1" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  shop: (
    <>
      <path d="M7.6 8.6 h8.8 l1.2 11 h-11.2 Z" />
      <path d="M9.6 8.6 c0-2 1.2-3.3 2.4-3.3s2.4 1.3 2.4 3.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  event: (
    <text x="12" y="17.5" textAnchor="middle" fontSize="17" fontWeight="700"
      fontFamily="Georgia,'Times New Roman',serif" fill="currentColor">?</text>
  ),
  boss: (
    <>
      <path d="M12 3.4a5.9 5.9 0 0 1 5.9 5.9c0 2.5-1.4 3.8-2.1 5.3H8.2c-.7-1.5-2.1-2.8-2.1-5.3A5.9 5.9 0 0 1 12 3.4Z" />
      <circle cx="9.6" cy="10.4" r="1.75" fill="rgba(0,0,0,.55)" />
      <circle cx="14.4" cy="10.4" r="1.75" fill="rgba(0,0,0,.55)" />
      <path d="M11 13.6 h2 l-1 2.3 Z" fill="rgba(0,0,0,.55)" />
    </>
  ),
}

export default function SpireMap({ s, onEnter }: { s: RunState; onEnter: (id: string) => void }) {
  const rows = mapRows(s)
  const reach = new Set(reachableIds(s))
  const visited = new Set(s.visited)
  const pos = s.pos
  const totalRows = rows.length
  const allNodes = rows.flat()

  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)")
    const on = () => setCompact(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  const ROW_H = compact ? 84 : 116
  const PAD_TOP = compact ? 36 : 64
  const PAD_BOTTOM = compact ? 52 : 92
  const LABEL_COL_W = compact ? 36 : 104
  // 图面高需容纳全部行：PAD_TOP + 每行 ROW_H + PAD_BOTTOM，
  // 少算一行会导致末行（BOSS）被容器 overflow-hidden 裁切
  const containerHeight = PAD_TOP + totalRows * ROW_H + PAD_BOTTOM

  // 尖塔式散列：同行节点按个数均摊全宽 + 确定性横/纵抖动（打破等距矩阵感）；
  // 单节点行（起点/BOSS）居中不抖动；抖动幅度限制在单元格内，防相邻重叠与容器溢出
  const layout = new Map<string, { xPct: number; top: number }>()
  rows.forEach((row, r) => {
    row.forEach((n, i) => {
      const spread = row.length > 1
      const jx = spread ? (hash01(n.id, 7) - 0.5) * 0.32 : 0
      const jy = spread ? (hash01(n.id, 13) - 0.5) * 2 * (compact ? 6 : 14) : 0
      layout.set(n.id, {
        xPct: ((i + 0.5 + jx) / row.length) * 100,
        top: PAD_TOP + r * ROW_H + ROW_H / 2 + jy,
      })
    })
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const circleRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const [edges, setEdges] = useState<
    { x1: number; y1: number; x2: number; y2: number; state: "base" | "trail" | "active" }[]
  >([])

  useEffect(() => {
    const calc = () => {
      const container = containerRef.current
      if (!container) return
      const cr = container.getBoundingClientRect()
      const out: typeof edges = []
      for (const n of allNodes) {
        const a = circleRefs.current[n.id]
        if (!a) continue
        for (const tid of n.next) {
          const b = circleRefs.current[tid]
          if (!a || !b) continue
          const ar = a.getBoundingClientRect()
          const br = b.getBoundingClientRect()
          const x1 = ar.left + ar.width / 2 - cr.left
          const y1 = ar.top + ar.height / 2 - cr.top
          const x2 = br.left + br.width / 2 - cr.left
          const y2 = br.top + br.height / 2 - cr.top
          let state: "base" | "trail" | "active" = "base"
          if (visited.has(n.id) && visited.has(tid)) state = "trail"
          else if (pos === n.id && reach.has(tid)) state = "active"
          out.push({ x1, y1, x2, y2, state })
        }
      }
      setEdges(out)
    }
    calc()
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, totalRows, pos, compact, [...visited], [...reach]])

  // 小屏地图需滚动：进入/推进时把当前节点滚到视区中央
  useEffect(() => {
    if (!pos) return
    circleRefs.current[pos]?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [pos, compact])

  const boardStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: containerHeight,
  }

  return (
    <>
      <div
        ref={containerRef}
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10"
        style={{
          maxWidth: MAX_W,
          background:
            "radial-gradient(ellipse at 50% 22%, rgba(48,26,74,.6), rgba(8,5,13,.97))",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Serif+SC:wght@600;700&display=swap');
          .spire-serif { font-family: 'Cinzel','Noto Serif SC','Songti SC','STSong',serif; }
          @keyframes spire-dash { to { stroke-dashoffset: -16; } }
          @keyframes spire-node-in {
            0%   { opacity:0; transform: scale(.5); }
            100% { opacity:1; transform: scale(1); }
          }
          @keyframes spire-boss-pulse {
            0%, 100% { box-shadow: 0 0 20px rgba(244,63,94,.55), 0 0 42px rgba(244,63,94,.30); }
            50%      { box-shadow: 0 0 30px rgba(244,63,94,.85), 0 0 68px rgba(244,63,94,.50); }
          }
          @keyframes spire-cur-pulse {
            0%, 100% { box-shadow: 0 0 0 3px rgba(251,191,36,.6), 0 0 22px rgba(251,191,36,.6); }
            50%      { box-shadow: 0 0 0 7px rgba(251,191,36,.25), 0 0 38px rgba(251,191,36,.9); }
          }
        `}</style>

        {/* 暗角 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 150px 26px rgba(0,0,0,.72)", borderRadius: "1rem" }}
        />

        {/* 连线层 */}
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height={containerHeight}
          style={{ overflow: "visible", zIndex: 0 }}
        >
          <defs>
            <linearGradient id="trailGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(251,191,36,0.6)" />
              <stop offset="100%" stopColor="rgba(244,63,94,0.5)" />
            </linearGradient>
            <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(52,211,153,0.95)" />
              <stop offset="100%" stopColor="rgba(45,212,191,0.85)" />
            </linearGradient>
          </defs>
          {edges.map((e, i) => {
            const dy = e.y2 - e.y1
            const d = `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + dy * 0.5}, ${e.x2} ${e.y2 - dy * 0.5}, ${e.x2} ${e.y2}`
            return (
              <path
                key={i}
                d={d}
                vectorEffect="non-scaling-stroke"
                fill="none"
                stroke={
                  e.state === "active" ? "url(#activeGrad)"
                  : e.state === "trail" ? "url(#trailGrad)"
                  : "rgba(255,255,255,0.10)"
                }
                strokeWidth={e.state === "active" ? 2.8 : e.state === "trail" ? 2.0 : 1.5}
                strokeDasharray={e.state === "active" ? "6 5" : undefined}
                style={e.state === "active" ? { animation: "spire-dash 1s linear infinite" } : undefined}
              />
            )
          })}
        </svg>

        {/* 主图面：绝对定位散列布局（左侧层标签 + 节点区按行均摊加抖动） */}
        <div style={boardStyle}>
          {rows.map((row, r) => (
            <div
              key={`fl${r}`}
              className="absolute flex items-center justify-end"
              style={{ left: 0, width: LABEL_COL_W, top: PAD_TOP + r * ROW_H, height: ROW_H, paddingRight: compact ? 6 : 16 }}
            >
              <span className={`spire-serif whitespace-nowrap rounded-md border border-amber-700/60 bg-gradient-to-b from-amber-900/70 to-amber-950/80 font-bold tracking-wider text-amber-200 ${compact ? "px-1.5 py-0.5 text-[11px]" : "px-3 py-1.5 text-[14px]"}`}>
                {compact ? r + 1 : `第 ${r + 1} 层`}
              </span>
            </div>
          ))}

          <div className="absolute bottom-0 top-0 right-0" style={{ left: LABEL_COL_W }}>
          {allNodes.map((n) => {
            const meta = NODE_META[n.type]
            const isCur = pos === n.id
            const done = visited.has(n.id) && !isCur
            const can = reach.has(n.id)
            const isBoss = n.type === "boss"
            const ts = TYPE_STYLE[n.type]
            const size = isBoss ? (compact ? 60 : 96) : (compact ? 42 : 64)
            // 入场缩放动画（transform/opacity）挂 button；脉冲光圈（box-shadow）必须挂圆形 span，
            // 否则 0 模糊 + spread 的光圈会跟 button 直角渲染成正方形（当前节点/BOSS 方框残影根因）
            const pulseAnim = isCur
              ? "spire-cur-pulse 1.8s ease-in-out infinite"
              : isBoss ? "spire-boss-pulse 2.6s ease-in-out infinite" : undefined
            const stateCls = isCur
              ? ""
              : can
              ? "transition-transform hover:scale-110 cursor-pointer"
              : done
              ? "opacity-55 grayscale"
              : "opacity-45 grayscale"
            // 静态阴影（当前节点交给脉冲动画，不在此覆盖）
            const shadow = isCur
              ? undefined
              : can
              ? `0 0 18px ${ts.glow}, inset 0 2px 7px rgba(0,0,0,.6)`
              : `inset 0 2px 7px rgba(0,0,0,.6)`
            return (
              <div
                key={n.id}
                className="absolute"
                style={{
                  left: `${layout.get(n.id)!.xPct}%`,
                  top: layout.get(n.id)!.top,
                  transform: "translate(-50%, -50%)",
                  zIndex: isBoss ? 10 : undefined,
                }}
              >
              <button
                disabled={!can}
                onClick={() => onEnter(n.id)}
                title={`第 ${n.row + 1} 层 · ${meta.name}`}
                style={{ animation: "spire-node-in .4s ease both" }}
                className={`flex flex-col items-center gap-2 outline-none ${stateCls}`}
              >
                <span
                  ref={(el) => { circleRefs.current[n.id] = el }}
                  className={`flex items-center justify-center rounded-full border-[3px] backdrop-blur-[1px] ${isBoss ? "border-[4px]" : ""}`}
                  style={{
                    width: size, height: size,
                    background: ts.grad,
                    borderColor: isCur ? "#fbbf24" : ts.border,
                    color: ts.icon,
                    boxShadow: shadow,
                    animation: pulseAnim,
                    filter: done || (!can && !isCur) ? "grayscale(.55) brightness(.85)" : undefined,
                  }}
                >
                  <svg viewBox="0 0 24 24" className="h-[56%] w-[56%]" fill="currentColor"
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.65))" }}>
                    {GLYPHS[n.type]}
                  </svg>
                </span>
                {!compact && (
                  <span
                    className="spire-serif whitespace-nowrap rounded-md px-2.5 py-1 text-[14px] font-bold leading-none"
                    style={{ background: "rgba(10,6,16,.72)", color: isCur ? "#fde68a" : ts.text }}
                  >
                    {meta.name}{done ? " ✓" : ""}
                  </span>
                )}
              </button>
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="spire-serif mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-zinc-200">
        {(["enemy", "elite", "rest", "shop", "event", "boss"] as NodeType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className="flex items-center justify-center rounded-full border-2"
              style={{
                width: 22, height: 22,
                background: TYPE_STYLE[t].grad,
                borderColor: TYPE_STYLE[t].border,
                color: TYPE_STYLE[t].icon,
              }}
            >
              <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor">{GLYPHS[t]}</svg>
            </span>
            {NODE_META[t].name}
          </span>
        ))}
      </div>
    </>
  )
}
