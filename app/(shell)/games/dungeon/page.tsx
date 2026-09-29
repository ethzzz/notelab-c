"use client"

// 《地牢领主》主界面（M1：存档 + 离线结算 + 房间升级）
//
// 设计约定：
// - 存档一律走 lib/dungeon.ts（登录态 MySQL / 游客 localStorage），页面不直接碰接口；
// - 每次改动**防抖 800ms** 后落库，避免连点升级把请求打爆；
// - 离线收益只在读档那一刻结算一次，结算完立即回写（刷新 lastSeen，防止重复领）。
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, HardDriveDownload } from "lucide-react"
import {
  ROOMS, fmtDuration, goldPerSec, loadDungeon, newSave, saveDungeon, upgradeRoom,
  type DungeonSave, type OfflineResult, type RoomKey,
} from "@/lib/dungeon"

export default function DungeonPage() {
  const [save, setSave] = useState<DungeonSave | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState<OfflineResult | null>(null)
  const [guest, setGuest] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 读档（含离线结算）；结算出收益就立刻回写，避免下次进来重复领
  useEffect(() => {
    let alive = true
    loadDungeon().then((r) => {
      if (!alive) return
      setSave(r.save)
      setOffline(r.offline)
      setGuest(r.guest)
      setLoading(false)
      if (r.offline) void persist(r.save, true)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = useCallback(async (s: DungeonSave, immediate = false) => {
    if (timer.current) clearTimeout(timer.current)
    const run = async () => {
      setSaving(true)
      const r = await saveDungeon(s)
      setSaving(false)
      if (r.ok) { setLastSavedAt(Date.now()); setErr(null) } else setErr(r.error || "保存失败")
    }
    if (immediate) return run()
    timer.current = setTimeout(run, 800)
    return undefined
  }, [])

  const onUpgrade = (key: RoomKey) => {
    if (!save) return
    const next = upgradeRoom(save, key)
    if (!next) return
    setSave(next)
    void persist(next)
  }

  if (loading || !save) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-zinc-500">读取地牢档案…</div>
    )
  }

  const gps = goldPerSec(save)

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* 标题栏 */}
      <div className="flex flex-wrap items-center gap-3 pt-8 pb-5">
        <Link href="/games" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700">
          <ArrowLeft size={16} /> 游戏中心
        </Link>
        <span className="text-2xl">🏰</span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-zinc-800">地牢领主</h1>
          <p className="text-xs text-zinc-500">经营你的地下城 · 派遣小队深入更深的层</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {saving
            ? <span className="text-amber-600">保存中…</span>
            : lastSavedAt
              ? <span className="flex items-center gap-1 text-zinc-400"><HardDriveDownload size={13} /> 已保存 {new Date(lastSavedAt).toLocaleTimeString("zh-CN")}</span>
              : <span className="text-zinc-400">尚未保存</span>}
        </div>
      </div>

      {guest && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          当前是<b>游客模式</b>，进度只存在这台设备的浏览器里。
          <Link href="/login" className="ml-1 underline">登录</Link>后自动转为云端存档，换设备也不会丢。
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">存档失败：{err}</div>
      )}

      {/* 离线收益 */}
      {offline && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Clock size={16} />
          离线 {fmtDuration(offline.seconds)}，地牢照常运转：收获 <b>{offline.gold}</b> 金币
          {offline.stone > 0 ? <> 、<b>{offline.stone}</b> 石料</> : null}
        </div>
      )}

      {/* 资源条 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-5 py-3 shadow-sm backdrop-blur-md">
        <span className="text-sm font-semibold text-amber-700">🪙 金币 {Math.floor(save.res.gold)}</span>
        <span className="text-sm font-semibold text-zinc-600">🪨 石料 {save.res.stone}</span>
        <span className="text-xs text-zinc-400">每秒 +{gps.toFixed(2)} 金币</span>
        <span className="ml-auto text-xs text-zinc-400">最深 {save.stats.deepestFloor} 层 · 出征 {save.stats.runs} 次</span>
      </div>

      {/* 房间 */}
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">地牢设施</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROOMS.map((r) => {
          const lv = save.rooms[r.key]?.lv || 0
          const cost = r.cost(lv)
          const afford = save.res.gold >= cost
          return (
            <div key={r.key} className="card flex flex-col gap-2 border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 text-xl">{r.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-zinc-800">{r.name}</div>
                  <div className="text-[11px] text-zinc-500">Lv.{lv}{r.rate(lv) > 0 ? ` · +${r.rate(lv).toFixed(2)}/秒` : ""}</div>
                </div>
              </div>
              <p className="flex-1 text-[12px] leading-relaxed text-zinc-500">{r.desc}</p>
              <button
                disabled={!afford}
                onClick={() => onUpgrade(r.key)}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                升级 · 🪙 {cost}
              </button>
            </div>
          )
        })}
      </div>

      {/* 英雄 */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-zinc-700">麾下英雄</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {save.heroes.map((h) => (
          <div key={h.uid} className="card flex items-center gap-3 border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 text-xl">{h.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-zinc-800">{h.name}</div>
              <div className="text-[11px] text-zinc-500">Lv.{h.lv} · {h.state === "idle" ? "待命" : h.state === "rest" ? "休整" : "出征中"}</div>
            </div>
          </div>
        ))}
      </div>

      {/* M2 占位：把"还没做但也该让玩家知道"的东西摆出来 */}
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white/40 px-5 py-6 text-center">
        <div className="text-sm font-semibold text-zinc-600">⛏️ 派遣探索（即将开放）</div>
        <p className="mt-1 text-xs text-zinc-500">
          组建小队深入第 1–10 层，按真实时间推进，归来带回战利品与图鉴记录。
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={() => void persist(save, true)} className="text-xs text-zinc-400 underline">立即保存</button>
      </div>
    </div>
  )
}
