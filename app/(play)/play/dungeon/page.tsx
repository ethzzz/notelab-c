"use client"

// 《地牢领主》主界面（M1 存档/离线/房间 · M2 派遣探索）
//
// 设计约定：
// - 存档一律走 lib/dungeon.ts（登录态 MySQL / 游客 localStorage），页面不直接碰接口；
// - 每次改动**防抖 800ms** 后落库，避免连点升级把请求打爆；
// - 离线收益只在读档那一刻结算一次，结算完立即回写（刷新 lastSeen，防止重复领）；
// - 派遣的一切时间都用**服务端时钟**（lib/dungeon 的 serverNow()），结算还要过服务端闸门，
//   所以改本机时间既不能让队伍提前回来，也领不到战利品。
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Clock, HardDriveDownload, Swords } from "lucide-react"
import {
  FLOORS, FLOOR_BY_ID, ROOMS, collectDispatch, fmtDuration, floorUnlocked, goldPerSec, loadDungeon,
  newSave, partyCap, partyReady, planDispatch, saveDungeon, serverNow, settleDispatch,
  startDispatch, tickSave, upgradeRoom,
  type DungeonSave, type OfflineResult, type Party, type PartyResult, type RoomKey,
} from "@/lib/dungeon"
import { track } from "@/lib/track"

