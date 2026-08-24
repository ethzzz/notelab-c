"use client"
// C 端 TRPG 剧本列表：仅展示已发布剧本；开局跳转 /trpg/play?sid=X（游玩页自动开局，与 myapp 行为一致）
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiJson } from "@/lib/api"
import { useRequireAuth } from "@/lib/auth"
import Modal from "@/components/ui/modal"
import ScenarioPreview from "@/components/ScenarioPreview"
import type { ScenarioData, ScenarioRow } from "@/lib/trpg"
import { BookOpen, Eye, Play, RotateCcw } from "lucide-react"

export default function TrpgListPage() {
  const router = useRouter()
  const { state } = useRequireAuth()
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [plays, setPlays] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [preview, setPreview] = useState<{ row: ScenarioRow; scenario: ScenarioData } | null>(null)
  const [previewBusy, setPreviewBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    apiJson("/api/c/trpg/scenarios").then((j) => setScenarios(j.scenarios || [])).catch(() => {})
    apiJson("/api/c/trpg/plays").then((j) => setPlays(j.plays || [])).catch(() => {})
    setLoaded(true)
  }, [])
  useEffect(() => { if (state === "ok") load() }, [state, load])

  async function openPreview(row: ScenarioRow) {
    setPreviewBusy(row.id)
    try {
      const j = await apiJson(`/api/c/trpg/scenarios/${row.id}`)
      setPreview({ row, scenario: j.scenario })
    } catch {
      setPreview({ row, scenario: { title: row.title, nodes: [] } })
    }
    setPreviewBusy(null)
  }

  if (state !== "ok") {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
        <span className="inline-block h-8 w-8 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const playing = plays.filter((p) => p.state === "playing")

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-zinc-800">🎲 TRPG 文字冒险</h1>
        <p className="text-sm text-zinc-500">挑一个剧本开始冒险，每一次选择都将左右命运的走向</p>
      </div>

      {/* 进行中的冒险 */}
      {playing.length > 0 && (
        <div className="mb-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 backdrop-blur-sm">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><RotateCcw size={13} /> 你有 {playing.length} 场冒险进行中</div>
          <div className="flex flex-col gap-2">
            {playing.map((p) => (
              <Link key={p.id} href="/trpg/play"
                className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-4 py-2.5 transition-all hover:border-emerald-400 hover:shadow-sm">
                <span className="text-sm font-medium text-emerald-700">▶ {p.scenario_title}</span>
                <span className="ml-auto text-[11px] text-zinc-400">{p.steps} 步 · 点击继续</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 剧本卡片 */}
      {scenarios.length === 0 ? (
        loaded && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-black/5 bg-white/60 py-16 backdrop-blur-sm">
            <span className="text-5xl">📭</span>
            <div className="text-base font-semibold text-zinc-600">还没有发布的剧本</div>
            <div className="text-xs text-zinc-400">剧本发布后会出现在这里，敬请期待</div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scenarios.map((s) => (
            <div key={s.id} className="card flex flex-col gap-3 border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-zinc-800">📜 {s.title}</span>
                {s.genre && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-600">{s.genre}</span>}
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{String(s.created_at || "").slice(0, 10)}</span>
              </div>
              {s.summary && <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-zinc-500">{s.summary}</p>}
              <div className="mt-1 flex items-center gap-2">
                <button onClick={() => openPreview(s)} disabled={previewBusy === s.id} className="btn-ghost flex-1 py-2 text-xs">
                  {previewBusy === s.id
                    ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500" />
                    : <Eye size={14} />}
                  预览
                </button>
                <Link href={`/trpg/play?sid=${s.id}`} className="btn-primary flex-1 py-2 text-xs">
                  <Play size={14} /> 开始游玩
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 结构预览弹窗 */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="🔍 剧本预览" maxW="max-w-xl">
        {preview && <ScenarioPreview scenario={preview.scenario} />}
      </Modal>
    </div>
  )
}
