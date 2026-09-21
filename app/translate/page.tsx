"use client"
// 每日英语翻译练习（C 端）：每天 0 点后端激活一组中文句子，按 3 阶梯逐句提交英文译文 → 大模型判分。
// 取数/回填 GET /api/translate/today；提交 POST /api/translate/submit（同人同日同句覆盖，可反复重交）。
// 登录墙由 ./layout.tsx 的 RequireAuth 负责，页面本体只管练习交互（风格照 app/trpg/play）。
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { apiJson, postJson } from "@/lib/api"
import { useRequireAuth } from "@/lib/auth"
import { TIER_STYLE, type Sentence, type Submission, type TodayPayload } from "@/lib/translate"
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Send, Sparkles, X } from "lucide-react"

export default function TranslatePage() {
  const { state } = useRequireAuth()
  const [data, setData] = useState<TodayPayload | null>(null)
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

  useEffect(() => { if (state === "ok") load() }, [state, load])

  async function submit(s: Sentence) {
    const text = (drafts[s.id] || "").trim()
    if (!text) { toast.warning("请先输入英文译文"); return }
    setBusyId(s.id)
    try {
      const j = await postJson("/api/translate/submit", { sentence_id: s.id, en_text: text })
      const sub: Submission = {
        en_text: j.en_text, accurate: j.accurate, score: j.score,
        corrected: j.corrected, explanation: j.explanation, errors: j.errors || [],
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
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-6">
      {/* ===== 头部：今日组标题 + 日期 + 进度 ===== */}
      <div className="mb-5 flex flex-col gap-2">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-zinc-800">
          🌐 每日英语翻译练习
        </h1>
        {data?.group ? (
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
            <Sparkles size={13} /> AI 批改
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