/** 倒计时：3:07 这种精确到秒的格式（fmtDuration 只到分，不够做倒计时） */
function fmtLeft(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function DungeonPage() {
  const [save, setSave] = useState<DungeonSave | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState<OfflineResult | null>(null)
  const [guest, setGuest] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // M2：派遣面板状态
  const [floor, setFloor] = useState(1)
  const [picked, setPicked] = useState<string[]>([])
  const [result, setResult] = useState<PartyResult | null>(null)
  const [, setTick] = useState(0)
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

  // 每秒走一格：刷新派遣倒计时，顺带把养伤到期的英雄放回待命
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!save) return
    const t = tickSave(save)
    if (t.changed) { setSave(t.save); void persist(t.save) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save])

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

  const toggleHero = (uid: string) => {
    setPicked((list) => {
      if (list.includes(uid)) return list.filter((x) => x !== uid)
      if (!save || list.length >= partyCap(save)) return list
      return [...list, uid]
    })
  }

  const onDispatch = () => {
    if (!save) return
    const r = startDispatch(save, picked, floor)
    if (!r) { setErr("没能派出队伍：检查人数上限、英雄是否待命、层是否已解锁"); return }
    setSave(r.save)
    setPicked([])
    setErr(null)
    void persist(r.save, true)
    // 埋点（PRD-P0 §4.2）：派出一次队伍 = 本局真正开始（看板/选人都不算）
    track("game_start", { game_code: "dungeon" })
  }

  /** 回收：先过服务端闸门（登录态），再在本地按规则结算并回写 */
  const onCollect = async (p: Party) => {
    if (!save) return
    const gate = await collectDispatch(p.id)
    if (!gate.ok) { setErr(gate.error || "结算失败"); return }
    const r = settleDispatch(save, p.id)
    if (!r) { setErr("这队无法结算"); return }
    setSave(r.save)
    setResult(r.result)
    setErr(null)
    void persist(r.save, true)
  }

  if (loading || !save) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-zinc-500">读取地牢档案…</div>
    )
  }

  const gps = goldPerSec(save)
  const now = serverNow()
  const running = save.parties.filter((p) => !p.collected)
  const plan = planDispatch(save, picked, floor)

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-16">
      {/* 标题栏（2026-10-02：不再自带「← 游戏中心」返回——PlayShell 的 HUD 已常驻同一入口，
          这里再放一枚就是双份返回；顶部也不再叠 pt-8，根容器的 pt-16 已经给 HUD 让过位） */}
      <div className="flex flex-wrap items-center gap-3 pb-5">
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

      {/* 上一次派遣的结算 */}
      {result && (
        <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <Swords size={16} />
          <b>{result.grade}</b>：带回 <b>{result.gold}</b> 金币
          {result.stone > 0 ? <> 、<b>{result.stone}</b> 石料</> : null}
          {result.exp > 0 ? <> 、<b>{result.exp}</b> 经验</> : null}
          {result.wounded.length > 0 ? <span className="text-orange-600"> · {result.wounded.length} 人受伤休整中</span> : null}
        </div>
      )}

      {/* 资源条 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-5 py-3 shadow-sm backdrop-blur-md">
        <span className="text-sm font-semibold text-amber-700">🪙 金币 {Math.floor(save.res.gold)}</span>
        <span className="text-sm font-semibold text-zinc-600">🪨 石料 {save.res.stone}</span>
        <span className="text-xs text-zinc-400">每秒 +{gps.toFixed(2)} 金币</span>
        <span className="ml-auto text-xs text-zinc-400">最深 {save.stats.deepestFloor} 层 · 出征 {save.stats.runs} 次</span>
      </div>

      {/* 派遣探索：选层 + 编队 + 出发 / 出征中倒计时 */}
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">派遣探索</h2>

      {running.length > 0 && (
        <div className="mb-3 space-y-2">
          {running.map((p) => (
            <PartyCard key={p.id} party={p} nowMs={now} onCollect={() => void onCollect(p)} />
          ))}
        </div>
      )}

      <div className="card mb-6 border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>选择目标层（打通第 N 层解锁第 N+1 层）</span>
          <span className="ml-auto">出征上限 {partyCap(save)} 人（营房 Lv.{save.rooms.barracks?.lv || 0}）</span>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FLOORS.map((f) => {
            const unlocked = floorUnlocked(save, f.floor)
            const cleared = save.stats.deepestFloor >= f.floor
            const on = floor === f.floor
            return (
              <button
                key={f.floor}
                disabled={!unlocked}
                onClick={() => setFloor(f.floor)}
                className={`rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-black/10 bg-white/60 hover:border-zinc-400"}`}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span>{f.icon}</span>
                  <span>第 {f.floor} 层 · {f.name}</span>
                  {cleared && <span className="text-[10px] text-emerald-500">✓</span>}
                  {!unlocked && <span className="text-[10px]">🔒</span>}
                </div>
                <div className={`mt-0.5 text-[11px] ${on ? "text-white/70" : "text-zinc-500"}`}>
                  需战力 {f.power} · {fmtDuration(f.seconds)} · 🪙{f.gold}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mb-3 text-xs text-zinc-500">点选待命的英雄组队（已出征/养伤的不能上阵）</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {save.heroes.map((h) => {
            const on = picked.includes(h.uid)
            const can = h.state === "idle"
            return (
              <button
                key={h.uid}
                disabled={!can && !on}
                onClick={() => toggleHero(h.uid)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-indigo-500 bg-indigo-50" : "border-black/10 bg-white/60 hover:border-zinc-400"}`}
              >
                <span>{h.icon}</span>
                <span className="font-semibold text-zinc-700">{h.name}</span>
                <span className="text-zinc-400">Lv.{h.lv}</span>
              </button>
            )
          })}
        </div>

        {plan ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs">
            <span className="text-zinc-500">队伍战力 <b className="text-zinc-800">{plan.power}</b> / 需求 {plan.floor.power}</span>
            <span className={`rounded px-1.5 py-0.5 font-semibold ${plan.ratio >= 1.5 ? "bg-emerald-100 text-emerald-700" : plan.ratio >= 1 ? "bg-amber-100 text-amber-700" : plan.ratio >= 0.75 ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
              预计 {plan.grade}（{plan.ratio.toFixed(2)}×）
            </span>
            <span className="text-zinc-400">往返 {fmtDuration(plan.floor.seconds)}</span>
          </div>
        ) : (
          <div className="mb-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-400">先选至少一位待命的英雄</div>
        )}

        <button
          disabled={!plan || picked.length === 0}
          onClick={onDispatch}
          className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          ⛏️ 出发 · 第 {floor} 层
        </button>
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
        {save.heroes.map((h) => {
          const resting = h.state === "rest" && h.restUntil ? Math.max(0, Math.ceil((h.restUntil - now) / 1000)) : 0
          return (
            <div key={h.uid} className="card flex items-center gap-3 border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              <span className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-xl ${h.state === "idle" ? "from-indigo-50 to-violet-100" : "from-zinc-100 to-zinc-200 opacity-70"}`}>{h.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-800">{h.name}</div>
                <div className="text-[11px] text-zinc-500">
                  Lv.{h.lv} · {h.state === "idle" ? "待命" : h.state === "rest" ? `养伤 ${fmtLeft(resting)}` : "出征中"}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={() => void persist(save, true)} className="text-xs text-zinc-400 underline">立即保存</button>
      </div>
    </div>
  )
}

/** 出征中的一队：进度条 + 倒计时 + 到期可结算 */
function PartyCard({ party, nowMs, onCollect }: { party: Party; nowMs: number; onCollect: () => void }) {
  const def = FLOOR_BY_ID[party.floor]
  const total = Math.max(1, party.endsAt - party.startedAt)
  const left = Math.max(0, Math.ceil((party.endsAt - nowMs) / 1000))
  const done = partyReady(party, nowMs)
  const pct = Math.min(100, Math.round(((nowMs - party.startedAt) / total) * 100))
  return (
    <div className="rounded-xl border border-black/5 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{def?.icon || "⛏️"}</span>
        <span className="font-semibold text-zinc-800">第 {party.floor} 层 · {def?.name || "未知"}</span>
        <span className="text-xs text-zinc-500">{party.members.length} 人出征</span>
        <span className={`ml-auto text-xs font-semibold ${done ? "text-emerald-600" : "text-zinc-500"}`}>
          {done ? "已归来，可结算" : `剩 ${fmtLeft(left)}`}
        </span>
        <button
          disabled={!done}
          onClick={onCollect}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          召回结算
        </button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full transition-all ${done ? "bg-emerald-500" : "bg-indigo-400"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
