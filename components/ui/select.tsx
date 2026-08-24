"use client"
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

/**
 * Select —— 公共下拉选择组件（替代原生 select）
 * - 毛玻璃下拉面板 + lucide 箭头/对勾图标，支持深色主题适配层
 * - options 支持字符串数组或 { value, label, icon?, desc? }
 * - 支持键盘操作：↑↓ 移动、Enter 选择、Esc 关闭
 */
export type SelectOption = { value: string; label: string; icon?: string; desc?: string }

export default function Select({ value, onChange, options, placeholder = "请选择", className = "", disabled = false, size = "md" }: {
  value: string
  onChange: (v: string) => void
  options: (SelectOption | string)[]
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: "sm" | "md"
}) {
  const opts: SelectOption[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = opts.find((o) => o.value === value) || null

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])

  function toggle() {
    if (disabled) return
    setOpen((o) => {
      if (!o) setHi(Math.max(0, opts.findIndex((x) => x.value === value)))
      return !o
    })
  }
  function pick(v: string) { onChange(v); setOpen(false) }
  function onKeyNav(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle() }
      return
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(opts.length - 1, h + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && hi < opts.length) pick(opts[hi].value) }
  }

  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2.5 text-sm"
  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyNav}>
      <button type="button" disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
        className={`w-full flex items-center gap-2 rounded-xl border transition outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${pad} ${open ? "border-indigo-500 bg-white/90" : "border-zinc-300/70 bg-white/75 hover:border-indigo-400/70"} text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed`}>
        {selected?.icon && <span className="leading-none">{selected.icon}</span>}
        <span className={`flex-1 text-left truncate ${selected ? "" : "text-zinc-400"}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={size === "sm" ? 13 : 15} className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox"
          className="absolute z-50 mt-1.5 w-full min-w-[10rem] max-h-64 overflow-y-auto rounded-xl border border-black/5 bg-white/95 backdrop-blur-xl shadow-xl shadow-black/10 p-1 select-none">
          {opts.length === 0 && <div className="text-zinc-400 text-xs text-center py-2">无选项</div>}
          {opts.map((o, i) => {
            const active = o.value === value
            return (
              <button key={o.value} type="button" role="option" aria-selected={active}
                onClick={() => pick(o.value)} onMouseEnter={() => setHi(i)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 ${size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm"} text-left transition-colors ${hi === i ? "bg-indigo-50" : ""} ${active ? "text-indigo-600 font-medium" : "text-zinc-700"}`}>
                {o.icon && <span className="leading-none">{o.icon}</span>}
                <span className="flex-1 truncate">{o.label}</span>
                {active && <Check size={14} className="shrink-0 text-indigo-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}