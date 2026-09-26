"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  mapRows, reachableIds, NODE_META, nodeTypeOf,
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

// ---------------- 幕主题：同一套克制哑光，只换强调色与底色倾向 ----------------
// 每幕一种气质（苔石 / 青玉 / 赤顶），保证三幕一眼可辨又不刺眼
interface ActTheme {
  name: string
  accent: string                    // 当前节点亮环 / 可达连线
  trail: string                     // 已走过路径
  bgTop: string
  bgBottom: string
  spine: string                     // 中轴塔身光柱
}
const ACT_THEMES: ActTheme[] = [
  { name: "苔石回廊", accent: "#e2c486", trail: "rgba(214,184,126,.68)", bgTop: "#25272f", bgBottom: "#1b1d24", spine: "rgba(216,184,120,.09)" },
  { name: "青玉回廊", accent: "#91e5cb", trail: "rgba(137,219,194,.66)", bgTop: "#202e2b", bgBottom: "#17221f", spine: "rgba(127,216,192,.09)" },
  { name: "赤色尖顶", accent: "#f09cab", trail: "rgba(230,148,163,.68)", bgTop: "#2a1e25", bgBottom: "#21171d", spine: "rgba(229,138,154,.09)" },
]
const themeOf = (act: number) => ACT_THEMES[Math.min(Math.max(act, 1), ACT_THEMES.length) - 1]
/** 幕名（幕间界面等处引用，保证与地图主题同一真相源） */
export const actThemeName = (act: number) => themeOf(act).name
/** 幕强调色（页顶栏 / 战斗底色点缀用，与地图强调色一致） */
export const actAccent = (act: number) => themeOf(act).accent

// 圆盘底面：径向渐变（上亮下暗）做出球面体积。**只给没有素材包整图的类型用**（现在只有 event）——
// 有整图的类型由画面自带的石质外环 + 烟雾承担底框，不再垫这一层（垫了会变成"球里贴了张画"）。
//
// ⚠️ 硬约束：**最外圈必须比三幕底色亮**。圆盘落在地图纵向渐变的中上段，那里底色最亮
// （bgTop 亮度：幕1 #25272f = 2.05e-2 / 幕2 #202e2b = 2.44e-2 / 幕3 #2a1e25 = 1.55e-2）。
// 外圈一旦比它们暗，圆盘边缘就与背景糊在一起、读作一个凹陷的"洞"。
//
// 来路：2026-09-26 三幕底色整体提亮后，旧外圈 #1e222c（L=1.60e-2）跌破底色，最不利处
// 「外圈/底」= 0.818 / 0.686 / 1.084 —— 前两幕已踩线（对照图 .sync/disc-hole-check.png）。
// 整档上移到下面这组后：1.809 / 1.518 / 2.399，最不利处仍留 ~1.5 倍余量，且中心→外圈
// 8.37e-2 → 3.54e-2 保留球面渐变（不是平涂）。
// **以后再调 ACT_THEMES 的 bgTop/bgBottom，必须回来复算这条：比值 < 1 就是洞。**
const DISC_BG = "radial-gradient(circle at 50% 30%, #4a5262 0%, #3a4150 58%, #2f3542 100%)"
// 中轴光柱的横向羽化遮罩：中段实、两端渐隐。
// 光柱若只有竖向渐变，左右两侧就是硬边，在深底上会显出一整块矩形色差（截图里"背景中间那块色差"）
const SPINE_FADE = "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.28) 26%, rgba(0,0,0,.78) 44%, #000 50%, rgba(0,0,0,.78) 56%, rgba(0,0,0,.28) 74%, transparent 100%)"

