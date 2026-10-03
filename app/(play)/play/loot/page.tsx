"use client"

// 摸金行动（Loot Raid）· C 端玩法页
//
// W2 状态（2026-10-03）：完整进图循环已接通 ——
//   选图 → 门槛校验（币/撤离次数/入场物品/用户组）→ 扣门票进图
//   → 逐槽读条搜刮（背包上限 / 风险累积 / 容器保底）
//   → 按住撤离读条 → 成功物品入仓库 / 失败（超时 · 风险爆表 · 主动放弃）背包全丢
//   → 回收换币 → 破产救济
//
// 所有随机走 loot-engine 的确定性 RNG（seed + cursor），同 seed 同操作序列结果逐字段一致。
// 存档：登录落 MySQL、游客落 localStorage（复用 gameSave 分流）。
// ⚠️ LLM 依赖：无。
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadLootContent, type LoadedLoot } from "@/lib/loot-content"
import { RARITY_LABEL, type LootContent, type LootItem, type LootMap, type Rarity } from "@/lib/loot-engine"
import { loadLootSave, saveLootSave, type LootSave } from "@/lib/loot-save"
import {
  canRescue, checkEntry, commitResult, doRescue, finalize, remainingSlots, searchNext, sellStash,
  stashSorted, startRaid,
  type RaidState,
} from "@/lib/loot-store"

/** 稀有度配色（普通灰 → 传说金，与后台 Tag 色一致） */
const RARITY_CLS: Record<Rarity, string> = {
  common: "text-zinc-500 border-zinc-300 dark:border-zinc-600",
  uncommon: "text-emerald-600 border-emerald-300 dark:border-emerald-700",
  rare: "text-sky-600 border-sky-300 dark:border-sky-700",
  epic: "text-violet-600 border-violet-300 dark:border-violet-700",
  legendary: "text-amber-600 border-amber-300 dark:border-amber-700",
}

const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

