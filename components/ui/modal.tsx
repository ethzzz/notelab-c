"use client"
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

/** 公共弹窗：统一遮罩/Esc 关闭/点击外部关闭/portal 挂载（所有弹窗统一用它） */
export default function Modal({ open, onClose, title, children, maxW = "max-w-sm" }: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  maxW?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  if (typeof window === "undefined" || !open) return null
  return createPortal(
    <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl p-5 w-full ${maxW} max-h-[80vh] overflow-y-auto shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        {title != null && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-zinc-900">{title}</h3>
            <button className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-black/5 hover:text-zinc-600 transition" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}