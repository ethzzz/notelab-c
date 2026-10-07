"use client"

// 摸金行动（Loot Raid）· C 端玩法页
//
// 完整进图循环：选图 → 门槛校验 → 扣门票进图 → 逐格搜刮（背包网格 / 风险累积 / 容器保底）
//   → 按住撤离读条 → 成功物品入仓库 / 失败整包丢掉 → 回收换币 → 破产救济
//
// 所有随机走 loot-engine 的确定性 RNG（seed + cursor），同 seed 同操作序列结果逐字段一致。
// 存档：登录落 MySQL、游客落 localStorage（复用 gameSave 分流）。
// ⚠️ LLM 依赖：无。
//
// ---------- 视觉约定（2026-10-07 暗色战术风重做）----------
// 整页强制深色：这个页面不管系统主题都必须是暗的，所以**不用 `dark:` 变体**
//   （项目的 dark: 跟随 prefers-color-scheme，靠它会在浅色系统下变回白底）。
// 物品/容器图标是「扁平矢量 + 粗描边 + 高饱和」风格（public/loot/*.png，AI 生成后抠的透明底），
//   配中性灰蓝格子底 —— 深色写实风格在 32px 下会糊成一团，选明亮扁平正是为了小尺寸可读。
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadLootContent, type LoadedLoot } from "@/lib/loot-content"
import {
  colorMap, containerTier, labelMap, orderOf, type Cell, type LootContent, type LootItem, type LootMap, type Rarity,
} from "@/lib/loot-engine"
import { paletteOf } from "@/lib/loot-palette"
import { loadLootSave, saveLootSave, type LootSave } from "@/lib/loot-save"
import { autoPageView, initTrack, track } from "@/lib/track"
import {
  bagDims, bagUsage, canRescue, checkEntry, commitResult, doRescue, finalize, remainingSlots, searchNext, sellStash,
  stashSorted, startRaid,
  type RaidState,
} from "@/lib/loot-store"

// ⚠️ 稀有度配色不再是这里的常量表 —— 档位数量、名字、颜色都由后台 `loot.rarities` 决定
//    （见 loot-engine 的 RarityDef.color）。运行时统一走 `paletteOf(RCOLOR[r])`：
//    C 端的类名必须是**字面量**才能被 Tailwind 扫到，所以只能在 loot-palette 里枚举好。

// ---------------- 暗色战术风 token ----------------
// ⚠️ 用 100dvh 而不是 min-h-full：游戏页整屏是暗底，必须铺满视口；
//    而 min-h-full 依赖父链上有确定高度（PlayShell 的内层 div 虽写了 h-full，
//    但中间经过 route group / RequireAuth 的 Fragment 之后高度传递并不可靠），
//    实测会退化成"高度=内容高度"，页面下方露出一条浅色。
const PAGE = "min-h-[100dvh] w-full bg-[#0b0e13] text-zinc-200 selection:bg-amber-500/30"
const INNER = "mx-auto w-full max-w-5xl px-4 pb-14 pt-16"
const CARD = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md"
const SUBTLE = "rounded-xl border border-white/[0.07] bg-white/[0.03]"
const BTN_AMBER =
  "cursor-pointer rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2 text-sm font-semibold " +
  "text-white shadow-lg shadow-amber-900/30 transition hover:brightness-110 active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
const BTN_GHOST =
  "cursor-pointer rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 " +
  "transition hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.98]"
const BTN_EXTRACT =
  "relative w-full cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 " +
  "px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110 " +
  "disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:shadow-none"