const CARD = "rounded-2xl border border-black/5 bg-white/70 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"

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

  useEffect(() => {
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
  }, [raid, save, persist])

  // ---------------- 进场 / 撤离 / 放弃 ----------------
  const balance = content?.balance

  const enter = (map: LootMap) => {
    if (!content || !save) return
    const chk = checkEntry(save, map, null)   // 首版两张图 groups 均为空，故不取用户组
    if (!chk.ok) { say(chk.reasons[0], "bad"); return }
    const nextSeed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0
    const { raid: r, save: s } = startRaid(content, map, save, nextSeed)
    committedRef.current = null
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
    say(`回收完成，获得 💰${gained}`)
  }
  const claimRescue = () => {
    if (!content || !save) return
    const ns = doRescue(save, content, Date.now())
    setSave(ns); persist(ns)
    say(`领取救济金 💰${content.balance.rescueCoins}`)
  }

  // ---------------- 加载门 ----------------
  if (!data || !content || !balance || !save) {
    return (
      <div className="grid min-h-full place-items-center pt-16">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-amber-500 border-t-transparent" />
          <span className="text-sm font-medium">正在载入摸金行动…</span>
        </div>
      </div>
    )
  }

  const progress = raid ? remainingSlots(raid) : { total: 0, done: 0 }
  const mapOfRaid = raid ? content.maps.find((m) => m.id === raid.mapId) : undefined

  return (
    <div className="mx-auto min-h-full w-full max-w-4xl px-4 pb-12 pt-16">
      {/* 提示 */}
      {flash && (
        <div className={`fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium shadow-lg ${
          flash.kind === "good" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
          {flash.text}
        </div>
      )}

      {/* 顶栏：资源 */}
      <div className={`${CARD} mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm`}>
        <span className="font-bold text-amber-600 dark:text-amber-400">💰 {save.coins}</span>
        <span className="text-zinc-500">出击 {save.stats.runs} 次</span>
        <span className="text-emerald-600 dark:text-emerald-400">成功撤离 {save.stats.extracts}</span>
        <span className="text-rose-500">失败 {save.stats.failed}</span>
        <span className="text-zinc-500">最大一票 {save.stats.bestHaul}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium ${data.source === "published"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          {data.source === "published" ? "后台已发布配置" : "内置默认内容"}
        </span>
      </div>

      {/* ======================= 局内 ======================= */}
      {(phase === "raid" || phase === "extract") && raid && mapOfRaid ? (
        <div className="flex flex-col gap-4">
          <div className={`${CARD} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
            <span className="font-bold text-zinc-800 dark:text-zinc-100">🗺️ {mapOfRaid.name}</span>
            <span className={`tabular-nums font-semibold ${raid.remainMs < 60000 ? "text-rose-600" : "text-zinc-700 dark:text-zinc-200"}`}>
              ⏱ {fmtMs(raid.remainMs)}
            </span>
            <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
              ⚠ 风险 {raid.risk}/{raid.riskLimit}
              <span className="ml-1 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 align-middle dark:bg-zinc-700">
                <span className={`block h-full ${raid.risk / raid.riskLimit > 0.75 ? "bg-rose-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(100, (raid.risk / raid.riskLimit) * 100)}%` }} />
              </span>
            </span>
            <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
              🎒 {raid.backpack.length}/{balance.backpackCap}
            </span>
            <span className="text-[11px] text-zinc-400">摸过 {progress.done}/{progress.total} 格</span>
            <button onClick={abandon} className="ml-auto cursor-pointer rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
              放弃
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
            {/* 容器网格 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {raid.containers.map((c) => {
                const done = c.picks.length >= c.slots
                const busy = searching?.key === c.key
                const pct = busy && searching ? Math.min(100, ((now - searching.start) / searching.ms) * 100) : 0
                return (
                  <div key={c.key} className={`${CARD} flex flex-col gap-2 p-3`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">{c.emoji} {c.name}</span>
                      <span className="text-[11px] text-zinc-400">{c.picks.length}/{c.slots}</span>
                    </div>
                    {/* 已摸出的槽 */}
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: c.slots }, (_, i) => {
                        const p = c.picks[i]
                        if (i >= c.picks.length) {
                          return <span key={i} className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-zinc-300 text-[10px] text-zinc-400 dark:border-zinc-600">?</span>
                        }
                        return p ? (
                          <span key={i} title={`${p.name} · ${RARITY_LABEL[p.rarity]}`}
                            className={`grid h-7 w-7 place-items-center rounded-md border bg-white/70 text-base dark:bg-white/5 ${RARITY_CLS[p.rarity]}`}>
                            {p.emoji ?? "📦"}
                          </span>
                        ) : (
                          <span key={i} className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-zinc-300 text-[10px] text-zinc-400 dark:border-zinc-600">空</span>
                        )
                      })}
                    </div>
                    {busy ? (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    ) : (
                      <button
                        disabled={done || !!searching || hold != null || phase !== "raid"}
                        onClick={() => setSearching({ key: c.key, start: Date.now(), ms: c.slotMs })}
                        className="cursor-pointer rounded-lg bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
                        {done ? "已搜完" : "搜刮下面一格"}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 背包 + 日志 */}
            <div className="flex flex-col gap-3">
              <div className={`${CARD} p-3`}>
                <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  背包（{raid.backpack.length}/{balance.backpackCap}）
                </div>
                {raid.backpack.length === 0
                  ? <div className="py-3 text-center text-[11px] text-zinc-400">还是空的</div>
                  : (
                    <ul className="flex flex-col gap-1">
                      {raid.backpack.map((b, i) => (
                        <li key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${RARITY_CLS[b.item.rarity]}`}>
                          <span className="text-base">{b.item.emoji ?? "📦"}</span>
                          <span className="flex-1 truncate text-zinc-700 dark:text-zinc-200">{b.item.name}</span>
                          <span className="tabular-nums opacity-80">{b.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                <div className="mt-2 border-t border-black/5 pt-2 text-[11px] text-zinc-500 dark:border-white/10">
                  当前价值 <b className="text-amber-600 dark:text-amber-400">
                    {raid.backpack.reduce((s, b) => s + b.value, 0)}
                  </b> · 回收可得 ≈
                  <b> {raid.backpack.reduce((s, b) => s + Math.round(b.item.recycleValue ?? b.item.baseValue * balance.recycleRate), 0)}</b>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  disabled={!!searching || raid.backpack.length === 0}
                  onPointerDown={() => { if (!searching && raid.backpack.length) setHold(Date.now()) }}
                  onPointerUp={() => setHold(null)}
                  onPointerLeave={() => setHold(null)}
                  className="relative w-full cursor-pointer overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                  {hold != null && (
                    <span className="absolute inset-0 bg-white/25"
                      style={{ width: `${Math.min(100, ((now - hold) / balance.extractHoldMs) * 100)}%`, transition: "none" }} />
                  )}
                  <span className="relative">
                    {hold != null
                      ? `撤离中… ${Math.max(0, ((balance.extractHoldMs - (now - hold)) / 1000)).toFixed(1)}s`
                      : `按住 ${(balance.extractHoldMs / 1000).toFixed(1)}s 撤离`}
                  </span>
                </button>
                <p className="text-center text-[11px] text-zinc-400">
                  撤离成功物品进仓库；松手或中途离开视为取消
                </p>
              </div>

              <div className={`${CARD} max-h-52 overflow-y-auto p-3`}>
                <div className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">行动日志</div>
                <ul className="flex flex-col gap-0.5 text-[11px] leading-relaxed">
                  {[...raid.log].reverse().map((l, i) => (
                    <li key={i} className={
                      l.kind === "good" ? "text-emerald-600 dark:text-emerald-400"
                        : l.kind === "bad" ? "text-rose-500" : "text-zinc-500 dark:text-zinc-400"}>{l.t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : phase === "settled" && raid && raid.result ? (
        /* ======================= 结算 ======================= */
        <div className={`${CARD} flex flex-col gap-4 p-6`}>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-4xl">{raid.result.success ? "🎉" : "💀"}</span>
            <h2 className={`text-xl font-black ${raid.result.success ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {raid.result.success ? "撤离成功" : "行动失败"}
            </h2>
            <p className="text-xs text-zinc-500">{raid.result.reason}</p>
          </div>

          {raid.result.backpack.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {raid.result.backpack.map((b, i) => (
                <span key={i} className={`inline-flex items-center gap-1 rounded-lg border bg-white/60 px-2 py-1 text-[11px] dark:bg-white/5 ${RARITY_CLS[b.item.rarity]}`}>
                  <span className="text-base">{b.item.emoji ?? "📦"}</span>
                  <span className="text-zinc-700 dark:text-zinc-200">{b.item.name}</span>
                  <span className="tabular-nums opacity-70">{b.value}</span>
                </span>
              ))}
            </div>
          )}

          <dl className="mx-auto grid max-w-sm grid-cols-3 gap-3 text-center text-xs">
            <div><dt className="text-zinc-400">本局价值</dt><dd className="font-bold text-zinc-700 dark:text-zinc-200">{raid.result.gross}</dd></div>
            <div><dt className="text-zinc-400">{raid.result.success ? "入库件数" : "损失件数"}</dt><dd className="font-bold text-zinc-700 dark:text-zinc-200">{raid.result.backpack.length}</dd></div>
            <div>
              <dt className="text-zinc-400">{raid.result.success ? "可回收" : "损失价值"}</dt>
              <dd className={`font-bold ${raid.result.success ? "text-amber-600 dark:text-amber-400" : "text-rose-500"}`}>
                {raid.result.success ? raid.result.payout : raid.result.lostValue}
              </dd>
            </div>
          </dl>

          <div className="flex justify-center gap-3">
            <button onClick={backToHub}
              className="cursor-pointer rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
              回仓库
            </button>
            <button onClick={() => { backToHub(); setTab("maps") }}
              className="cursor-pointer rounded-xl border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-white/5">
              再来一局
            </button>
          </div>
        </div>
      ) : (
        /* ======================= 大厅 ======================= */
        <div className="flex flex-col gap-4">
          {/* 破产救济 */}
          {rescue.ok && (
            <div className={`${CARD} flex flex-wrap items-center gap-3 border-amber-300 px-4 py-3 dark:border-amber-700`}>
              <span className="text-sm text-zinc-700 dark:text-zinc-200">
                破产了 —— 金币不够进任何一张图，仓库也空了。
              </span>
              <button onClick={claimRescue}
                className="ml-auto cursor-pointer rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
                领取救济金 💰{balance.rescueCoins}（每 {(balance.rescueCooldownSec / 3600).toFixed(0)}h 一次）
              </button>
            </div>
          )}

          {/* tab */}
          <div className="flex gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/5">
            {([["maps", "出击"], ["stash", `仓库（${stash.length}）`], ["codex", "图鉴"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === k
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "maps" && (
            <section className="grid gap-4 sm:grid-cols-2">
              {content.maps.map((m) => {
                const chk = checkEntry(save, m, null)
                return (
                  <div key={m.id} className={`${CARD} p-5`}>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">🗺️ {m.name}</span>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                        门槛 💰{m.entry.coins}{m.entry.minExtracts > 0 && ` · 撤离${m.entry.minExtracts}次`}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-500">
                      <div><dt>时限</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">{m.timeLimitSec}s</dd></div>
                      <div><dt>风险上限</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">{m.riskLimit}</dd></div>
                      <div><dt>容器</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">{m.containers.reduce((s, c) => s + c.count, 0)} 个</dd></div>
                      <div><dt>价值倍率</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">{m.valueMult}×</dd></div>
                      <div><dt>稀有加成</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">+{Math.round(m.tierBoost * 100)}%</dd></div>
                      <div><dt>撤离点</dt><dd className="font-semibold text-zinc-700 dark:text-zinc-200">{m.extractPoints}</dd></div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.containers.map((c) => {
                        const def = content.containers.find((x) => x.id === c.containerId)
                        return (
                          <span key={c.containerId} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                            {def?.emoji ?? "📦"} {def?.name ?? c.containerId} ×{c.count}
                          </span>
                        )
                      })}
                    </div>
                    {!chk.ok && (
                      <ul className="mt-3 flex flex-col gap-0.5 text-[11px] text-rose-500">
                        {chk.reasons.map((r) => <li key={r}>· {r}</li>)}
                      </ul>
                    )}
                    <button onClick={() => enter(m)} disabled={!chk.ok}
                      className="mt-4 w-full cursor-pointer rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-400 dark:disabled:from-zinc-700 dark:disabled:to-zinc-700">
                      {chk.ok ? `带 💰${m.entry.coins} 进图` : "门槛未满足"}
                    </button>
                  </div>
                )
              })}
            </section>
          )}

          {tab === "stash" && (
            <section className={`${CARD} p-5`}>
              {stash.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-400">仓库是空的 —— 活着带东西出来才会存进这里</div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">
                      共 {stash.reduce((s, x) => s + x.qty, 0)} 件 · 全部回收可得
                      <b className="ml-1 text-amber-600 dark:text-amber-400">
                        💰{stash.reduce((s, x) => s + x.sell * x.qty, 0)}
                      </b>
                    </span>
                    <button onClick={reclaimAll}
                      className="cursor-pointer rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
                      一键回收
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stash.map(({ item, qty, sell }) => (
                      <span key={item.id} title={`${item.name}｜回收 ${sell}｜面值 ${item.baseValue}`}
                        className={`inline-flex items-center gap-1 rounded-lg border bg-white/60 px-2 py-1 text-[11px] dark:bg-white/5 ${RARITY_CLS[item.rarity]}`}>
                        <span className="text-base">{item.emoji ?? "📦"}</span>
                        <span className="text-zinc-700 dark:text-zinc-200">{item.name}</span>
                        {qty > 1 && <span className="tabular-nums font-semibold">×{qty}</span>}
                        <span className="tabular-nums opacity-70">{sell}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "codex" && (
            <section className={`${CARD} p-5`}>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">物品图鉴（{content.items.length} 件）</h2>
              {(["legendary", "epic", "rare", "uncommon", "common"] as Rarity[]).map((r) => {
                const arr = content.items.filter((i) => i.rarity === r)
                if (!arr.length) return null
                return (
                  <div key={r} className="mb-3">
                    <div className={`mb-1.5 text-xs font-medium ${RARITY_CLS[r].split(" ")[0]}`}>{RARITY_LABEL[r]}（{arr.length}）</div>
                    <div className="flex flex-wrap gap-1.5">
                      {arr.map((it: LootItem) => (
                        <span key={it.id} title={`${it.name}｜面值 ${it.baseValue}`}
                          className={`inline-flex items-center gap-1 rounded-lg border bg-white/60 px-2 py-1 text-[11px] dark:bg-white/5 ${RARITY_CLS[r]}`}>
                          <span className="text-base">{it.emoji ?? "📦"}</span>
                          <span className="text-zinc-700 dark:text-zinc-200">{it.name}</span>
                          <span className="tabular-nums opacity-70">{it.baseValue}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          <p className="text-center text-[11px] leading-relaxed text-zinc-400">
            带钱进图 → 摸容器 → 自己决定什么时候跑。撤离成功物品进仓库（可回收换币），
            超时 / 风险爆表 / 主动放弃都会丢掉整包。内容与数值全部来自后台配置。
          </p>
        </div>
      )}
    </div>
  )
}