// ---------------- 素材包整图（public/spire/art/） ----------------
// **六张整图不能共用一个显示框**：它们的构图差得很远（雾区轮廓宽占画布 0.71~0.98，亮区宽 0.34~0.90），
// 同一个框里画出来，icon-random 会比别的节点大一圈、icon-shop 又显得最小 —— 一眼就看出"尺寸没对齐"。
// 下面的系数是「显示框 ÷ 目标视觉直径」，来路是 .sync/art-bbox.py 的两个度量
// （① 雾区轮廓宽 ② 亮区宽，都按"和普通敌人等大"归一化）分别算一遍再取几何平均，
// 最后用 .sync/rand-ab.png 上眼 A/B 校过一次 —— random 是唯一近乎满画布构图的一张，单独收到 0.91。
// **换素材后要重新量、重新 A/B**，别照抄这张表。
const ART_BOX_K: Record<NodeType, number> = {
  enemy: 1.53, elite: 1.58, rest: 1.51, shop: 1.50, random: 0.91, boss: 1.33,
  event: 1, // 没有整图：直接按目标视觉直径画圆盘
}
// 节点「看得见的圆」直径。口径与换素材前的圆盘对齐（普通 64 / BOSS 96，刚好是老设计的 1.5 倍），
// 盘面的疏密节奏因此不变；行距 ROW_H 116（紧凑 84）也不动 —— 显示框之外只剩柔化的烟雾，行间不会糊成一片
const VIS = { normal: 64, boss: 96, normalCompact: 44, bossCompact: 66 }
// 连线美术（素材包 public/spire/art/link-straight.png，自然比例 165x24 ≈ 6.9:1）。
// 连线是**直弦**渲染：把这张横向小径沿弦长拉伸（preserveAspectRatio="none"）再按弦角旋转。
// 弦长范围约 116~330，对应比例 5.8~16.5 —— 短边略胖、长边偏瘦，都仍在"一条发光小径"的合理区间。
const LINK_ART = "/games/spire/art/link-straight.png"
const LINK_THICK = 20        // 桌面
const LINK_THICK_COMPACT = 15
// 沿弦两端各外扩一点：把整图柔化的端头压到节点整图之下，避免出现"路径断头"
const LINK_ART_PAD = 1.14
// 连线状态只用透明度区分（素材本身是暖色发光小径，再叠色会脏）：
// 未走=安静、已走过=微亮、可选=全亮并在其上再叠一条流动虚线
const LINK_OPACITY = { base: 0.38, trail: 0.62, active: 1 } as const
// 图例徽章「看得见的圆」直径。图例必须跟盘面节点用同一份 NodeArt ——
// 换成矢量线描会和盘面上的"画"对不上号（比如线描的精英是双剑，盘面上却是带角魔颅）
const LEGEND_VIS = 38

// 类型配色：低饱和哑光。stroke=图标/描边提亮色，border=圆盘细描边色。
// 圆盘底色提亮后，描边/图标同步提一档，否则细描边与图标会被更亮的盘面"吃掉"
const TYPE_STYLE: Record<NodeType, { stroke: string; border: string }> = {
  enemy: { stroke: "#a6aec4", border: "#4d5771" },
  elite: { stroke: "#d8b45c", border: "#7a6430" },
  rest:  { stroke: "#82b47c", border: "#4e6b48" },
  shop:  { stroke: "#cda05f", border: "#6b5433" },
  event: { stroke: "#ab9fd4", border: "#5a5380" },
  boss:  { stroke: "#d4717b", border: "#7a3944" },
  // 未揭示：取素材包 manifest 里 icon.random 的强调色 #C9A6FF
  random: { stroke: "#c9a6ff", border: "#6a5596" },
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
  // 石门 + 问号：仅作兜底（正常情况下 random 走素材包整图 art/icon-random.png，见 NodeArt）
  random: (
    <>
      <path d="M6.4 20.2 V9.4 a5.6 5.6 0 0 1 11.2 0 V20.2" />
      <path d="M6.4 20.2 h11.2" />
      <path d="M12 20.2 v-5.6" />
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

/**
 * 节点形象。size 传的是**看得见的圆**的直径（不是整图画布）：
 *  ① 素材包有整图（NODE_META[type].art）→ 按该类型的 ART_BOX_K 折算出显示框并居中铺满，外沿烟雾自然溢出成柔光晕；
 *  ② 没有整图（现在只有 event）→ 回落到「石质圆盘 + 自绘线描图标」，圆盘直径就是 size，与①视觉上一样大。
 * 整图是 png，用 <img> 直接引用即可（路径已带 basePath /games），别内联、也别放大。
 */
function NodeArt({ type, size, glyphClass }: { type: NodeType; size: number; glyphClass: string }) {
  const art = NODE_META[type].art
  if (art) {
    const box = size * ART_BOX_K[type]
    return (
      <img
        src={art} alt="" aria-hidden="true" draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2"
        // maxWidth:none —— Tailwind preflight 的 img{max-width:100%} 会把溢出的雾边裁回 size
        style={{ width: box, height: box, marginLeft: -box / 2, marginTop: -box / 2, maxWidth: "none" }}
      />
    )
  }
  return (
    <span
      className="pointer-events-none absolute flex items-center justify-center rounded-full"
      style={{
        width: size, height: size,
        background: DISC_BG,
        border: `1px solid ${TYPE_STYLE[type].border}`,
        color: TYPE_STYLE[type].stroke,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.035)",
      }}
    >
      <Glyph type={type} className={glyphClass} />
      {/* 圆盘上缘高光弧：强化球面体积感 */}
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          left: "18%", right: "18%", top: "10%", height: "26%",
          background: "linear-gradient(180deg, rgba(255,255,255,.12), transparent)",
          borderRadius: "999px", filter: "blur(.4px)",
        }}
      />
    </span>
  )
}

