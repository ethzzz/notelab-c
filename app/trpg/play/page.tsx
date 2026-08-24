"use client"
import { useCallback, useEffect, useState } from "react"
import { api, apiJson } from "@/lib/api"
import { toast } from "sonner"
import Modal from "@/components/ui/modal"
import TypingText from "@/components/TypingText"
import { confirmDialog } from "@/components/ui/confirm"
import type { Choice, DiceResult, PlayPayload, ScenarioRow } from "@/lib/trpg"
import { BookOpen, ChevronLeft, ChevronRight, RotateCcw, Trash2 } from "lucide-react"

export default function TrpgPlayPage() {
  const [plays, setPlays] = useState<any[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [play, setPlay] = useState<PlayPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [typingDone, setTypingDone] = useState(false)
  const [rolling, setRolling] = useState<{ text: string; result?: DiceResult } | null>(null)
  /** 时间轴位置：0..history.length，等于 history.length 表示"现在"（当前节点） */
  const [pos, setPos] = useState(0)
  /** 已完成打字动画的节点 key 集合，来回翻阅时不重复打字 */
  const [typedKeys, setTypedKeys] = useState<Set<string>>(new Set())

  const loadPlays = useCallback(() => {
    apiJson("/api/c/trpg/plays").then((j) => setPlays(j.plays || [])).catch(() => {})
  }, [])
  useEffect(() => { loadPlays() }, [loadPlays])

  async function start(id: number) {
    setBusy(true)
    try {
      const j = await apiJson(`/api/c/trpg/scenarios/${id}/play`, { method: "POST" })
      setPlay(j); setPos(0); setTypingDone(false); setPickerOpen(false)
    } catch (e: any) { toast.error(e.message || "开局失败") }
    setBusy(false)
  }
  async function resume(pid: number) {
    setBusy(true)
    try {
      const j = await apiJson(`/api/c/trpg/plays/${pid}`)
      setPlay(j); setPos(j.history?.length || 0); setTypingDone(false); setPickerOpen(false)
    } catch (e: any) { toast.error(e.message || "加载失败") }
    setBusy(false)
  }
  async function choose(c: Choice) {
    if (!play || busy) return
    setBusy(true)
    try {
      if (c.dice) {
        setRolling({ text: c.text })
        await new Promise((r) => setTimeout(r, 1100)) // 骰子动画（服务端权威掷骰）
        const j: PlayPayload = await apiJson(`/api/c/trpg/plays/${play.play_id}/choose`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice_id: c.id }),
        })
        const last = j.history && j.history.length ? j.history[j.history.length - 1] : null
        setRolling({ text: c.text, result: last?.dice })
        await new Promise((r) => setTimeout(r, 1700))
        setRolling(null)
        setPlay(j); setPos(j.history?.length || 0); setTypingDone(false)
        loadPlays()
        return
      }
      const j = await apiJson(`/api/c/trpg/plays/${play.play_id}/choose`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice_id: c.id }),
      })
      setPlay(j); setPos(j.history?.length || 0); setTypingDone(false)
      loadPlays()
    } catch (e: any) {
      toast.error(e.message || "操作失败")
      setRolling(null)
    } finally {
      setBusy(false)
    }
  }
  async function abandon() {
    if (!play) return
    const ok = await confirmDialog({ title: "放弃对局", message: "放弃后当前进度将被删除，确定吗？", confirmText: "放弃" })
    if (!ok) return
    try { await api(`/api/c/trpg/plays/${play.play_id}`, { method: "DELETE" }) } catch { /* ignore */ }
    setPlay(null); setPos(0); loadPlays()
  }
  async function removePlay(pid: number) {
    const ok = await confirmDialog({ message: "删除这条对局记录？", confirmText: "删除" })
    if (!ok) return
    try { await api(`/api/c/trpg/plays/${pid}`, { method: "DELETE" }); loadPlays() } catch { /* ignore */ }
  }
  async function openPicker() {
    try {
      const j = await apiJson("/api/c/trpg/scenarios")
      setScenarios(j.scenarios || [])
      setPickerOpen(true)
    } catch { setPickerOpen(true) }
  }

  // 支持从生成页「开玩」跳转：/trpg/play?sid=X 直接开局
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("sid")
    if (sid) {
      start(Number(sid))
      window.history.replaceState(null, "", "/trpg/play")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const histLen = play?.history?.length || 0
  const atPresent = pos >= histLen
  const ended = play?.state === "ended"
  const node = play?.node
  const nodeKey = play ? `${play.play_id}:${node?.id}:${play.steps}` : ""
  const alreadyTyped = typedKeys.has(nodeKey)
  const showActions = atPresent && (typingDone || alreadyTyped)
  const onTyped = () => { setTypingDone(true); setTypedKeys((s: Set<string>) => new Set(s).add(nodeKey)) }
  const nav = (d: number) => { setPos((p: number) => Math.max(0, Math.min(histLen, p + d))); setTypingDone(false) }

  const iconBtn = "grid h-8 w-8 place-items-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"

  return (
    <div className="relative w-full h-[calc(100dvh-140px)] min-h-[560px] rounded-3xl overflow-hidden flex items-center justify-center"
      style={{ background: "radial-gradient(120% 90% at 50% 0%, #2c2352 0%, #191430 48%, #0b0916 100%)" }}>
      <style>{`
        @keyframes trpg-fog { 0%,100% { transform: translate(0,0) scale(1); opacity:.45 } 50% { transform: translate(26px,-18px) scale(1.15); opacity:.7 } }
        @keyframes trpg-flicker { 0%,100% { opacity:.35 } 42% { opacity:.55 } 60% { opacity:.3 } 78% { opacity:.5 } }
      `}</style>
      {/* 氛围背景：漂浮雾团 + 底部烛光 + 暗角 */}
      <div className="pointer-events-none absolute -top-24 -left-20 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" style={{ animation: "trpg-fog 9s ease-in-out infinite" }} />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" style={{ animation: "trpg-fog 13s ease-in-out infinite reverse" }} />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-44 w-[420px] rounded-full bg-amber-500/10 blur-3xl" style={{ animation: "trpg-flicker 4.5s ease-in-out infinite" }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,.55) 100%)" }} />

      {/* 手机式容器 */}
      <div className="relative z-10 flex h-[92%] max-h-[780px] w-full max-w-[400px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#12101d]/90 shadow-2xl shadow-black/60 backdrop-blur">
        {/* 顶部操作区 */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-0.5">
            <button className={iconBtn} onClick={() => nav(-1)} disabled={!play || busy || pos <= 0} title="回顾上一幕">
              <ChevronLeft size={17} />
            </button>
            <button className={iconBtn} onClick={() => nav(1)} disabled={!play || busy || atPresent} title="回到当前">
              <ChevronRight size={17} />
            </button>
            {play && <span className="ml-1.5 text-[10px] tabular-nums text-zinc-500">{Math.min(pos + 1, histLen + 1)} / {histLen + 1}</span>}
          </div>
          <button className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-indigo-400/50 hover:text-white"
            onClick={openPicker}>
            <BookOpen size={13} /> 剧本
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!play && (
            /* ---- 欢迎页 ---- */
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl">🎲</span>
              <div className="text-lg font-bold text-zinc-100">剧本跑团</div>
              <div className="text-xs leading-relaxed text-zinc-400">挑一个剧本，开始你的冒险<br />每一次选择，都将左右命运的走向</div>
              <button className="mt-2 flex items-center gap-1.5 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/50 transition hover:bg-indigo-400"
                onClick={openPicker}>
                <BookOpen size={15} /> 选择剧本
              </button>
              {plays.length > 0 && (
                <div className="mt-5 w-full">
                  <div className="mb-2 text-[11px] text-zinc-500">最近对局</div>
                  <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-0.5">
                    {plays.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <button className="min-w-0 flex-1 text-left" onClick={() => resume(p.id)} disabled={busy}>
                          <div className="truncate text-xs text-zinc-200">{p.scenario_title}</div>
                          <div className="text-[10px] text-zinc-500">{p.steps} 步 · {p.state === "ended" ? `已结局${p.ending_title ? ` · ${p.ending_title}` : ""}` : "进行中"}</div>
                        </button>
                        <button className="text-zinc-600 transition-colors hover:text-red-400" onClick={() => removePlay(p.id)}><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {play && !atPresent && (() => {
            /* ---- 历史回顾：该幕剧情文本 + 当时全部选项（已选项高亮，其余置灰不可点） ---- */
            const h = play.history[pos]
            const hn = h.node
            return (
              <div className="flex flex-col gap-3">
                <div className="text-center text-[10px] tracking-[0.25em] text-indigo-300/60">— 回忆 · 第 {pos + 1} 幕 —</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-2 text-xs font-semibold text-indigo-300">◈ {hn?.title || h.node_title}</div>
                  {hn?.text && <div className="text-sm leading-7 text-zinc-300">{hn.text}</div>}
                </div>
                <div className="text-[11px] text-zinc-500">当时的抉择：</div>
                <div className="flex flex-col gap-2">
                  {(hn?.choices && hn.choices.length > 0 ? hn.choices : [{ id: "", text: h.choice }]).map((c) => {
                    const picked = c.text === h.choice
                    return (
                      <div key={c.id || h.choice}
                        className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${picked
                          ? "border-emerald-400/40 bg-emerald-400/10 text-zinc-100"
                          : "border-white/5 bg-white/[0.02] text-zinc-500 opacity-60"}`}>
                        <span className="mr-1.5">{picked ? "✅" : "👉"}</span>{c.text}
                        {c.dice && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${picked ? "bg-violet-400/15 text-violet-300" : "bg-white/5 text-zinc-500"}`}>🎲 检定 ≤{c.dice.target}</span>}
                        {picked && <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-300">你的选择</span>}
                      </div>
                    )
                  })}
                  {h.dice && (
                    <div className={`mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[11px] ${h.dice.success ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                      🎲 掷出 {h.dice.roll} / 目标 {h.dice.target} · {h.dice.success ? "成功" : "失败"}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {play && atPresent && (
            /* ---- 当前节点 ---- */
            <div>
              {ended && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
                  <span className="text-lg">🏁</span>
                  <span className="text-sm font-semibold text-amber-200">{play.ending_title || "结局"}</span>
                </div>
              )}
              {!ended && node?.title && <div className="mb-2 text-xs font-semibold tracking-wide text-indigo-300">◈ {node.title}</div>}
              <div className="text-sm leading-7 text-zinc-200">
                {alreadyTyped
                  ? node?.text
                  : <TypingText key={nodeKey} text={node?.text || ""} done onFinished={onTyped} />}
              </div>

              {!ended && showActions && (
                <div className="mt-4 flex flex-col gap-2">
                  <div className="text-[11px] text-zinc-500">你的行动：</div>
                  {(node?.choices || []).map((c) => (
                    <button key={c.id} onClick={() => choose(c)} disabled={busy}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-zinc-200 transition-all hover:border-indigo-400/60 hover:bg-indigo-400/10 disabled:opacity-50">
                      <span className="mr-1.5">👉</span>{c.text}
                      {c.dice && <span className="ml-2 rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] text-violet-300">🎲 检定 ≤{c.dice.target}</span>}
                    </button>
                  ))}
                  <button className="mx-auto mt-3 text-[11px] text-zinc-600 transition-colors hover:text-red-400" onClick={abandon}>放弃对局</button>
                </div>
              )}

              {ended && showActions && (
                <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5 text-center">
                  <span className="text-3xl">🎉</span>
                  <div className="text-sm font-bold text-amber-200">{play.ending_title || "冒险结束"}</div>
                  <div className="text-[11px] leading-relaxed text-zinc-400">本次冒险共 {play.steps} 步 · 感谢游玩<br />可用左上角 ← → 回顾整段旅程</div>
                  <div className="mt-1 flex gap-2">
                    <button className="flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
                      onClick={() => start(play.scenario_id)} disabled={busy}>
                      <RotateCcw size={13} /> 重来一次
                    </button>
                    <button className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-indigo-400/50"
                      onClick={openPicker}>
                      <BookOpen size={13} /> 选择剧本
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 掷骰动画 */}
      {rolling && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-2xl">
            {!rolling.result ? (
              <>
                <span className="animate-spin text-6xl" style={{ animationDuration: "0.9s" }}>🎲</span>
                <div className="text-sm font-semibold text-zinc-700">命运的骰子正在滚动…</div>
                <div className="text-center text-xs text-zinc-400">{rolling.text}</div>
              </>
            ) : (
              <>
                <div className={`text-5xl font-black ${rolling.result.success ? "text-emerald-500" : "text-red-500"}`}>{rolling.result.roll}</div>
                <div className="text-xs text-zinc-400">d100 ≤ {rolling.result.target}</div>
                <div className={`text-base font-bold ${rolling.result.success ? "text-emerald-600" : "text-red-500"}`}>
                  {rolling.result.success ? "✨ 检定成功！" : "💥 检定失败…"}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 选择剧本弹窗（含继续对局入口） */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="📚 选择剧本" maxW="max-w-xl">
        {plays.filter((p) => p.state === "playing").length > 0 && (
          <>
            <div className="mb-2 text-xs font-semibold text-zinc-500">继续冒险</div>
            <div className="mb-4 flex flex-col gap-2">
              {plays.filter((p) => p.state === "playing").map((p) => (
                <button key={p.id} onClick={() => resume(p.id)} disabled={busy}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-left transition-all hover:border-emerald-400 hover:shadow-sm disabled:opacity-60">
                  <span className="text-sm font-medium text-emerald-700">▶ {p.scenario_title}</span>
                  <span className="ml-2 text-[11px] text-zinc-400">进行中 · {p.steps} 步</span>
                </button>
              ))}
            </div>
            <div className="mb-2 text-xs font-semibold text-zinc-500">开始新冒险</div>
          </>
        )}
        {scenarios.length === 0 && (
          <div className="py-10 text-center text-sm text-zinc-400">还没有发布的剧本，敬请期待</div>
        )}
        <div className="flex flex-col gap-2">
          {scenarios.map((s) => (
            <button key={s.id} onClick={() => start(s.id)} disabled={busy}
              className="rounded-xl border border-black/5 bg-white/70 px-4 py-3 text-left transition-all hover:border-indigo-300 hover:shadow-sm disabled:opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-800">📜 {s.title}</span>
                {s.genre && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-600">{s.genre}</span>}
                <span className="ml-auto text-[11px] text-zinc-400">{String(s.created_at || "").slice(0, 10)}</span>
              </div>
              {s.summary && <p className="mt-1.5 line-clamp-2 text-xs text-zinc-500">{s.summary}</p>}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
