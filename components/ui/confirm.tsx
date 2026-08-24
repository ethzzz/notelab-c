"use client"
import { useEffect, useState } from "react"
import Modal from "./modal"

type ConfirmOptions = { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }
type PendingState = ConfirmOptions & { resolve: (ok: boolean) => void }

let openFn: ((s: PendingState) => void) | null = null

/**
 * 命令式确认弹窗（替代 window.confirm，支持主题样式）：
 * const ok = await confirmDialog({ message: "删除这个对话？", confirmText: "删除" })
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !openFn) { resolve(window.confirm(opts.message)); return }
    openFn({ ...opts, resolve })
  })
}

/** 全局挂载点（已放在根布局，无需重复挂载） */
export function ConfirmHost() {
  const [state, setState] = useState<PendingState | null>(null)
  useEffect(() => { openFn = setState; return () => { openFn = null } }, [])
  if (!state) return null
  const close = (ok: boolean) => { state.resolve(ok); setState(null) }
  return (
    <Modal open onClose={() => close(false)} title={state.title || "请确认"}>
      <div className="text-sm text-zinc-600 mb-5 whitespace-pre-wrap">{state.message}</div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => close(false)}>{state.cancelText || "取消"}</button>
        <button className={state.danger === false ? "btn-primary" : "btn-danger"} onClick={() => close(true)}>{state.confirmText || "确定"}</button>
      </div>
    </Modal>
  )
}