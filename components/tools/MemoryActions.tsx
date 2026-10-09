"use client"

/**
 * 工具内容区顶栏的操作按钮组：初始数据 / 导出 MD / 导出 JSON / 同步云端。
 *
 * 2026-10-10：效率工具从「游戏中心外壳」(/utils/*) 搬进主页内容区后，原 MemoryShell 的
 * 整页头被拆成两块——
 *   - 标题 / 描述 → 主页内容区顶栏（由 home/src/App.tsx 的 tab 定义提供）
 *   - 操作按钮    → 本组件，直接挂到顶栏右侧的 actions 槽
 * 之所以自包含（自己持 seed / sync 状态）：顶栏的 actions 由 App.tsx 在 tabs 数组里构造，
 * 拿不到工具组件的内部 state，所以这里不依赖任何外层。
 * 操作结果统一走 sonner toast（根 layout 已挂 <Toaster />），不再占内容区版面。
 */

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  download,
  isCLogin,
  listByKind,
  pushToCloud,
  toJSON,
  toMarkdown,
  type MemoryKind,
} from "@/lib/memory"
import { ensureSeed } from "@/lib/seed"

/** 导出文件名用的日期戳 yyyyMMdd */
function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

const BTN =
  "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"

export default function MemoryActions({ kind }: { kind: MemoryKind }) {
  const [logged, setLogged] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // 登录态探测失败也无所谓，只是隐掉同步按钮
  useEffect(() => {
    isCLogin().then(setLogged).catch(() => setLogged(false))
  }, [])

  const onSeed = useCallback(() => {
    const n = ensureSeed()
    if (n === 0) toast.success("初始数据已在库中（不会覆盖你改过的条目）")
    else toast.success(`已补入 ${n} 条初始数据`)
  }, [])

  const onExportMd = useCallback(() => {
    const items = listByKind(kind)
    if (!items.length) {
      toast.error("还没有可导出的内容")
      return
    }
    download(`memory-${kind}-${stamp()}.md`, toMarkdown(items))
  }, [kind])

  const onExportJson = useCallback(() => {
    const items = listByKind(kind)
    if (!items.length) {
      toast.error("还没有可导出的内容")
      return
    }
    download(`memory-${kind}-${stamp()}.json`, toJSON(items), "application/json;charset=utf-8")
  }, [kind])

  const onSync = useCallback(async () => {
    setSyncing(true)
    const ok = await pushToCloud()
    setSyncing(false)
    if (ok) toast.success("已同步到云端")
    else toast.error("同步失败（记忆仍在本地，不影响使用）")
  }, [])

  return (
    <>
      <button onClick={onSeed} className={BTN}>
        初始数据
      </button>
      <button onClick={onExportMd} className={BTN}>
        导出 MD
      </button>
      <button onClick={onExportJson} className={BTN}>
        导出 JSON
      </button>
      {logged && (
        <button onClick={onSync} disabled={syncing} className={`${BTN} text-indigo-500 disabled:opacity-50`}>
          {syncing ? "同步中…" : "同步云端"}
        </button>
      )}
    </>
  )
}