/** 地图主题色（按顺序取，通常地图顺序 = 难度顺序）：顶部色带 + 危险度标签色 */
const MAP_THEME = [
  { bar: "from-emerald-500 to-teal-600", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30", tag: "低危" },
  { bar: "from-amber-500 to-orange-600", chip: "bg-amber-500/15 text-amber-300 border-amber-400/30", tag: "中危" },
  { bar: "from-rose-500 to-red-600", chip: "bg-rose-500/15 text-rose-300 border-rose-400/30", tag: "高危" },
]

/**
 * 一组占位格里"最左上"的那格。
 * 为什么需要它：一个 2×2 占 4 格，图标只在锚点格画一次，其余格只上色 ——
 * 这样连成一片的同色格子就是"这件东西的形状"，比每格都塞一个图标好认得多。
 */
function anchorOf(cells: Cell[]): { x: number; y: number } {
  let bx = Number.POSITIVE_INFINITY
  let by = Number.POSITIVE_INFINITY
  for (const [x, y] of cells) {
    if (y < by || (y === by && x < bx)) { by = y; bx = x }
  }
  return { x: bx, y: by }
}

const GLYPH_SIZE = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-11 w-11" } as const
const GLYPH_TEXT = { sm: "text-[13px]", md: "text-lg", lg: "text-3xl" } as const

/**
 * 物品图标：有图用图，没图回落 emoji（后台两个维度可以只配一个）。
 * onError 回落很重要 —— 后台图片路径写错/文件没传上去时，这里退回 emoji，
 * 而不是在格子里留一个破图图标。
 */
function Glyph({ item, size = "md" }: { item: LootItem; size?: keyof typeof GLYPH_SIZE }) {
  const [broken, setBroken] = useState(false)
  if (item.image && !broken) {
    return (
      <img src={item.image} alt={item.name} draggable={false}
        onError={() => setBroken(true)}
        className={`${GLYPH_SIZE[size]} object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]`} />
    )
  }
  return <span className={`${GLYPH_TEXT[size]} leading-none`}>{item.emoji ?? "📦"}</span>
}

/** 容器图标（容器也有图片维度了，与物品同构） */
function CtnGlyph({ image, emoji, size = "md" }: { image?: string; emoji?: string; size?: keyof typeof GLYPH_SIZE }) {
  const [broken, setBroken] = useState(false)
  if (image && !broken) {
    return (
      <img src={image} alt="" draggable={false} onError={() => setBroken(true)}
        className={`${GLYPH_SIZE[size]} object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]`} />
    )
  }
  return <span className={`${GLYPH_TEXT[size]} leading-none`}>{emoji ?? "📦"}</span>
}

/**
 * 一张 cols×rows 的格子板（容器与背包共用）。
 *
 * ⚠️ 列数必须用 inline style 的 `gridTemplateColumns`，不能写 `grid-cols-${n}`：
 *    列数是**运行时**才定的（容器网格开局随机掷、背包网格后台可配），
 *    而 Tailwind v4 只生成源码里字面出现过的类 —— 拼出来的类名在产物 CSS 里根本不存在，
 *    表现是"格子全挤成一列"这种很难联想到原因的 bug。
 */
function CellBoard({ cols, rows, cell, children }: {
  cols: number
  rows: number
  cell: string
  children: React.ReactNode
}) {
  return (
    <div className="inline-grid gap-[3px] rounded-lg bg-black/30 p-[3px] ring-1 ring-inset ring-white/[0.06]"
      style={{ gridTemplateColumns: `repeat(${cols}, ${cell})`, gridTemplateRows: `repeat(${rows}, ${cell})` }}>
      {children}
    </div>
  )
}

/** 格子：未揭示 / 空 / 物品（含已取走）三种形态 */
function Slot({ kind, cls, children, title }: {
  kind: "hidden" | "empty" | "item"
  cls?: string
  children?: React.ReactNode
  title?: string
}) {
  const base = "flex items-center justify-center rounded-[5px] text-[11px] transition"
  if (kind === "hidden") {
    return <span title={title} className={`${base} border border-dashed border-white/15 bg-white/[0.02] text-white/25`}>?</span>
  }
  if (kind === "empty") {
    return <span title={title} className={`${base} border border-white/[0.07] bg-black/20 text-white/20`}>·</span>
  }
  return <span title={title} className={`${base} border ${cls ?? ""}`}>{children}</span>
}

const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

/** 结算原因 → 埋点用的稳定码（文案会改，码不改；P0 契约里 props 不该放中文长句） */
const reasonCode = (r: string): string =>
  r === "撤离成功" ? "extract"
    : r === "超时未撤离" ? "timeout"
      : r === "主动放弃" ? "abandon"
        : r.startsWith("风险累积超过上限") ? "risk" : "other"

export default function LootPage() {
  const [data, setData] = useState<LoadedLoot | null>(null)
  const [save, setSave] = useState<LootSave | null>(null)
  const [raid, setRaid] = useState<RaidState | null>(null)
  const [searching, setSearching] = useState<{ key: string; start: number; ms: number } | null>(null)
  const [hold, setHold] = useState<number | null>(null)          // 按住撤离的起始时间
  const [now, setNow] = useState(() => Date.now())
  const [tab, setTab] = useState<"maps" | "stash" | "codex">("maps")
  const [flash, setFlash] = useState<{ text: string; kind: "good" | "bad" } | null>(null)

  const content: LootContent | null = data?.content ?? null
  const contentRef = useRef<LootContent | null>(null)
  contentRef.current = content
  const committedRef = useRef<number | null>(null)
  const raidStartRef = useRef<number>(0)

  // 稀有度：档位数量 / 名字 / 颜色全部来自后台配置，这里不假设有五档
  const order = useMemo(() => orderOf(content ?? undefined), [content])
  const RLABEL = useMemo(() => (content ? labelMap(content) : {} as Record<string, string>), [content])
  const RCOLOR = useMemo(() => (content ? colorMap(content) : {} as Record<string, string>), [content])
  /** 稀有度 → 外框 + 底色类名（物品格子、容器卡片都用它） */
  const rCls = useCallback((r: string) => paletteOf(RCOLOR[r]).cls, [RCOLOR])
  /** 稀有度 → 文字色类名 */
  const rText = useCallback((r: string) => paletteOf(RCOLOR[r]).text, [RCOLOR])

  useEffect(() => {
    initTrack()
    autoPageView()
    let alive = true
    loadLootContent().then(async (d) => {
      if (!alive) return
      setData(d)
      const s = await loadLootSave(d.content.balance.initialCoins)
      if (alive) setSave(s)
    })
    return () => { alive = false }
  }, [])

  const persist = useCallback((s: LootSave) => { void saveLootSave(s) }, [])

  const say = useCallback((text: string, kind: "good" | "bad" = "good") => {
    setFlash({ text, kind })
    setTimeout(() => setFlash(null), 2600)
  }, [])

  // ---------------- 搜刮读条 ----------------
  const applySearch = useCallback((key: string) => {
    setRaid((prev) => (prev && contentRef.current ? searchNext(prev, contentRef.current, key) : prev))
  }, [])

  useEffect(() => {
    if (!searching) return
    const id = setInterval(() => {
      if (Date.now() - searching.start >= searching.ms) {
        clearInterval(id)
        applySearch(searching.key)
        setSearching(null)
      } else setNow(Date.now())
    }, 80)
    return () => clearInterval(id)
  }, [searching, applySearch])

  // ---------------- 局内倒计时 ----------------
  const phase = raid?.phase
  const seed = raid?.seed
  useEffect(() => {
    if (phase !== "raid") return
    const id = setInterval(() => {
      setNow(Date.now())
      setRaid((prev) => {
        if (!prev || prev.phase !== "raid") return prev
        const remain = prev.remainMs - 250
        const c = contentRef.current
        if (remain <= 0) return c ? finalize({ ...prev, remainMs: 0 }, { success: false, reason: "超时未撤离" }, c) : { ...prev, remainMs: 0 }
        return { ...prev, remainMs: remain }
      })
    }, 250)
    return () => clearInterval(id)
  }, [phase, seed])

  // ---------------- 结算写回存档（只写一次） ----------------
  useEffect(() => {
    if (!raid || raid.phase !== "settled" || !save) return
    if (committedRef.current === raid.seed) return
    committedRef.current = raid.seed
    const ns = commitResult(raid, save)
    setSave(ns)
    persist(ns)
    // 埋点：一局的终局结果（本地队列，P0 上线即接）。reason_code 用稳定码而非文案。
    if (raid.result) {
      track("loot_raid_settle", {
        map_id: raid.mapId,
        success: raid.result.success,
        reason_code: reasonCode(raid.result.reason),
        haul: raid.result.gross,
        items: raid.result.backpack.length,
        risk: raid.risk,
        containers: raid.containers.filter((c) => c.revealed.some(Boolean)).length,
        duration_ms: raidStartRef.current ? Date.now() - raidStartRef.current : 0,
      })
    }
  }, [raid, save, persist])

  // ---------------- 进场 / 撤离 / 放弃 ----------------
  const balance = content?.balance

  /** 背包网格尺寸（后台配的 cols×rows） */
  const bag = useMemo(() => (balance ? bagDims(balance) : { cols: 5, rows: 3 }), [balance])
  /** 背包占用：按**格**算，不是按件算 —— 一件 2×2 就是 4 格 */
  const bagUse = useMemo(
    () => (raid && balance ? bagUsage(raid.backpack, balance) : { used: 0, total: bag.cols * bag.rows }),
    [raid, balance, bag],
  )
  const bagUsed = bagUse.used
  const bagTotal = bagUse.total

  const enter = (map: LootMap) => {
    if (!content || !save) return
    const chk = checkEntry(save, map, null)   // 首版两张图 groups 均为空，故不取用户组
    if (!chk.ok) { say(chk.reasons[0], "bad"); return }
    const nextSeed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0
    const { raid: r, save: s } = startRaid(content, map, save, nextSeed)
    committedRef.current = null
    raidStartRef.current = Date.now()
    // 埋点：进图（game_start 是 P0 已有事件名，game_code 固定 loot）
    track("game_start", { game_code: "loot" })
    track("loot_raid_start", { map_id: map.id, entry_coins: map.entry.coins })
    setRaid(r)
    setSave(s)
    persist(s)
  }

  const finishExtract = useCallback(() => {
    setRaid((prev) => {
      const c = contentRef.current
      if (!prev || !c || prev.phase !== "raid") return prev
      return finalize({ ...prev, phase: "raid" }, { success: true, reason: "撤离成功" }, c)
    })
  }, [])

  useEffect(() => {
    if (hold == null || !balance) return
    const ms = balance.extractHoldMs
    const id = setInterval(() => {
      if (Date.now() - hold >= ms) {
        clearInterval(id)
        setHold(null)
        finishExtract()
      } else setNow(Date.now())
    }, 80)
    return () => clearInterval(id)
  }, [hold, balance, finishExtract])

  const abandon = () => {
    setRaid((prev) => {
      const c = contentRef.current
      if (!prev || !c) return prev
      return finalize(prev, { success: false, reason: "主动放弃" }, c)
    })
  }

  const backToHub = () => { setRaid(null); setTab("maps"); setSearching(null); setHold(null) }

  // ---------------- 仓库 / 救济 ----------------
  const stash = useMemo(
    () => (content && save ? stashSorted(save, content) : []),
    [content, save],
  )
  const rescue = useMemo(
    () => (content && save ? canRescue(save, content, now) : { ok: false, remainMs: 0 }),
    [content, save, now],
  )
  const reclaimAll = () => {
    if (!content || !save) return
    const { save: ns, gained } = sellStash(save, content)
    setSave(ns); persist(ns)
    track("loot_stash_recycle", { items: save.stash.reduce((s, x) => s + x.qty, 0), gained })
    say(`回收完成，获得 💰${gained}`)
  }
  const claimRescue = () => {
    if (!content || !save) return
    const ns = doRescue(save, content, Date.now())
    setSave(ns); persist(ns)
    track("loot_rescue_claim", { amount: content.balance.rescueCoins })
    say(`领取救济金 💰${content.balance.rescueCoins}`)
  }

  // ---------------- 加载门 ----------------
  if (!data || !content || !balance || !save) {
    return (
      <div className={`${PAGE} grid min-h-full place-items-center`}>
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-amber-500 border-t-transparent" />
          <span className="text-sm font-medium">正在载入摸金行动…</span>
        </div>
      </div>
    )
  }

  const progress = raid ? remainingSlots(raid) : { total: 0, done: 0 }
  const mapOfRaid = raid ? content.maps.find((m) => m.id === raid.mapId) : undefined
  const riskPct = raid ? Math.min(100, (raid.risk / Math.max(1, raid.riskLimit)) * 100) : 0
  const riskHigh = riskPct > 75
  const timeLow = !!raid && raid.remainMs < 60_000

  return (
    <div className={PAGE}>
      <div className={INNER}>
        {/* 提示 */}
        {flash && (
          <div className={`fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium shadow-xl ring-1 ring-white/10 ${
            flash.kind === "good" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
            {flash.text}
          </div>
        )}

        {/* ======================= 资源 HUD ======================= */}
        <div className={`${CARD} mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3`}>
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg leading-none">💰</span>
            <b className="tabular-nums text-xl font-black text-amber-400">{save.coins}</b>
          </span>
          <span className="h-6 w-px bg-white/10" />
          <Stat label="出击" value={String(save.stats.runs)} />
          <Stat label="撤离" value={String(save.stats.extracts)} tone="emerald" />
          <Stat label="失败" value={String(save.stats.failed)} tone="rose" />
          <Stat label="撤离率" value={`${save.stats.runs > 0 ? Math.round((save.stats.extracts / save.stats.runs) * 100) : 0}%`} />
          <Stat label="最大一票" value={String(save.stats.bestHaul)} />
          <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            data.source === "published"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
              : "border-white/10 bg-white/5 text-zinc-400"}`}>
            {data.source === "published" ? "后台已发布配置" : "内置默认内容"}
          </span>
        </div>

        {/* ======================= 局内 ======================= */}
        {(phase === "raid" || phase === "extract") && raid && mapOfRaid ? (
          <div className="flex flex-col gap-4">
            {/* 战术 HUD */}
            <div className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5`}>
              <span className="flex items-center gap-2 font-bold text-zinc-100">
                <span className="text-base">🗺️</span>{mapOfRaid.name}
              </span>

              <span className={`flex items-center gap-2 tabular-nums font-black ${timeLow ? "animate-pulse text-rose-400" : "text-zinc-100"}`}>
                <span className="text-xs font-normal opacity-60">⏱</span>
                <span className="text-2xl leading-none tracking-tight">{fmtMs(raid.remainMs)}</span>
              </span>

              <span className="flex min-w-[9rem] flex-1 items-center gap-2">
                <span className="shrink-0 text-xs text-zinc-400">风险</span>
                <span className={`shrink-0 tabular-nums text-sm font-semibold ${riskHigh ? "text-rose-400" : "text-amber-300"}`}>
                  {raid.risk}<span className="text-zinc-500">/{raid.riskLimit}</span>
                </span>
                <span className="h-2 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full transition-[width] duration-200 ${
                    riskHigh ? "bg-gradient-to-r from-rose-500 to-red-500" : "bg-gradient-to-r from-amber-500 to-orange-500"}`}
                    style={{ width: `${riskPct}%` }} />
                </span>
              </span>

              <span className="flex items-center gap-1.5 text-sm tabular-nums text-zinc-300">
                <span className="text-xs opacity-60">🎒</span>
                <b className="font-bold text-zinc-100">{bagUsed}</b>
                <span className="text-zinc-500">/{bagTotal}</span>
              </span>
              <span className="text-[11px] text-zinc-500">摸过 {progress.done}/{progress.total} 格</span>

              <button onClick={abandon}
                className="ml-auto cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-300">
                放弃
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_17rem]">
              {/* 容器网格：几×几由开局随机掷出，同 seed 可复现 */}
              <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {raid.containers.map((c) => {
                  const total = c.cols * c.rows
                  const opened = c.revealed.filter(Boolean).length
                  const done = opened >= total
                  const busy = searching?.key === c.key
                  const pct = busy && searching ? Math.min(100, ((now - searching.start) / searching.ms) * 100) : 0
                  // 档位来自容器定义（rarityWeights），不是局内实例 —— 局内实例没有权重
                  const def = content.containers.find((x) => x.id === c.id)
                  const tier: Rarity = def ? containerTier(def, order) : order[0]
                  const pal = paletteOf(RCOLOR[tier])
                  return (
                    <div key={c.key} title={`产出档位：${RLABEL[tier] ?? tier}｜网格 ${c.cols}×${c.rows}`}
                      className={`flex h-full flex-col gap-2.5 rounded-2xl border p-3 transition ${pal.cls} ${
                        done ? "opacity-60" : ""}`}>
                      <div className="flex items-center gap-2">
                        <CtnGlyph image={def?.image} emoji={c.emoji} size="sm" />
                        <span className="truncate text-sm font-semibold text-zinc-100">{c.name}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${pal.text} bg-black/25`}>
                          {RLABEL[tier] ?? tier}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-400">{opened}/{total}</span>
                      </div>

                      <div className="flex flex-1 items-center justify-center">
                        <CellBoard cols={c.cols} rows={c.rows} cell="2.1rem">
                          {Array.from({ length: total }, (_, i) => {
                            const x = i % c.cols
                            const y = Math.floor(i / c.cols)
                            if (!c.revealed[i]) {
                              return <Slot key={i} kind="hidden" title={busy ? "搜刮中…" : "未搜刮"} />
                            }
                            const k = c.layout.findIndex((p) => p.cells.some(([cx, cy]) => cx === x && cy === y))
                            if (k < 0) return <Slot key={i} kind="empty" title="空" />
                            const p = c.layout[k]
                            const item = content.items.find((it) => it.id === p.itemId)
                            const got = !!c.taken[k]
                            const a = anchorOf(p.cells)
                            const boxCls = item ? paletteOf(RCOLOR[item.rarity]).cls : pal.cls
                            return (
                              <span key={i}
                                title={item ? `${item.name}｜占 ${p.cells.length} 格${got ? "（已取走）" : ""}` : undefined}
                                className={`flex items-center justify-center rounded-[5px] border ${boxCls} ${
                                  got ? "brightness-[0.45] saturate-50" : ""}`}>
                                {item && !got && a.x === x && a.y === y ? <Glyph item={item} size="sm" /> : null}
                              </span>
                            )
                          })}
                        </CellBoard>
                      </div>

                      {busy ? (
                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
                          <span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                            style={{ width: `${pct}%`, transition: "none" }} />
                        </div>
                      ) : (
                        <button
                          disabled={done || !!searching || hold != null || phase !== "raid"}
                          onClick={() => setSearching({ key: c.key, start: Date.now(), ms: c.slotMs })}
                          className="w-full cursor-pointer rounded-xl bg-zinc-100 px-2 py-2 text-xs font-bold text-zinc-900 transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500">
                          {done ? "已搜完" : "搜刮下一格"}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 背包 + 撤离 + 日志 */}
              <div className="flex flex-col gap-3">
                <div className={`${CARD} p-3`}>
                  <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-zinc-300">
                    <span>🎒 背包</span>
                    <span className="font-normal tabular-nums text-zinc-500">
                      {bagUsed}/{bagTotal} 格 · {raid.backpack.length} 件
                    </span>
                  </div>
                  {/* 背包也是格子板：形状塞不下的东西会被丢下，这里能直接看出还剩多少空间 */}
                  <div className="flex justify-center">
                    <CellBoard cols={bag.cols} rows={bag.rows} cell="2.1rem">
                      {Array.from({ length: bag.cols * bag.rows }, (_, i) => {
                        const x = i % bag.cols
                        const y = Math.floor(i / bag.cols)
                        const b = raid.backpack.find((e) => e.cells.some(([cx, cy]) => cx === x && cy === y))
                        if (!b) return <Slot key={i} kind="hidden" title="空" />
                        const a = anchorOf(b.cells)
                        return (
                          <span key={i} title={`${b.item.name}｜面值 ${b.value}｜占 ${b.cells.length} 格`}
                            className={`flex items-center justify-center rounded-[5px] border ${paletteOf(RCOLOR[b.item.rarity]).cls}`}>
                            {a.x === x && a.y === y ? <Glyph item={b.item} size="sm" /> : null}
                          </span>
                        )
                      })}
                    </CellBoard>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2.5 text-[11px]">
                    <span className="text-zinc-500">带货价值</span>
                    <span className="tabular-nums">
                      <b className="text-amber-400">
                        💰{raid.backpack.reduce((s, b) => s + b.value, 0)}
                      </b>
                      <span className="mx-1.5 text-zinc-600">·</span>
                      <span className="text-zinc-400">回收 ≈ {raid.backpack.reduce((s, b) => s + b.unit, 0)}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    disabled={!!searching || raid.backpack.length === 0}
                    onPointerDown={() => { if (!searching && raid.backpack.length) setHold(Date.now()) }}
                    onPointerUp={() => setHold(null)}
                    onPointerLeave={() => setHold(null)}
                    className={BTN_EXTRACT}>
                    {hold != null && (
                      <span className="absolute inset-y-0 left-0 bg-white/25"
                        style={{ width: `${Math.min(100, ((now - hold) / balance.extractHoldMs) * 100)}%`, transition: "none" }} />
                    )}
                    <span className="relative">
                      {hold != null
                        ? `撤离中… ${Math.max(0, ((balance.extractHoldMs - (now - hold)) / 1000)).toFixed(1)}s`
                        : `按住 ${(balance.extractHoldMs / 1000).toFixed(1)}s 撤离`}
                    </span>
                  </button>
                  <p className="text-center text-[11px] text-zinc-500">
                    撤离成功物品进仓库；松手或中途离开视为取消
                  </p>
                </div>

                <div className={`${CARD} max-h-56 overflow-y-auto p-3`}>
                  <div className="mb-2 text-xs font-semibold text-zinc-300">行动日志</div>
                  <ul className="flex flex-col gap-1 text-[11px] leading-relaxed">
                    {[...raid.log].reverse().map((l, i) => (
                      <li key={i} className={
                        l.kind === "good" ? "text-emerald-400"
                          : l.kind === "bad" ? "text-rose-400" : "text-zinc-400"}>{l.t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : phase === "settled" && raid && raid.result ? (
          /* ======================= 结算 ======================= */
          <div className={`${CARD} relative flex flex-col gap-5 overflow-hidden p-6`}>
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${
              raid.result.success ? "from-emerald-500 to-teal-500" : "from-rose-500 to-red-600"}`} />
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-5xl">{raid.result.success ? "🎉" : "💀"}</span>
              <h2 className={`text-2xl font-black tracking-tight ${
                raid.result.success ? "text-emerald-400" : "text-rose-400"}`}>
                {raid.result.success ? "撤离成功" : "行动失败"}
              </h2>
              <p className="text-xs text-zinc-500">{raid.result.reason}</p>
            </div>

            {raid.result.backpack.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {raid.result.backpack.map((b, i) => (
                  <span key={i} title={`${b.item.name}｜面值 ${b.value}｜占 ${b.cells.length} 格`}
                    className={`inline-flex items-center gap-1.5 rounded-xl border bg-black/20 px-2.5 py-1.5 ${rCls(b.item.rarity)}`}>
                    <Glyph item={b.item} size="sm" />
                    <span className="text-[11px] font-medium text-zinc-200">{b.item.name}</span>
                    <span className="tabular-nums text-[11px] text-zinc-400">{b.value}</span>
                  </span>
                ))}
              </div>
            )}

            <dl className="mx-auto grid w-full max-w-md grid-cols-3 gap-3">
              <div className={`${SUBTLE} px-3 py-2.5 text-center`}>
                <dt className="text-[11px] text-zinc-500">本局价值</dt>
                <dd className="tabular-nums text-lg font-black text-zinc-100">{raid.result.gross}</dd>
              </div>
              <div className={`${SUBTLE} px-3 py-2.5 text-center`}>
                <dt className="text-[11px] text-zinc-500">{raid.result.success ? "入库件数" : "损失件数"}</dt>
                <dd className="tabular-nums text-lg font-black text-zinc-100">{raid.result.backpack.length}</dd>
              </div>
              <div className={`${SUBTLE} px-3 py-2.5 text-center`}>
                <dt className="text-[11px] text-zinc-500">{raid.result.success ? "可回收" : "损失价值"}</dt>
                <dd className={`tabular-nums text-lg font-black ${raid.result.success ? "text-amber-400" : "text-rose-400"}`}>
                  {raid.result.success ? raid.result.payout : raid.result.lostValue}
                </dd>
              </div>
            </dl>

            <div className="flex justify-center gap-3">
              <button onClick={backToHub} className={BTN_AMBER}>回仓库</button>
              <button onClick={() => { backToHub(); setTab("maps") }} className={BTN_GHOST}>再来一局</button>
            </div>
          </div>
        ) : (
          /* ======================= 大厅 ======================= */
          <div className="flex flex-col gap-4">
            {/* 破产救济 */}
            {rescue.ok && (
              <div className={`${CARD} flex flex-wrap items-center gap-3 border-amber-400/30 bg-amber-500/[0.07] px-4 py-3`}>
                <span className="text-sm text-zinc-200">
                  💸 破产了 —— 金币不够进任何一张图，仓库也空了。
                </span>
                <button onClick={claimRescue} className={`ml-auto ${BTN_AMBER} px-3 py-1.5 text-xs`}>
                  领取救济金 💰{balance.rescueCoins}（每 {(balance.rescueCooldownSec / 3600).toFixed(0)}h 一次）
                </button>
              </div>
            )}

            {/* tab */}
            <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
              {([["maps", "⚔️ 出击"], ["stash", `📦 仓库（${stash.length}）`], ["codex", "📖 图鉴"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition ${tab === k
                    ? "bg-white/10 text-zinc-100 shadow-sm ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "maps" && (
              <section className="grid auto-rows-fr gap-4 sm:grid-cols-2">
                {content.maps.map((m, mi) => {
                  const chk = checkEntry(save, m, null)
                  const theme = MAP_THEME[mi % MAP_THEME.length]
                  return (
                    <div key={m.id} className={`${CARD} relative flex h-full flex-col overflow-hidden p-5 transition ${
                      chk.ok ? "hover:border-white/20 hover:bg-white/[0.06]" : "opacity-85"}`}>
                      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.bar}`} />

                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2 text-lg font-bold text-zinc-100">
                          <span>🗺️</span>{m.name}
                        </span>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${theme.chip}`}>
                          {theme.tag}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <KeyStat label="时限" value={`${m.timeLimitSec}s`} />
                        <KeyStat label="风险上限" value={String(m.riskLimit)} />
                        <KeyStat label="容器" value={`${m.containers.reduce((s, c) => s + c.count, 0)} 个`} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span>价值倍率 <b className="text-zinc-400">{m.valueMult}×</b></span>
                        <span>稀有加成 <b className="text-zinc-400">+{Math.round(m.tierBoost * 100)}%</b></span>
                        <span>撤离点 <b className="text-zinc-400">{m.extractPoints}</b></span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.containers.map((c) => {
                          const def = content.containers.find((x) => x.id === c.containerId)
                          return (
                            <span key={c.containerId}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300">
                              <CtnGlyph image={def?.image} emoji={def?.emoji} size="sm" />
                              {def?.name ?? c.containerId}
                              <b className="text-zinc-500">×{c.count}</b>
                            </span>
                          )
                        })}
                      </div>

                      {/* mt-auto：卡片被拉伸到同行等高后，把"提示 + CTA"整体顶到底部，
                          两张卡的按钮才会横向对齐（否则内容少的那张按钮位置偏上） */}
                      <div className="mt-auto pt-4">
                        {!chk.ok && (
                          <ul className="mb-3 flex flex-col gap-0.5 text-[11px] text-rose-300">
                            {chk.reasons.map((r) => <li key={r}>· {r}</li>)}
                          </ul>
                        )}
                        <button onClick={() => enter(m)} disabled={!chk.ok}
                          className={`w-full ${BTN_AMBER} py-2.5`}>
                          {chk.ok ? `带 💰${m.entry.coins} 进图` : "门槛未满足"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {tab === "stash" && (
              <section className={`${CARD} p-5`}>
                {stash.length === 0 ? (
                  <div className="py-12 text-center text-sm text-zinc-500">
                    仓库是空的 —— 活着带东西出来才会存进这里
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-zinc-400">
                        共 {stash.reduce((s, x) => s + x.qty, 0)} 件 · 全部回收可得
                        <b className="ml-1 text-amber-400">💰{stash.reduce((s, x) => s + x.sell * x.qty, 0)}</b>
                      </span>
                      <button onClick={reclaimAll} className={`${BTN_AMBER} px-3 py-1.5 text-xs`}>一键回收</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stash.map(({ item, qty, sell }) => (
                        <span key={item.id} title={`${item.name}｜回收 ${sell}｜面值 ${item.baseValue}`}
                          className={`inline-flex items-center gap-1.5 rounded-xl border bg-black/20 px-2.5 py-1.5 ${rCls(item.rarity)}`}>
                          <Glyph item={item} size="sm" />
                          <span className="text-[11px] font-medium text-zinc-200">{item.name}</span>
                          {qty > 1 && <span className="tabular-nums text-[11px] font-bold text-zinc-300">×{qty}</span>}
                          <span className="tabular-nums text-[11px] text-zinc-400">{sell}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {tab === "codex" && (
              <section className={`${CARD} p-5`}>
                <h2 className="mb-4 text-sm font-semibold text-zinc-200">
                  物品图鉴 <span className="font-normal text-zinc-500">（{content.items.length} 件）</span>
                </h2>
                {/* 高档在前；档位来自后台配置，不写死五档 */}
                {[...order].reverse().map((r) => {
                  const arr = content.items.filter((i) => i.rarity === r)
                  if (!arr.length) return null
                  return (
                    <div key={r} className="mb-4">
                      <div className={`mb-2 flex items-center gap-2 text-xs font-semibold ${rText(r)}`}>
                        <span className={`h-2 w-2 rounded-full ${paletteOf(RCOLOR[r]).dot}`} />
                        {RLABEL[r] ?? r}
                        <span className="font-normal text-zinc-500">{arr.length} 件</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {arr.map((it: LootItem) => (
                          <span key={it.id}
                            title={`${it.name}｜面值 ${it.baseValue}｜占 ${it.shape && it.shape !== "1x1" ? it.shape : 1} 格`}
                            className={`inline-flex items-center gap-1.5 rounded-xl border bg-black/20 px-2.5 py-1.5 ${rCls(r)}`}>
                            <Glyph item={it} size="sm" />
                            <span className="text-[11px] font-medium text-zinc-200">{it.name}</span>
                            <span className="tabular-nums text-[11px] text-zinc-400">{it.baseValue}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            <p className="text-center text-[11px] leading-relaxed text-zinc-600">
              带钱进图 → 摸容器 → 自己决定什么时候跑。撤离成功物品进仓库（可回收换币），
              超时 / 风险爆表 / 主动放弃都会丢掉整包。内容与数值全部来自后台配置。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** HUD 里的小统计项 */
function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "rose" ? "text-rose-400" : "text-zinc-200"
  return (
    <span className="flex items-baseline gap-1.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <b className={`tabular-nums text-sm font-bold ${color}`}>{value}</b>
    </span>
  )
}

/** 地图卡上的关键数字 */
function KeyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-2 py-2 text-center">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 tabular-nums text-base font-bold text-zinc-100">{value}</div>
    </div>
  )
}
