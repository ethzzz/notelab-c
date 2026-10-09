"use client"
// 每日英语翻译练习（主页「工具」tab 下的一个工具，/tools/translate）：每天 0 点后端激活一组中文句子，
// 按 3 阶梯逐句提交英文译文 → 大模型判分。
// 取数/回填 GET /api/translate/today；提交 POST /api/translate/submit（同人同日同句覆盖，可反复重交）。
// 登录墙：原本由 app/(shell)/utils/translate/layout.tsx 的 <RequireAuth> 负责，2026-10-10 工具搬进
// 主页内容区后 layout 不存在了，改由组件内的 useRequireAuth() 自己守卫（未登录 → /login，登录后回跳本页）。
// 页面标题由主页内容区顶栏显示，所以这里不再渲染自己的 <h1>。
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { apiJson, postJson } from "@/lib/api"
import { useRequireAuth } from "@/lib/auth"
import { track } from "@/lib/track"
import {
  MODE_LABEL, TIER_STYLE, modeOf,
  type DailyRow, type ErrorTypeRow, type ProgressPayload,
  type Sentence, type Submission, type TodayPayload,
} from "@/lib/translate"
import { BarChart3, Check, ChevronDown, ChevronUp, Flame, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react"

export default function TranslateTool() {
  const { state } = useRequireAuth()
  /** today = 今日练习；progress = 我的进度（习惯闭环） */
  const [tab, setTab] = useState<"today" | "progress">("today")
  const [data, setData] = useState<TodayPayload | null>(null)
  /** translate_day_open 只在本次挂载报一次（load() 在提交后还会被调用） */
  const dayOpenRef = useRef(false)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [progLoading, setProgLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  /** 各句输入框内容（key=sentence id） */
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  /** 各句本地判分结果（提交后即时展示；刷新页面由 /today 回填覆盖） */
  const [results, setResults] = useState<Record<number, Submission>>({})
  /** 正在判分的句子 id */
  const [busyId, setBusyId] = useState<number | null>(null)
  /** 折叠的阶梯 */
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const load = useCallback(() => {
    setLoading(true)
    apiJson<TodayPayload>("/api/translate/today")
      .then((j) => {
        setData(j)
        setLoadError("")
        // 埋点（PRD-P0 §4.2）：翻译页首载一次，has_today 用来判断「今天有没有可练习内容」
        if (!dayOpenRef.current) {
          dayOpenRef.current = true
          track("translate_day_open", { has_today: !!j.group })
        }
        // 回填：已提交句子的译文放回输入框，判分结果本地缓存一份（与后端一致）
        const nextDrafts: Record<number, string> = {}
        const nextResults: Record<number, Submission> = {}
        for (const s of j.sentences || []) {
          if (s.submission) {
            nextDrafts[s.id] = s.submission.en_text || ""
            nextResults[s.id] = s.submission
          }
        }
        setDrafts(nextDrafts)
        setResults(nextResults)
      })
      .catch((e: Error) => setLoadError(e.message || "加载今日练习失败"))
      .finally(() => setLoading(false))
  }, [])

  /** 进度数据：切到该 Tab 时拉取（提交后回到该 Tab 会重新拉） */
  const loadProgress = useCallback(() => {
    setProgLoading(true)
    apiJson<ProgressPayload>("/api/translate/progress?days=91")
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setProgLoading(false))
  }, [])

  useEffect(() => { if (state === "ok") load() }, [state, load])
  useEffect(() => { if (state === "ok" && tab === "progress") loadProgress() }, [state, tab, loadProgress])

  async function submit(s: Sentence) {
    const text = (drafts[s.id] || "").trim()
    if (!text) { toast.warning("请先输入英文译文"); return }
    setBusyId(s.id)
    try {
      const j = await postJson("/api/translate/submit", { sentence_id: s.id, en_text: text })
      const sub: Submission = {
        en_text: j.en_text, accurate: j.accurate, score: j.score,
        corrected: j.corrected, explanation: j.explanation, errors: j.errors || [],
        // 带上判分来源，前端据此标注是 AI 批改还是本地对照
        model: j.model ?? null,
      }
      setResults((r) => ({ ...r, [s.id]: sub }))
      setDrafts((d) => ({ ...d, [s.id]: j.en_text }))
      toast.success(j.accurate ? `翻译准确，得分 ${j.score}` : `已批改，得分 ${j.score}，看看讲解吧`)
    } catch (e: any) {
      toast.error(e.message || "判分失败，请重试")
    } finally {
      setBusyId(null)
    }
  }

  const sentences = data?.sentences || []
  const tiers = useMemo(() => {
    const list = data?.tiers?.length ? data.tiers : [
      { tier: 1, name: "简单", desc: "" }, { tier: 2, name: "中等", desc: "" }, { tier: 3, name: "困难", desc: "" },
    ]
    return list
      .map((t) => ({ ...t, items: sentences.filter((s) => s.tier === t.tier) }))
      .filter((t) => t.items.length > 0)
  }, [data, sentences])

  const doneCount = sentences.filter((s) => results[s.id]).length

  if (state !== "ok") {
    // 内嵌在主页内容区（不是整页），所以占位高度按内容区给，不用 100dvh 减去外壳高度那套算法
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-6">
      {/* ===== 头部：今日组标题 + 日期 + 进度（标题归主页顶栏，这里只留状态行） ===== */}
      <div className="mb-5 flex flex-col gap-2">
        {/* ===== Tab 切换 ===== */}
        <div className="mt-1 flex gap-1 rounded-2xl border border-black/5 bg-white/60 p-1 backdrop-blur-sm">
          {([
            ["today", "今日练习"] as const,
            ["progress", "我的进度"] as const,
          ]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                tab === key ? "bg-white text-indigo-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "progress" ? (
          <ProgressPanel data={progress} loading={progLoading} onRetry={loadProgress} />
        ) : data?.group ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-600">{data.group.title}</span>
            <span className="font-mono text-xs text-zinc-400">{data.date}</span>
            {sentences.length > 0 && (
              <span className="text-xs text-zinc-400">已完成 {doneCount} / {sentences.length} 句</span>
            )}
            <button onClick={load} disabled={loading}
              className="ml-auto inline-flex items-center gap-1 rounded-xl border border-black/5 bg-white/70 px-2.5 py-1 text-xs text-zinc-500 transition hover:bg-white disabled:opacity-50">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 刷新
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">每天 0 点更新一组新的中文句子，逐句翻译成英文即可自动批改</p>
        )}
      </div>

      {/* ===== 今日练习主体（「我的进度」Tab 下不渲染） ===== */}
      {tab === "today" && (<>

      {/* ===== 进度条 ===== */}
      {sentences.length > 0 && (
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${Math.round((doneCount / sentences.length) * 100)}%` }} />
        </div>
      )}

      {/* ===== 加载 / 错误 / 空态 ===== */}
      {loading && !data ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-white/60 py-16 backdrop-blur-sm">
          <Loader2 size={26} className="animate-spin text-indigo-500" />
          <span className="text-sm text-zinc-500">正在加载今日练习…</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-red-200/70 bg-red-50/60 py-14 backdrop-blur-sm">
          <span className="text-4xl">⚠️</span>
          <div className="text-sm font-semibold text-red-600">{loadError}</div>
          <button onClick={load} className="btn-ghost py-2 text-xs">重试</button>
        </div>
      ) : !data?.group || sentences.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-white/60 py-16 backdrop-blur-sm">
          <span className="text-5xl">📭</span>
          <div className="text-base font-semibold text-zinc-600">今日未更新</div>
          <div className="text-xs text-zinc-400">管理员还没有发布今天的句子组，稍后再来看看吧</div>
        </div>
      ) : (
        /* ===== 分阶梯句子列表 ===== */
        <div className="flex flex-col gap-5">
          {tiers.map((t) => {
            const isCollapsed = !!collapsed[t.tier]
            const done = t.items.filter((s) => results[s.id]).length
            return (
              <section key={t.tier}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [t.tier]: !c[t.tier] }))}
                  className="mb-2.5 flex w-full items-center gap-2 text-left">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TIER_STYLE[t.tier] || "bg-zinc-100 text-zinc-600"}`}>
                    {t.name}
                  </span>
                  {t.desc && <span className="hidden text-xs text-zinc-400 sm:inline">{t.desc}</span>}
                  <span className="ml-auto text-xs text-zinc-400">{done}/{t.items.length}</span>
                  {isCollapsed ? <ChevronDown size={15} className="text-zinc-400" /> : <ChevronUp size={15} className="text-zinc-400" />}
                </button>
                {!isCollapsed && (
                  <div className="flex flex-col gap-3">
                    {t.items.map((s, i) => (
                      <SentenceCard key={s.id} index={i + 1} sentence={s}
                        value={drafts[s.id] ?? ""}
                        result={results[s.id] ?? null}
                        busy={busyId === s.id}
                        onChange={(v) => setDrafts((d) => ({ ...d, [s.id]: v }))}
                        onSubmit={() => submit(s)} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      </>)}
    </div>
  )
}

/**
 * 「我的进度」面板：连续天数 / 累计 / 正确率 三个指标 + 打卡热力图 + 弱项分布。
 * 全部来自 GET /api/translate/progress（纯聚合，不依赖大模型）。
 */
function ProgressPanel({ data, loading, onRetry }: {
  data: ProgressPayload | null
  loading: boolean
  onRetry: () => void
}) {
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-white/60 py-16 backdrop-blur-sm">
        <Loader2 size={26} className="animate-spin text-indigo-500" />
        <span className="text-sm text-zinc-500">正在统计你的练习记录…</span>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-red-200/70 bg-red-50/60 py-14 backdrop-blur-sm">
        <span className="text-4xl">⚠️</span>
        <div className="text-sm font-semibold text-red-600">进度加载失败</div>
        <button onClick={onRetry} className="btn-ghost py-2 text-xs">重试</button>
      </div>
    )
  }

  const t = data.totals || { done: 0, correct: 0, active_days: 0, rate: 0 }
  const hasAny = t.done > 0

  return (
    <div className="flex flex-col gap-5">
      {/* 三个指标 */}
      <div className="grid grid-cols-3 gap-3">
        <Metric label="连续天数" value={data.streak} suffix="天" icon={<Flame size={14} className="text-orange-500" />} />
        <Metric label="累计练习" value={t.done} suffix="句" icon={<Check size={14} className="text-indigo-500" />} />
        <Metric label="正确率" value={t.rate} suffix="%" icon={<BarChart3 size={14} className="text-emerald-500" />} />
      </div>

      {/* 降级提示 */}
      {data.llm && !data.llm.available && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5 text-[13px] text-amber-700">
          AI 批改当前不可用（{data.llm.reason || "上游未就绪"}），已自动切换为本地对照判分，练习不受影响。
        </div>
      )}

      {!hasAny ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-white/60 py-16 backdrop-blur-sm">
          <span className="text-5xl">🌱</span>
          <div className="text-base font-semibold text-zinc-600">还没有练习记录</div>
          <div className="text-xs text-zinc-400">回到「今日练习」提交第一句，这里就会开始生长</div>
        </div>
      ) : (
        <>
          <Heatmap rows={data.daily} />
          <WeakPoints items={data.error_types || []} />
          <div className="text-center text-xs text-zinc-400">
            共活跃 {t.active_days} 天 · 判为准确 {t.correct} 句（近 {data.days} 天）
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, suffix, icon }: {
  label: string; value: number; suffix: string; icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/70 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        {icon}{label}
      </div>
      <div className="mt-1 text-xl font-black text-zinc-800">
        {value}<span className="ml-0.5 text-xs font-medium text-zinc-400">{suffix}</span>
      </div>
    </div>
  )
}

/** GitHub 风格打卡热力图：每天一格，颜色深浅 = 当天完成句数 */
function Heatmap({ rows }: { rows: DailyRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.done))
  // 按周分组（每列一周，自上而下 周日→周六）
  const cols: (DailyRow | null)[][] = []
  rows.forEach((r, i) => {
    const d = new Date(r.date + "T00:00:00")
    const wd = d.getDay()
    if (i === 0) for (let k = 0; k < wd; k++) cols.push([])
    let col = cols[cols.length - 1]
    if (!col) { col = []; cols.push(col) }
    col.push(r)
    if (wd === 6) cols.push([])
  })
  // 列数太多时只保留最近 26 周，避免溢出
  const shown = cols.slice(-26)

  return (
    <div className="rounded-3xl border border-black/5 bg-white/70 p-4 backdrop-blur-sm">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-zinc-700">
        打卡热力图
        <span className="ml-auto text-[11px] font-normal text-zinc-400">近 {rows.length} 天</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]">
          {shown.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }).map((_, ri) => {
                const r = col[ri] ?? null
                if (!r) return <div key={ri} className="h-3 w-3" />
                const lvl = r.done === 0 ? 0 : Math.min(4, Math.ceil((r.done / max) * 4))
                return (
                  <div key={ri} title={`${r.date}：完成 ${r.done} 句${r.total ? ` / ${r.total}` : ""}，准确 ${r.correct}`}
                    className={`h-3 w-3 rounded-[3px] ${HEAT[lvl]}`} />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span>少</span>
        {HEAT.map((c, i) => <span key={i} className={`h-3 w-3 rounded-[3px] ${c}`} />)}
        <span>多</span>
      </div>
    </div>
  )
}

const HEAT = ["bg-black/[0.06]", "bg-indigo-100", "bg-indigo-300", "bg-indigo-500", "bg-indigo-700"]

/** 弱项分布：按错误类型聚合的横向条 */
function WeakPoints({ items }: { items: ErrorTypeRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-black/5 bg-white/70 p-4 text-center text-sm text-zinc-500 backdrop-blur-sm">
        暂无错误记录 —— 继续保持
      </div>
    )
  }
  const max = Math.max(...items.map((i) => i.count))
  return (
    <div className="rounded-3xl border border-black/5 bg-white/70 p-4 backdrop-blur-sm">
      <div className="mb-2.5 text-sm font-semibold text-zinc-700">弱项分布</div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.type} className="flex items-center gap-2.5">
            <span className="w-12 shrink-0 text-[13px] text-zinc-600">{it.type}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
              <div className="h-full rounded-full bg-rose-400"
                style={{ width: `${Math.round((it.count / max) * 100)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-zinc-400">{it.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-zinc-400">按判分结果的错误类型聚合，帮你定位该补哪块</div>
    </div>
  )
}

/** 单句卡片：中文原句 + 英文输入 + 提交 → 就地展示判分（判定/分数/修正译文/中文讲解/逐点错误） */
function SentenceCard({ index, sentence, value, result, busy, onChange, onSubmit }: {
  index: number
  sentence: Sentence
  value: string
  result: Submission | null
  busy: boolean
  onChange: (v: string) => void
  onSubmit: () => void
}) {
  const accurate = result?.accurate === true
  const errors = result?.errors || []

  return (
    <article className="card border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md">
      {/* 中文原句 */}
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[11px] font-bold text-zinc-500">
          {index}
        </span>
        <p className="text-[15px] font-medium leading-relaxed text-zinc-800">{sentence.zh_text}</p>
        {result && (
          <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            accurate ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {accurate ? <Check size={12} /> : <X size={12} />}
            {accurate ? "准确" : "有误"}
            {result.score != null && <span className="ml-0.5">{result.score}</span>}
          </span>
        )}
      </div>

      {/* 英文输入 + 提交 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          className="input min-h-[44px] flex-1 resize-y leading-relaxed"
          rows={2}
          maxLength={2000}
          value={value}
          placeholder="在这里写出你的英文译文…"
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmit() }
          }}
        />
        <button onClick={onSubmit} disabled={busy} className="btn-primary h-11 shrink-0 sm:w-28">
          {busy
            ? <><Loader2 size={14} className="animate-spin" /> 批改中</>
            : <><Send size={14} /> {result ? "重新提交" : "提交批改"}</>}
        </button>
      </div>

      {/* 判分结果 */}
      {result && !busy && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-indigo-100/80 bg-indigo-50/40 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <Sparkles size={13} /> {MODE_LABEL[modeOf(result)]}
            {/* 本地对照/自评时明确标注，不假装是 AI 批改 */}
            {modeOf(result) !== "llm" && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                AI 批改不可用
              </span>
            )}
            <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 font-mono text-[11px] text-zinc-500">
              {result.score ?? "—"} / 100
            </span>
          </div>

          {result.corrected && (
            <div>
              <div className="mb-0.5 text-[11px] text-zinc-500">修正译文</div>
              <p className="text-sm leading-relaxed text-zinc-800">{result.corrected}</p>
            </div>
          )}

          {result.explanation && (
            <div>
              <div className="mb-0.5 text-[11px] text-zinc-500">讲解</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">{result.explanation}</p>
            </div>
          )}

          {errors.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] text-zinc-500">逐点错误（{errors.length}）</div>
              <ul className="flex flex-col gap-1.5">
                {errors.map((e, i) => (
                  <li key={i} className="rounded-xl border border-black/5 bg-white/75 px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.type && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">{e.type}</span>}
                      {e.original && <span className="font-mono text-xs text-rose-600 line-through">{e.original}</span>}
                      {e.suggestion && <span className="font-mono text-xs text-emerald-600">→ {e.suggestion}</span>}
                    </div>
                    {e.note && <p className="mt-1 leading-relaxed text-zinc-600">{e.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.updated_at && (
            <div className="text-right text-[10px] text-zinc-400">批改于 {result.updated_at}</div>
          )}
        </div>
      )}
    </article>
  )
}
