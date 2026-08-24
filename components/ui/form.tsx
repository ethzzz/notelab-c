"use client"
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

/** 表单字段容器：标题（可带必填星号）+ 控件 + 辅助说明 */
export function FormField({ label, required = false, hint, children, className = "" }: {
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-zinc-400">{hint}</span>}
    </div>
  )
}

/** 单行输入框（可选左侧图标） */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  function TextInput({ icon, className, ...props }, ref) {
    if (!icon) return <input ref={ref} className={cn("input", className)} {...props} />
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span>
        <input ref={ref} className={cn("input pl-9", className)} {...props} />
      </div>
    )
  }
)

/** 多行输入框 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn("input resize-none", className)} {...props} />
  }
)

/** 密码输入框（自带显示/隐藏切换，可选左侧图标与 TextInput 对齐） */
export function PasswordInput({ icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span>}
      <input type={show ? "text" : "password"} className={cn("input pr-10", icon && "pl-9", className)} {...props} />
      <button type="button" tabIndex={-1} onClick={() => setShow(!show)} aria-label={show ? "隐藏密码" : "显示密码"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-black/5 hover:text-zinc-600">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

/** 表单操作栏：右对齐的 取消/确认 按钮组（确认按钮带忙碌态） */
export function FormActions({ onCancel, onConfirm, busy = false, cancelText = "取消", confirmText = "确定", busyText = "处理中…" }: {
  onCancel?: () => void
  onConfirm: () => void
  busy?: boolean
  cancelText?: string
  confirmText?: string
  busyText?: string
}) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      {onCancel && <button className="btn-ghost" onClick={onCancel} disabled={busy}>{cancelText}</button>}
      <button className="btn-primary" onClick={onConfirm} disabled={busy}>
        {busy && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {busy ? busyText : confirmText}
      </button>
    </div>
  )
}