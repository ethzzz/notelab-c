"use client"

// 摸金行动（Loot Raid）· C 端页面
//
// ⚠️ W1 状态（2026-10-03）：内容管线已打通 —— 本页从 /api/c/loot/content 读**已发布**内容
// （未发布/接口挂掉则回落内置默认包），并用引擎真实跑一次抽取，证明「B 端配 → C 端消费」闭环可用。
// 完整的进图循环（门槛 / 背包 / 风险 / 撤离 / 结算 / 仓库 / 回收）在 W2 接入，届时替换本页主体。
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  loadLootContent, type LoadedLoot,
} from "@/lib/loot-content"
import {
  RARITY_LABEL, expandMapContainers, findTable, indexItems, mulberry32, newSeed, searchContainer,
  type LootContent, type LootItem, type LootMap, type Rarity,
} from "@/lib/loot-engine"

/** 稀有度配色（普通灰 → 传说金，与后台 Tag 色保持一致） */
const RARITY_CLS: Record<Rarity, string> = {
  common: "text-zinc-500 border-zinc-300 dark:border-zinc-600",
  uncommon: "text-emerald-600 border-emerald-300 dark:border-emerald-700",
  rare: "text-sky-600 border-sky-300 dark:border-sky-700",
  epic: "text-violet-600 border-violet-300 dark:border-violet-700",
  legendary: "text-amber-600 border-amber-300 dark:border-amber-700",
}

interface Roll {
  mapName: string
  containerName: string
  slots: (LootItem | null)[]
  seedText: string
}

export default function LootPage() {
  const [data, setData] = useState<LoadedLoot | null>(null)
  const [roll, setRoll] = useState<Roll | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadLootContent().then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [])

  const content: LootContent | null = data?.content ?? null
  const itemsById = useMemo(() => (content ? indexItems(content.items) : new Map<string, LootItem>()), [content])

  /** 试摸：从该图容器配比里随机挑一个容器，用引擎真跑一次（第 1 版：不含背包/风险结算） */
  const tryRoll = useCallback((map: LootMap) => {
    if (!content) return
    setBusy(true)
    try {
      const insts = expandMapContainers(map, content.containers)
      if (!insts.length) { setRoll({ mapName: map.name, containerName: "（该图未配置容器）", slots: [], seedText: "" }); return }
      const seed = newSeed()
      const rng = mulberry32(seed)
      const ctn = insts[Math.floor(rng() * insts.length)]
      const table = findTable(content.tables, ctn.tableId)
      const res = searchContainer({ container: ctn, table, itemsById, rng, tierBoost: map.tierBoost })
      setRoll({
        mapName: map.name,
        containerName: `${ctn.emoji ?? "📦"} ${ctn.name}`,
        slots: res.picks,
        seedText: String(seed),
      })
    } finally {
      setBusy(false)
    }
  }, [content, itemsById])

  if (!data || !content) {
    return (
      <div className="grid min-h-full place-items-center pt-16">
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-amber-500 border-t-transparent" />
          <span className="text-sm font-medium">正在载入摸金行动内容…</span>
        </div>
      </div>
    )
  }

  const byRarity = content.items.reduce<Record<string, LootItem[]>>((m, it) => {
    (m[it.rarity] ||= []).push(it)
    return m
  }, {})

  return (
    <div className="mx-auto min-h-full w-full max-w-4xl px-4 pb-12 pt-16">
      {/* 头部 */}
      <header className="flex flex-col items-center gap-2 pb-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-3xl shadow-lg shadow-amber-500/30">🪙</span>
        <h1 className="text-2xl font-black tracking-wide text-zinc-800 dark:text-zinc-100">摸金行动</h1>
        <p className="max-w-lg text-xs leading-relaxed text-zinc-500">
          带装备进图 → 在容器里摸 → 决定什么时候跑；撤离成功物品进仓库，失败全丢。
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2.5 py-0.5 font-medium ${data.source === "published"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            {data.source === "published" ? "内容来自后台已发布配置" : "后台未发布 · 使用内置默认内容"}
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            W1 · 内容管线已通，进图循环 W2 接入
          </span>
        </div>
      </header>

      {/* 地图 */}
      <section className="grid gap-4 sm:grid-cols-2">
        {content.maps.map((m) => (
          <div key={m.id} className="rounded-2xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">🗺️ {m.name}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                门槛 💰{m.entry.coins}
                {m.entry.minExtracts > 0 && ` · 撤离${m.entry.minExtracts}次`}
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
            <button onClick={() => tryRoll(m)} disabled={busy}
              className="mt-4 w-full cursor-pointer rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
              试摸一次（看看能出什么）
            </button>
          </div>
        ))}
      </section>

      {/* 试摸结果 */}
      {roll && (
        <section className="mt-5 rounded-2xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {roll.mapName} · 你打开了 {roll.containerName}
            </span>
            {roll.seedText && <span className="text-[11px] text-zinc-400">种子 {roll.seedText}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {roll.slots.length === 0 && <span className="text-sm text-zinc-400">该容器暂无产出</span>}
            {roll.slots.map((it, i) => it ? (
              <div key={i} className={`flex items-center gap-2 rounded-xl border bg-white/80 px-3 py-2 dark:bg-white/5 ${RARITY_CLS[it.rarity]}`}>
                <span className="text-2xl">{it.emoji ?? "📦"}</span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{it.name}</span>
                  <span className="text-[11px] opacity-80">{RARITY_LABEL[it.rarity]} · 面值 {it.baseValue}</span>
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-zinc-400 dark:border-zinc-600">
                <span className="text-2xl">🕸️</span>
                <span className="text-xs">空手</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-zinc-400">
            结算展示价 = 面值 × 地图价值倍率（本图 {content.maps.find((m) => m.name === roll.mapName)?.valueMult ?? "?"}×）。
            出货总面值：{roll.slots.reduce((s, it) => s + (it ? it.baseValue : 0), 0)}
          </p>
        </section>
      )}

      {/* 物品图鉴 */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">物品图鉴（{content.items.length} 件）</h2>
        {(["legendary", "epic", "rare", "uncommon", "common"] as Rarity[]).map((r) => (
          <div key={r} className="mb-3">
            <div className={`mb-1.5 text-xs font-medium ${RARITY_CLS[r].split(" ")[0]}`}>{RARITY_LABEL[r]}（{byRarity[r]?.length ?? 0}）</div>
            <div className="flex flex-wrap gap-1.5">
              {(byRarity[r] ?? []).map((it) => (
                <span key={it.id} title={`${it.name}｜面值 ${it.baseValue}`}
                  className={`inline-flex items-center gap-1 rounded-lg border bg-white/60 px-2 py-1 text-[11px] dark:bg-white/5 ${RARITY_CLS[r]}`}>
                  <span className="text-base">{it.emoji ?? "📦"}</span>
                  <span className="text-zinc-700 dark:text-zinc-200">{it.name}</span>
                  <span className="tabular-nums opacity-70">{it.baseValue}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-400">
        本页为 W1 内容管线验证页：以上数据全部来自后台配置（未配置则用内置默认），
        抽取用真实引擎（mulberry32 确定性 RNG）跑出。完整玩法（进图 / 背包 / 风险 / 撤离 / 结算）将在 W2 上线。
      </p>
    </div>
  )
}
