"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  mapRows, reachableIds, NODE_META,
  type RunState, type NodeType,
} from "@/lib/spire-engine"

// 桌面基准尺寸；小屏（≤640px）走 compact 覆盖：收窄行号列/节点/行高并隐藏行号，
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

// ---------------- 视觉基调：克制哑光 ----------------
// 近黑中性底（纵向微渐变），无霓虹；唯一强调色（当前节点/可达连线）为柔金
const BG_TOP = "#15161c"
const BG_BOTTOM = "#0d0e12"
const ACCENT = "#d8b878"          // 当前节点亮环 / 可达连线（单一强调色，不做多色渐变）
const TRAIL = "rgba(200,170,110,.55)" // 已走过路径：中性暖色
const BASE_EDGE = "rgba(255,255,255,.12)" // 普通/未来路径：低透明安静细线
const DISC_BG = "#1b1d24"         // 节点圆盘统一深底（取消径向渐变实心填充）

// 类型配色：低饱和哑光。stroke=图标/描边提亮色，border=圆盘细描边色
const TYPE_STYLE: Record<NodeType, { stroke: string; border: string }> = {
  enemy: { stroke: "#8b93a7", border: "#3a4152" },
  elite: { stroke: "#c9a24b", border: "#5a4a24" },
  rest:  { stroke: "#6f9c6a", border: "#3a4f38" },
  shop:  { stroke: "#b98a4e", border: "#4f3d26" },
  event: { stroke: "#9a8fc0", border: "#454060" },
  boss:  { stroke: "#c05a63", border: "#5a2730" },
}

// ---------------- 线性描边图标（自绘 path，fill=none / stroke=currentColor / round cap） ----------------
const GLYPHS: Record<NodeType, ReactNode> = {
  // 剑：刃+护手+柄+圆头
  enemy: (
    <>
      <path d="M12 3.2 13.7 4.9 12.9 13.4 11.1 13.4 10.3 4.9 Z" />
      <path d="M8.7 13.4 h6.6" />
      <path d="M12 13.4 v5.4" />
      <circle cx="12" cy="20.2" r="1.15" />
    </>
  ),
  // 双剑交叉
  elite: (
    <>
      <g transform="rotate(24 12 12)">
        <path d="M12 3.6 13.4 5 12.7 12.6 11.3 12.6 10.6 5 Z" />
        <path d="M9.5 12.6 h5" />
        <path d="M12 12.6 v4.6" />
        <circle cx="12" cy="18.4" r="1" />
      </g>
      <g transform="rotate(-24 12 12)">
        <path d="M12 3.6 13.4 5 12.7 12.6 11.3 12.6 10.6 5 Z" />
        <path d="M9.5 12.6 h5" />
        <path d="M12 12.6 v4.6" />
        <circle cx="12" cy="18.4" r="1" />
      </g>
    </>
  ),
  // 篝火：外焰+内焰+柴木
  rest: (
    <>
      <path d="M12 3.6 C 9.4 7.4 14.2 8.6 12 12.8 C 13.4 10.6 10.6 10.2 11.6 7.4 C 12.5 9.2 13.4 9.2 12 3.6 Z" />
      <path d="M7.4 16.4 16.6 19.4" />
      <path d="M16.6 16.4 7.4 19.4" />
    </>
  ),
  // 钱袋：袋身+束口+系带
  shop: (
    <>
      <path d="M9.6 8.2 C 6.9 10 5.9 12.6 6.4 15 C 6.9 17.6 9.2 19.2 12 19.2 C 14.8 19.2 17.1 17.6 17.6 15 C 18.1 12.6 17.1 10 14.4 8.2 Z" />
      <path d="M9.6 8.2 h4.8" />
      <path d="M10.4 8.2 C 10.4 6.2 11.1 5 12 5 C 12.9 5 13.6 6.2 13.6 8.2" />
    </>
  ),
  // 问号：弧钩+竖+点
  event: (
    <>
      <path d="M9.3 9.1 C 9.3 7.4 10.5 6.2 12 6.2 C 13.5 6.2 14.7 7.4 14.7 8.9 C 14.7 10.9 12 11.2 12 13.5" />
      <path d="M12 16.9 v.2" />
    </>
  ),
  // 王冠：三尖冠体+底带+尖顶圆珠
  boss: (
    <>
      <path d="M5.6 16.6 4.6 8.6 8.6 11.4 12 6.4 15.4 11.4 19.4 8.6 18.4 16.6 Z" />
      <path d="M6.4 19.2 h11.2" />
      <circle cx="4.6" cy="7.2" r=".9" />
      <circle cx="12" cy="4.9" r=".9" />
      <circle cx="19.4" cy="7.2" r=".9" />
    </>
  ),
}

function Glyph({ type, className }: { type: NodeType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[type]}
    </svg>
  )
}

