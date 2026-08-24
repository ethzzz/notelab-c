"use client"
import { scenarioStats, type ScenarioData } from "@/lib/trpg"

/** 剧本结构预览（生成结果 / 剧本库查看共用） */
export default function ScenarioPreview({ scenario }: { scenario: ScenarioData }) {
  const st = scenarioStats(scenario)
  const nodes = scenario.nodes || []
  return (
    <div className="flex flex-col gap-3">
      <div className="text-lg font-bold text-zinc-800">📜 {scenario.title}</div>
      {scenario.intro && <p className="text-sm text-zinc-600 leading-relaxed">{scenario.intro}</p>}
      <div className="flex gap-2 flex-wrap text-[11px] text-zinc-500">
        <span className="bg-black/[0.04] rounded-full px-2 py-0.5">🗺 {st.scenes} 场景</span>
        <span className="bg-black/[0.04] rounded-full px-2 py-0.5">🔀 {st.endings} 结局</span>
        <span className="bg-black/[0.04] rounded-full px-2 py-0.5">🎲 {st.dice} 检定</span>
      </div>
      {(scenario.characters || []).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(scenario.characters || []).map((c) => (
            <span key={c.name} title={c.desc} className="text-xs bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 text-indigo-700 rounded-full px-2.5 py-1">👤 {c.name}</span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 mt-1 max-h-72 overflow-y-auto pr-1">
        {nodes.map((n, i) => (
          <div key={n.id} className="flex items-center gap-2 text-xs text-zinc-500 bg-white/50 rounded-lg px-2.5 py-1.5">
            <span className="text-zinc-400 w-5 shrink-0">{i + 1}.</span>
            <span className="font-medium text-zinc-700 truncate">{n.title}</span>
            {n.ending
              ? <span className="ml-auto shrink-0 text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">🏁 结局</span>
              : <span className="ml-auto shrink-0">{(n.choices || []).length} 选项</span>}
          </div>
        ))}
      </div>
    </div>
  )
}