/**
 * 自绘线性图标（fallback）：只有 NODE_META[type].art 为空时才用（现在只有 event）。
 * 保留全部类型是刻意的 —— 它就是「素材包没整图时」的统一回落路径，别删成只剩 event。
 */
function Glyph({ type, className }: { type: NodeType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[type]}
    </svg>
  )
}

/** 塔形纹章：地图右上角极淡的幕标识（自绘，无外链素材） */
function SpireEmblem({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color}
      strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.6 21 10.6 8.4 12 3.2 13.4 8.4 14.4 21 Z" />
      <path d="M7.6 21 h8.8" />
      <path d="M10.9 11.6 h2.2 M10.8 14.6 h2.4 M10.7 17.6 h2.6" />
    </svg>
  )
}

// 行号罗马数字（仅节奏提示，不抢视觉）
// 层数已改为每幕 16 层，罗马数字要跟到 XVI；再往上（自定义层数）由 ?? 兜底成阿拉伯数字
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI"]

export default function SpireMap({ s, onEnter }: { s: RunState; onEnter: (id: string) => void }) {
  const rows = mapRows(s)
  const reach = new Set(reachableIds(s))
  const visited = new Set(s.visited)
  const pos = s.pos
  const totalRows = rows.length
  const allNodes = rows.flat()
  const theme = themeOf(s.act)

  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)")
    const on = () => setCompact(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  const ROW_H = compact ? 84 : 116
  // 地图自下而上（第 1 层在最下、BOSS 在最上，与"爬塔"的推进方向一致），
  // 所以原本留给末行 BOSS 的那一侧宽裕留白要跟着翻到顶部：
  // BOSS 圆盘 96px + 外圈虚环 118px 几乎占满一行，顶部余量不足会被容器 overflow-hidden 裁掉
  const PAD_TOP = compact ? 52 : 92
  const PAD_BOTTOM = compact ? 36 : 64
  const LABEL_COL_W = compact ? 26 : 56
  // 图面高需容纳全部行：PAD_TOP + 每行 ROW_H + PAD_BOTTOM，
  // 少算一行会导致首行被容器 overflow-hidden 裁切
  const containerHeight = PAD_TOP + totalRows * ROW_H + PAD_BOTTOM
  /** 行索引 → 该行顶边 y 坐标。自下而上，故 r 越大越靠上（r=0 落在最底部） */
  const rowTop = (r: number) => PAD_TOP + (totalRows - 1 - r) * ROW_H

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
        top: rowTop(r) + ROW_H / 2 + jy,
      })
    })
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const circleRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<
    {
      x1: number; y1: number; x2: number; y2: number
      state: "base" | "trail" | "active"
      len: number   // 整图沿弦的显示长度（含两端外扩）
      ang: number   // 弦角（度），整图按它旋转
    }[]
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
          // 连线用**直弦**而非贝塞尔：整图是横向小径，只有直弦才能整条贴合（曲线得切成多段，
          // 每段都会被压成又短又瘦的一条，观感反而更差）
          const dx = x2 - x1
          const dy = y2 - y1
          out.push({
            x1, y1, x2, y2, state,
            len: Math.hypot(dx, dy) * LINK_ART_PAD,
            ang: (Math.atan2(dy, dx) * 180) / Math.PI,
          })
        }
      }
      setEdges(out)
    }
    calc()
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, totalRows, pos, compact, [...visited], [...reach]])

  // 地图比视口高时需要滚动定位：推进时把当前节点滚到视区中央。
  // 尚未出发（pos=null，含每幕开局）时滚到**底部**——地图自下而上，起点在第 1 行（最下），
  // 不这样处理玩家开屏看到的是塔顶，得自己往下找才能找到可选的第一层
  useEffect(() => {
    if (!pos) {
      bottomRef.current?.scrollIntoView({ block: "end" })
      return
    }
    circleRefs.current[pos]?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [pos, compact])

  const boardStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: containerHeight,
  }

  // BOSS 行此刻在最上（地图自下而上）：分隔线画在它的**下沿**，把"塔顶"从普通层里拎出来（BOSS 行恒为 1 个节点）
  const bossRowBottom = PAD_TOP + ROW_H
  const linkThick = compact ? LINK_THICK_COMPACT : LINK_THICK

  return (
    <>
      <div
        ref={containerRef}
        className="spire-map relative mx-auto w-full overflow-hidden rounded-2xl border border-white/[.07]"
        style={{
          maxWidth: MAX_W,
          // 近黑中性底：极淡纵向渐变，不发光（底色倾向随幕微调）
          background: `linear-gradient(180deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)`,
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
          /* 当前节点：极慢呼吸（3s），幅度很小，只做"我在这"的提示 */
          @keyframes spire-breathe {
            0%,100% { opacity: .28; transform: scale(1); }
            50%     { opacity: .5;  transform: scale(1.1); }
          }
          /* 可达节点：hover 轻放大 + 描边提亮（transition 在节点 span 上） */
          .spire-map button.spire-node:enabled:hover > span.spire-disc,
          .spire-map button.spire-node:enabled:focus-visible > span.spire-disc {
            transform: scale(1.06);
            border-color: var(--spire-hi);
            filter: brightness(1.12);
          }
        `}</style>

        {/* 中轴"塔身"光柱 + 中心 vignette：给画面一个纵深的中心。
            光柱用 mask 做横向羽化（中段实、两端渐隐）——否则宽度 42% 的竖向渐变会在左右留下硬边，
            在近黑底上显出一整块矩形色差 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: containerHeight,
            background: `linear-gradient(180deg, ${theme.spine} 0%, transparent 82%)`,
            WebkitMaskImage: SPINE_FADE,
            maskImage: SPINE_FADE,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: "inset 0 0 110px 10px rgba(0,0,0,.30)", borderRadius: "1rem" }}
        />

        {/* 幕标识（右上角，极淡） */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5">
          <span className="text-[11px] tracking-[.22em]" style={{ color: "rgba(255,255,255,.16)" }}>{theme.name}</span>
          <SpireEmblem className="h-4 w-4" color={theme.accent} />
        </div>

        {/* 行参考线：每行一条极淡横线，帮助眼睛对齐散列节点 */}
        <div className="pointer-events-none absolute inset-0">
          {rows.map((_, r) => (
            <div
              key={`g${r}`}
              className="absolute"
              style={{
                left: compact ? 8 : 24,
                right: compact ? 8 : 24,
                top: rowTop(r) + ROW_H / 2,
                height: 1,
                background: "rgba(255,255,255,.05)",
              }}
            />
          ))}
        </div>

        {/* BOSS 行下沿的分隔线 + 标注：把"塔顶"从普通层里拎出来（线在 BOSS 之下，标注挂在线下方） */}
        <div className="pointer-events-none absolute" style={{ left: compact ? 8 : 24, right: compact ? 8 : 24, top: bossRowBottom }}>
          <div style={{ height: 1, background: "rgba(255,255,255,.06)" }} />
        </div>
        <span
          className="pointer-events-none absolute tracking-[.24em]"
          style={{ right: compact ? 8 : 20, top: bossRowBottom + 4, fontSize: compact ? 9 : 10, color: "rgba(255,255,255,.34)" }}
        >
          TOP
        </span>

        {/* 连线层：底层铺素材包的横向小径整图（沿弦拉伸 + 按弦角旋转），
            状态（未走/已走过/可选）只用透明度区分；可选再叠一条流动虚线做"下一步"提示 */}
        <svg
          className="pointer-events-none absolute inset-0"
          width="100%"
          height={containerHeight}
          style={{ overflow: "visible", zIndex: 0 }}
        >
          {edges.map((e, i) => {
            const mx = (e.x1 + e.x2) / 2
            const my = (e.y1 + e.y2) / 2
            return (
              <image
                key={`l${i}`}
                href={LINK_ART}
                x={mx - e.len / 2}
                y={my - linkThick / 2}
                width={e.len}
                height={linkThick}
                preserveAspectRatio="none"
                opacity={LINK_OPACITY[e.state]}
                transform={`rotate(${e.ang.toFixed(2)} ${mx.toFixed(1)} ${my.toFixed(1)})`}
              />
            )
          })}
          {edges.map((e, i) => {
            if (e.state === "base") return null
            const active = e.state === "active"
            return (
              <path
                key={`s${i}`}
                d={`M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`}
                vectorEffect="non-scaling-stroke"
                fill="none"
                stroke={active ? theme.accent : theme.trail}
                strokeOpacity={active ? 0.78 : 0.5}
                strokeWidth={active ? 2.6 : 1.6}
                strokeLinecap="round"
                strokeDasharray={active ? "7 7" : undefined}
                style={active ? { animation: "spire-dash 1.6s linear infinite" } : undefined}
              />
            )
          })}
        </svg>

        {/* 主图面：绝对定位散列布局（左侧行号 + 节点区按行均摊加抖动）。
            行号跟着行一起翻：第 r 行的标号（I/II/…）始终与 rows[r] 同一条水平线上 */}
        <div style={boardStyle}>
          {rows.map((row, r) => (
            <div
              key={`fl${r}`}
              className="absolute flex items-center justify-end"
              style={{ left: 0, width: LABEL_COL_W, top: rowTop(r), height: ROW_H, paddingRight: compact ? 4 : 12 }}
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
            // 未揭示节点：揭示前按 random 渲染（封印石门），揭示后按真实类型渲染，
            // 图标 / 描边配色 / 悬浮名三者必须一起切，否则会出现"问号图标 + 商店配色"的错位
            const eff = nodeTypeOf(n)
            const meta = NODE_META[eff]
            const isCur = pos === n.id
            const done = visited.has(n.id) && !isCur
            const can = reach.has(n.id)
            const isBoss = n.type === "boss"
            const ts = TYPE_STYLE[eff]
            // 「看得见的圆」直径：与换素材前的圆盘口径一致，盘面疏密节奏不变（BOSS 仍是 1.5 倍）。
            // 行距 ROW_H 116 / 84 都不动 —— 圆之外只剩柔化的烟雾，行间不会糊成一片
            const vis = isBoss
              ? (compact ? VIS.bossCompact : VIS.boss)
              : (compact ? VIS.normalCompact : VIS.normal)
            // 状态可读性：可达=正常亮度可点；已走过=略降透明+去饱和；未来不可达=更淡但仍须看得见。
            // 原先 .4/.5 在近黑底上会把圆盘连同描边一起抹掉（即"关卡与背景重叠"）。
            // 换整图后再提一档（.55/.60 → .66/.70）：整图本身比线描图标暗，压太狠在近黑底上就只剩一团影子
            const stateCls = isCur
              ? ""
              : can
              ? "cursor-pointer"
              : done
              ? "opacity-[0.76] grayscale-[.4]"
              : "opacity-[0.82]"
            // 外层 span 只做两件事：给当前节点挂亮环 + 供连线测中心点（只看中心，与直径无关）。
            // 节点形象（整图 / 圆盘）全部由 NodeArt 画，故这里不再设底与描边
            const discShadow = isCur
              ? `0 0 0 1.5px ${theme.accent}, 0 0 16px ${theme.accent}38`
              : "none"
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
              {/* BOSS 外圈虚环：把塔顶节点和普通节点在体量上拉开 */}
              {isBoss && (
                <span
                  className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: vis + (compact ? 14 : 22), height: vis + (compact ? 14 : 22),
                    marginLeft: -(vis + (compact ? 14 : 22)) / 2, marginTop: -(vis + (compact ? 14 : 22)) / 2,
                    border: `1px dashed ${ts.border}`, opacity: .55,
                  }}
                />
              )}
              {/* 当前节点呼吸环 */}
              {isCur && (
                <span
                  className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: vis + 14, height: vis + 14,
                    marginLeft: -(vis + 14) / 2, marginTop: -(vis + 14) / 2,
                    border: `1px solid ${theme.accent}`,
                    animation: "spire-breathe 3s ease-in-out infinite",
                  }}
                />
              )}
              <button
                disabled={!can}
                onClick={() => onEnter(n.id)}
                title={`第 ${n.row + 1} 层 · ${meta.name}`}
                style={{ animation: "spire-node-in .28s ease" } as CSSProperties}
                className={`spire-node flex flex-col items-center outline-none ${stateCls}`}
              >
                {/* 外层 span 只做两件事：给当前节点挂亮环/柔光 + 供连线测中心点（连线只取中心，与直径无关）。
                    节点形象（整图 / 圆盘）一律交给 NodeArt —— 整图会溢出这个 span，所以这里不能 overflow-hidden */}
                <span
                  ref={(el) => { circleRefs.current[n.id] = el }}
                  className="spire-disc relative flex items-center justify-center rounded-full"
                  style={{
                    width: vis, height: vis,
                    boxShadow: discShadow,
                    transition: "transform .16s ease, border-color .16s ease",
                    // hover 提亮色（CSS 变量供 ::hover 规则取用）；整图没有描边，故只对 hover 的 brightness 生效
                    ["--spire-hi" as string]: ts.stroke,
                  } as CSSProperties}
                >
                  <NodeArt type={eff} size={vis} glyphClass={isBoss ? "h-[58%] w-[58%]" : "h-[55%] w-[55%]"} />
                </span>
              </button>
              </div>
            )
          })}
          </div>
        </div>

        {/* 底部锚点（零高、不可见）：未出发时用它把视口滚到地图底部——起点在第 1 行，也就是最下方 */}
        <div ref={bottomRef} className="pointer-events-none absolute inset-x-0" style={{ bottom: 0, height: 1 }} />
      </div>

      {/* 图例：一行整图小徽章 + sans 小字，低对比。
          徽章必须跟盘面上的节点用同一份 NodeArt（同一套 ART_FILL 归一化）——
          换成矢量线描会和盘面上的"画"对不上号（比如线描的精英是双剑，盘面上却是带角魔颅） */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px]"
        style={{ color: "rgba(255,255,255,.58)" }}>
        {(["enemy", "elite", "rest", "shop", "event", "random", "boss"] as NodeType[]).map((t) => (
          <span key={t} className="flex items-center gap-2">
            {/* 徽章槽位按最长的那张整图留（随机 0.916 这类接近满画布的除外，它们反而更窄） */}
            <span
              className="relative flex shrink-0 items-center justify-center"
              style={{ width: LEGEND_VIS, height: LEGEND_VIS }}
            >
              <NodeArt type={t} size={LEGEND_VIS} glyphClass="h-[62%] w-[62%]" />
            </span>
            {NODE_META[t].name}
          </span>
        ))}
      </div>
    </>
  )
}