// 行号罗马数字（仅节奏提示，不抢视觉）
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

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
  const LABEL_COL_W = compact ? 26 : 56
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

  const boardStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: containerHeight,
  }

  return (
    <>
      <div
        ref={containerRef}
        className="spire-map relative mx-auto w-full overflow-hidden rounded-2xl border border-white/[.07]"
        style={{
          maxWidth: MAX_W,
          // 近黑中性底：极淡纵向渐变，不发光
          background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
        }}
      >
        <style>{`
          /* 极低透明度网点纹理：增加质感但不发光 */
          .spire-map::before {
            content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
            background-image: radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px);
            background-size: 22px 22px;
          }
          @keyframes spire-dash { to { stroke-dashoffset: -28; } }
          /* 入场：短促淡入 + 轻微上移（≤.3s），无持续动画 */
          @keyframes spire-node-in {
            0%   { opacity: 0; transform: translateY(7px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          /* 可达节点：hover 轻放大 + 描边提亮（transition 在节点 span 上） */
          .spire-map button.spire-node:enabled:hover > span.spire-disc,
          .spire-map button.spire-node:enabled:focus-visible > span.spire-disc {
            transform: scale(1.06);
            border-color: var(--spire-hi);
            filter: brightness(1.12);
          }
        `}</style>

        {/* 中心 vignette：极轻内阴影收边 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 110px 10px rgba(0,0,0,.42)", borderRadius: "1rem" }}
        />

        {/* 连线层 */}
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height={containerHeight}
          style={{ overflow: "visible", zIndex: 0 }}
        >
          {edges.map((e, i) => {
            const dy = e.y2 - e.y1
            const d = `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + dy * 0.5}, ${e.x2} ${e.y2 - dy * 0.5}, ${e.x2} ${e.y2}`
            const active = e.state === "active"
            const trail = e.state === "trail"
            return (
              <path
                key={i}
                d={d}
                vectorEffect="non-scaling-stroke"
                fill="none"
                stroke={active ? ACCENT : trail ? TRAIL : BASE_EDGE}
                strokeOpacity={active ? 0.75 : trail ? 1 : 1}
                strokeWidth={active ? 2.6 : trail ? 2.5 : 2}
                strokeLinecap="round"
                strokeDasharray={active ? "7 7" : undefined}
                style={active ? { animation: "spire-dash 1.6s linear infinite" } : undefined}
              />
            )
          })}
        </svg>

        {/* 主图面：绝对定位散列布局（左侧行号 + 节点区按行均摊加抖动） */}
        <div style={boardStyle}>
          {rows.map((row, r) => (
            <div
              key={`fl${r}`}
              className="absolute flex items-center justify-end"
              style={{ left: 0, width: LABEL_COL_W, top: PAD_TOP + r * ROW_H, height: ROW_H, paddingRight: compact ? 4 : 12 }}
            >
              <span
                className="whitespace-nowrap font-medium tabular-nums tracking-[.18em]"
                style={{ color: "rgba(255,255,255,.18)", fontSize: compact ? 9 : 11 }}
              >
                {compact ? r + 1 : (ROMAN[r] ?? r + 1)}
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
            // 状态可读性：可达=正常亮度可点；已走过=降透明+去饱和；未来不可达=更淡且禁用
            const stateCls = isCur
              ? ""
              : can
              ? "cursor-pointer"
              : done
              ? "opacity-40 grayscale-[.4]"
              : "opacity-50"
            // 圆盘：统一深底 + 细描边 + 内阴影微立体；常态无外发光。
            // 当前节点=细亮环+极克制柔光（全场唯一焦点）；BOSS=更粗描边环，无脉冲。
            const discShadow = isCur
              ? `0 0 0 1.5px ${ACCENT}, 0 0 16px rgba(216,184,120,.22), inset 0 1px 2px rgba(0,0,0,.5)`
              : `inset 0 1px 2px rgba(0,0,0,.5)`
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
                style={{ animation: "spire-node-in .28s ease" } as CSSProperties}
                className={`spire-node flex flex-col items-center outline-none ${stateCls}`}
              >
                {/* 光圈/亮环必须挂在圆形 span 上（挂 button 会把 0 模糊 box-shadow 渲染成方框） */}
                <span
                  ref={(el) => { circleRefs.current[n.id] = el }}
                  className="spire-disc flex items-center justify-center rounded-full"
                  style={{
                    width: size, height: size,
                    background: DISC_BG,
                    border: `${isBoss ? 2.5 : 1.5}px solid ${isCur ? ACCENT : ts.border}`,
                    color: ts.stroke,
                    boxShadow: discShadow,
                    transition: "transform .16s ease, border-color .16s ease",
                    // hover 提亮色（CSS 变量供 ::hover 规则取用）
                    ["--spire-hi" as string]: ts.stroke,
                  } as CSSProperties}
                >
                  <Glyph type={n.type} className={isBoss ? "h-[58%] w-[58%]" : "h-[55%] w-[55%]"} />
                </span>
              </button>
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* 图例：一行细线小图标 + sans 小字，低对比 */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]"
        style={{ color: "rgba(255,255,255,.45)" }}>
        {(["enemy", "elite", "rest", "shop", "event", "boss"] as NodeType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 20, height: 20,
                background: DISC_BG,
                border: `1px solid ${TYPE_STYLE[t].border}`,
                color: TYPE_STYLE[t].stroke,
              }}
            >
              <Glyph type={t} className="h-[62%] w-[62%]" />
            </span>
            {NODE_META[t].name}
          </span>
        ))}
      </div>
    </>
  )
}
